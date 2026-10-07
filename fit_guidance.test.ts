import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendSize,
  buildFitPromptGuidance,
  applyFitGuidanceToPrompt,
  describeFitDifference,
  describeHemPosition,
  sortSizeRows,
  getEaseAllowance,
  EXACT_PROPORTIONS_INVARIANT,
  type SizeChart,
  type SizeRow,
} from './fit_guidance.js';

const SAMPLE_CHART: SizeChart = {
  fitType: 'regular', // +6 cm
  rows: [
    { size: 'XS', bust: 82, waist: 64, hips: 90, length: 85 },
    { size: 'S', bust: 86, waist: 68, hips: 94, length: 86 },
    { size: 'M', bust: 90, waist: 72, hips: 98, length: 88 },
    { size: 'L', bust: 96, waist: 78, hips: 104, length: 90 },
    { size: 'XL', bust: 102, waist: 84, hips: 110, length: 92 },
  ],
};

test('Ease allowances follow the specification', () => {
  assert.equal(getEaseAllowance('slim'), 3);
  assert.equal(getEaseAllowance('regular'), 6);
  assert.equal(getEaseAllowance('relaxed'), 10);
});

test('Size recommendation selects smallest matching size and names tightest zone in smaller size', () => {
  // Customer: bust 83, waist 65, hips 91
  // With regular ease (+6): target bust 89, target waist 71, target hips 97
  // XS: 82, 64, 90 (all too small)
  // S: 86, 68, 94 (bust deficit: 89 - 86 = 3, waist deficit: 71 - 68 = 3, hips deficit: 97 - 94 = 3)
  // M: 90, 72, 98 -> 90 >= 89, 72 >= 71, 98 >= 97 -> FITS!
  const rec = recommendSize(SAMPLE_CHART, { bust: 83, waist: 65, hips: 91 });
  assert.equal(rec.recommendedSize, 'M');
  assert.match(rec.explanationBg, /Препоръчваме размер M/);
  assert.match(rec.explanationBg, /S ще стяга/);
});

test('Tightest zone detection identifies bust, waist, or hips', () => {
  // Case where bust is tightest on smaller size:
  // Customer: bust 84 (target 90), waist 62 (target 68), hips 88 (target 94)
  // Size S has bust 86 (deficit 4), waist 68 (deficit 0), hips 94 (deficit 0)
  // Size M has bust 90, waist 72, hips 98 -> M fits, S has deficit only in bust
  const recBust = recommendSize(SAMPLE_CHART, { bust: 84, waist: 62, hips: 88 });
  assert.equal(recBust.recommendedSize, 'M');
  assert.equal(recBust.smallerSize, 'S');
  assert.equal(recBust.tightestZoneBg, 'в гърдите');
  assert.equal(recBust.explanationBg, 'Препоръчваме размер M. S ще стяга в гърдите.');

  // Case where waist is tightest on smaller size:
  // Customer: bust 80 (target 86), waist 66 (target 72), hips 88 (target 94)
  // Size S has bust 86 (def 0), waist 68 (def 4), hips 94 (def 0)
  // Size M fits (90, 72, 98)
  const recWaist = recommendSize(SAMPLE_CHART, { bust: 80, waist: 66, hips: 88 });
  assert.equal(recWaist.recommendedSize, 'M');
  assert.equal(recWaist.tightestZoneBg, 'в талията');
  assert.equal(recWaist.explanationBg, 'Препоръчваме размер M. S ще стяга в талията.');

  // Case where hips is tightest on smaller size:
  // Customer: bust 80 (target 86), waist 60 (target 66), hips 92 (target 98)
  // Size S has bust 86 (def 0), waist 68 (def 0), hips 94 (def 4)
  // Size M fits (90, 72, 98)
  const recHips = recommendSize(SAMPLE_CHART, { bust: 80, waist: 60, hips: 92 });
  assert.equal(recHips.recommendedSize, 'M');
  assert.equal(recHips.tightestZoneBg, 'в ханша');
  assert.equal(recHips.explanationBg, 'Препоръчваме размер M. S ще стяга в ханша.');
});

test('Smallest size recommendation when XS fits', () => {
  const rec = recommendSize(SAMPLE_CHART, { bust: 74, waist: 56, hips: 82 });
  assert.equal(rec.recommendedSize, 'XS');
  assert.equal(rec.explanationBg, 'Препоръчваме размер XS.');
});

test('Empty measurements return no recommendation', () => {
  const rec = recommendSize(SAMPLE_CHART, {});
  assert.equal(rec.recommendedSize, null);
  assert.equal(rec.explanationBg, '');
});

test('Row sorting orders smallest to largest', () => {
  const unordered: SizeRow[] = [
    { size: 'XL', bust: 102, waist: 84, hips: 110 },
    { size: 'S', bust: 86, waist: 68, hips: 94 },
    { size: 'XS', bust: 82, waist: 64, hips: 90 },
    { size: 'M', bust: 90, waist: 72, hips: 98 },
    { size: 'L', bust: 96, waist: 78, hips: 104 },
  ];
  const sorted = sortSizeRows(unordered);
  assert.deepEqual(
    sorted.map((r) => r.size),
    ['XS', 'S', 'M', 'L', 'XL']
  );
});

test('Fit guidance computes tight, fabric pulling, close-fitting, relaxed, loose correctly', () => {
  assert.equal(describeFitDifference(79, 80), 'tight, fabric pulling'); // diff -1 < 0
  assert.equal(describeFitDifference(80, 80), 'close-fitting'); // diff 0 <= 4
  assert.equal(describeFitDifference(84, 80), 'close-fitting'); // diff 4 <= 4
  assert.equal(describeFitDifference(88, 80), 'relaxed'); // diff 8 <= 10
  assert.equal(describeFitDifference(92, 80), 'loose'); // diff 12 > 10
});

test('Hem position is calculated relative to height', () => {
  // 88 cm dress on 170 cm person: ratio 88/170 = 0.517 -> hem just above the knee
  assert.equal(describeHemPosition(88, 170), 'hem just above the knee');
  // 60 cm top on 170 cm person: ratio 60/170 = 0.352 -> hem at waist/hip level
  assert.equal(describeHemPosition(60, 170), 'hem at waist/hip level');
  // 105 cm dress on 170 cm person: ratio 105/170 = 0.617 -> hem at the knee
  assert.equal(describeHemPosition(105, 170), 'hem at the knee');
});

test('buildFitPromptGuidance includes concrete numbers, hem position and invariant', () => {
  const guidance = buildFitPromptGuidance(
    SAMPLE_CHART,
    'M',
    { height: 170, bust: 84, waist: 70, hips: 94 }
  );

  // M row: bust 90, waist 72, hips 98, length 88
  // bust diff: 90 - 84 = 6 -> relaxed
  // waist diff: 72 - 70 = 2 -> close-fitting
  // hips diff: 98 - 94 = 4 -> close-fitting
  // hem: 88/170 -> hem just above the knee
  assert.match(guidance, /At the bust, the garment is relaxed/);
  assert.match(guidance, /At the waist, the garment is close-fitting/);
  assert.match(guidance, /At the hips, the garment is close-fitting/);
  assert.match(guidance, /hem just above the knee/);
  assert.ok(guidance.includes(EXACT_PROPORTIONS_INVARIANT));
});

test('applyFitGuidanceToPrompt appends guidance without duplicating invariant', () => {
  const base = 'High-end editorial fashion shoot.';
  const withGuidance = applyFitGuidanceToPrompt(
    base,
    SAMPLE_CHART,
    'S',
    { height: 165, bust: 82, waist: 66, hips: 90 }
  );
  assert.ok(withGuidance.startsWith(base));
  assert.ok(withGuidance.includes(EXACT_PROPORTIONS_INVARIANT));

  // If called again, does not duplicate
  const second = applyFitGuidanceToPrompt(withGuidance, SAMPLE_CHART, 'S', { height: 165 });
  assert.equal(second, withGuidance);
});

test('saveSizeChartForCode and getSizeChartForCode persist and checkAccessCode returns sizeChart', async () => {
  const { saveSizeChartForCode, getSizeChartForCode, checkAccessCode } = await import('./access_control.js');
  const code = 'test';

  const saved = await saveSizeChartForCode(code, SAMPLE_CHART);
  assert.ok(saved);
  assert.equal(saved.fitType, 'regular');
  assert.equal(saved.rows.length, 5);

  const retrieved = await getSizeChartForCode(code);
  assert.ok(retrieved);
  assert.equal(retrieved.fitType, 'regular');
  assert.equal(retrieved.rows[0].size, 'XS');

  const status = await checkAccessCode(code);
  assert.ok(status.valid);
  assert.ok(status.sizeChart);
  assert.equal(status.sizeChart.fitType, 'regular');
  assert.equal(status.sizeChart.rows.length, 5);
});

