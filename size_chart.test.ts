import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  EASE_CM,
  SIZE_RESULT_NOTE,
  applyFitRequest,
  classifyEase,
  describeHem,
  interpretMeasurements,
  recommendSize,
  validateSizeChart,
  type BodyMeasurements,
  type SizeChart,
} from './size_chart.ts';
import { applyAddCredits, applyAttach, applyCommitTask, applyReserve, applyReset, applySetSizeChart, emptyState } from './usage_logic.ts';
import { createFileBackend } from './usage_store.ts';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');

const body: BodyMeasurements = { height: 168, bust: 88, waist: 70, hips: 96 };

function chart(fit: SizeChart['fit'], sizes: SizeChart['sizes']): SizeChart {
  return { fit, sizes };
}

const sampleSizes: SizeChart['sizes'] = [
  { label: 'S', bust: 90, waist: 74, hips: 100, length: 90 },
  { label: 'M', bust: 96, waist: 80, hips: 106, length: 92 },
  { label: 'L', bust: 104, waist: 88, hips: 114, length: 94 },
];

test('ease stays ordered: fitted inside 2–4 cm, then regular, then loose', () => {
  assert.ok(EASE_CM.fitted >= 2 && EASE_CM.fitted <= 4);
  assert.ok(EASE_CM.regular > EASE_CM.fitted);
  assert.ok(EASE_CM.loose > EASE_CM.regular);
});

test('fitted chart picks the smallest size and names where the previous size binds', () => {
  const result = recommendSize(chart('fitted', sampleSizes), body);
  assert.equal(result.sizeLabel, 'M');
  assert.equal(result.fits, true);
  assert.deepEqual(result.tightZones, ['bust']);
  assert.equal(result.message, 'Препоръчваме размер M. S ще стяга в гърдите.');
});

test('a size must clear bust, waist and hips together', () => {
  const sizes: SizeChart['sizes'] = [
    { label: 'S', bust: 100, waist: 80, hips: 90, length: 80 },
    { label: 'M', bust: 100, waist: 80, hips: 110, length: 82 },
  ];
  const result = recommendSize(chart('fitted', sizes), { height: 170, bust: 90, waist: 70, hips: 100 });
  assert.equal(result.sizeLabel, 'M');
  assert.equal(result.message, 'Препоръчваме размер M. S ще стяга в ханша.');
});

test('two tight zones are joined in Bulgarian', () => {
  const sizes: SizeChart['sizes'] = [
    { label: 'S', bust: 88, waist: 70, hips: 110, length: 80 },
    { label: 'M', bust: 100, waist: 84, hips: 112, length: 82 },
  ];
  const result = recommendSize(chart('fitted', sizes), { height: 170, bust: 90, waist: 72, hips: 96 });
  assert.equal(result.message, 'Препоръчваме размер M. S ще стяга в гърдите и талията.');
});

test('loose fit needs more room than fitted, so it steps up a size', () => {
  const fitted = recommendSize(chart('fitted', sampleSizes), body);
  const loose = recommendSize(chart('loose', sampleSizes), body);
  assert.equal(fitted.sizeLabel, 'M');
  assert.equal(loose.sizeLabel, 'L');
  assert.equal(loose.message, 'Препоръчваме размер L. M ще стяга в гърдите.');
});

test('the smallest size is recommended on its own when it already fits', () => {
  const result = recommendSize(chart('loose', sampleSizes), {
    height: 160,
    bust: 70,
    waist: 58,
    hips: 80,
  });
  assert.equal(result.sizeLabel, 'S');
  assert.equal(result.fits, true);
  assert.equal(result.message, 'Препоръчваме размер S.');
  assert.equal(result.message.includes('ще стяга'), false);
});

test('when nothing covers, the largest size is named and the tight zones are listed', () => {
  const result = recommendSize(chart('fitted', sampleSizes), {
    height: 180,
    bust: 110,
    waist: 96,
    hips: 120,
  });
  assert.equal(result.fits, false);
  assert.equal(result.sizeLabel, 'L');
  assert.equal(
    result.message,
    'Няма размер, който покрива мерките. Най-близък е L — ще стяга в гърдите, талията и ханша.'
  );
});

test('an exact ease boundary counts as a fit, and height does not change the size', () => {
  const sizes: SizeChart['sizes'] = [{ label: 'M', bust: 91, waist: 73, hips: 99, length: 90 }];
  const short = recommendSize(chart('fitted', sizes), body);
  const tall = recommendSize(chart('fitted', sizes), { ...body, height: 185 });
  assert.equal(body.bust + EASE_CM.fitted, 91);
  assert.equal(short.fits, true);
  assert.equal(short.sizeLabel, 'M');
  assert.equal(tall.sizeLabel, short.sizeLabel);
});

test('chart order is the size order, from the first row to the last', () => {
  const reversed: SizeChart['sizes'] = [
    { label: 'L', bust: 104, waist: 88, hips: 114, length: 94 },
    { label: 'S', bust: 90, waist: 74, hips: 100, length: 90 },
  ];
  const result = recommendSize(chart('fitted', reversed), body);
  assert.equal(result.sizeLabel, 'L');
});

test('hem position follows garment length against height', () => {
  assert.equal(describeHem(170, 83), 'above the knee');
  assert.equal(describeHem(170, 75), 'at mid-thigh');
  assert.equal(describeHem(170, 90), 'at the knee');
  assert.equal(classifyEase(-1), 'tight');
  assert.equal(classifyEase(2), 'close');
  assert.equal(classifyEase(6), 'relaxed');
  assert.equal(classifyEase(12), 'loose');
});

test('fit guidance states zone differences, hem, body, and garment fidelity', () => {
  const text = applyFitRequest(
    {
      prompt: 'lookbook',
      fit_request: { size: 'm', height: 170, bust: 88, waist: 70, hips: 96 },
    },
    chart('regular', [{ label: 'M', bust: 96, waist: 76, hips: 102, length: 83 }])
  );
  assert.equal('fit_request' in text, false);
  const prompt = String(text.prompt);
  assert.ok(prompt.startsWith('lookbook\n\n'));
  assert.match(prompt, /render size M from the regular size chart/);
  assert.match(prompt, /Bust: garment 96 cm, body 88 cm, difference 8 cm \(relaxed\)\./);
  assert.match(prompt, /Waist: garment 76 cm, body 70 cm, difference 6 cm \(relaxed\)\./);
  assert.match(prompt, /Hips: garment 102 cm, body 96 cm, difference 6 cm \(relaxed\)\./);
  assert.match(prompt, /Garment length 83 cm on a person 170 cm tall: the hem falls above the knee\./);
  assert.match(prompt, /footwear exactly as in the second reference photo/);
  assert.match(prompt, /cut, length, neckline, sleeves, pattern, and details exactly as in the first reference photo/);
  assert.equal(prompt.includes('seed'), false);
  assert.equal(prompt.includes('temperature'), false);
});

test('without a chart, or with an unknown size, the prompt is unchanged and fit_request is dropped', () => {
  const input = { prompt: 'lookbook', img_urls: ['https://example.com/a.png'], fit_request: { size: 'M', height: 170, bust: 88, waist: 70, hips: 96 } };
  const missing = applyFitRequest(input, null);
  assert.equal(missing.prompt, 'lookbook');
  assert.equal('fit_request' in missing, false);
  assert.deepEqual(missing.img_urls, input.img_urls);

  const unknown = applyFitRequest(
    { ...input, fit_request: { size: 'XL', height: 170, bust: 88, waist: 70, hips: 96 } },
    chart('fitted', sampleSizes)
  );
  assert.equal(unknown.prompt, 'lookbook');
  assert.equal('fit_request' in unknown, false);
  assert.equal(input.prompt, 'lookbook');
});

test('measurements accept a decimal comma and reject an incomplete or absurd set', () => {
  assert.deepEqual(interpretMeasurements({ height: '168', bust: '88,5', waist: '70', hips: '96' }), {
    status: 'ok',
    body: { height: 168, bust: 88.5, waist: 70, hips: 96 },
  });
  assert.equal(interpretMeasurements({ height: '', bust: '', waist: '', hips: '' }).status, 'empty');
  assert.equal(interpretMeasurements({ height: '168', bust: '', waist: '', hips: '' }).status, 'incomplete');
  assert.equal(interpretMeasurements({ height: '50', bust: '88', waist: '70', hips: '96' }).status, 'invalid');
});

test('chart validation rejects duplicates and incomplete rows', () => {
  const bad = validateSizeChart({
    fit: 'regular',
    sizes: [{ label: 'M', bust: '90', waist: '70', hips: '96', length: '' }],
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /сантиметри/);

  const duplicate = validateSizeChart({
    fit: 'regular',
    sizes: [
      { label: 'M', bust: 90, waist: 70, hips: 96, length: 80 },
      { label: 'm', bust: 94, waist: 74, hips: 100, length: 90 },
    ],
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.match(duplicate.error, /повтаря/);

  const good = validateSizeChart({
    fit: 'loose',
    sizes: [{ label: ' XL ', bust: '100,5', waist: 80, hips: 108, length: 95 }],
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.chart.fit, 'loose');
    assert.deepEqual(good.chart.sizes[0], { label: 'XL', bust: 100.5, waist: 80, hips: 108, length: 95 });
  }
});

test('saving a chart does not change credits, and credits do not drop the chart', () => {
  const saved = validateSizeChart({
    fit: 'regular',
    sizes: sampleSizes,
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;

  const withChart = applySetSizeChart(emptyState(), 'test', saved.chart, NOW);
  assert.equal(withChart.balance.remaining, 3);
  assert.equal(withChart.balance.used, 0);

  const reserved = applyReserve(withChart.state, 'test', 'res_1', { now: NOW, known: true });
  assert.equal(reserved.outcome.ok, true);
  assert.deepEqual(reserved.state.codes.test.sizeChart, saved.chart);

  const attached = applyAttach(reserved.state, 'res_1', 'task_1');
  const committed = applyCommitTask(attached.state, 'task_1', NOW);
  assert.equal(committed.outcome.counted, true);
  assert.deepEqual(committed.state.codes.test.sizeChart, saved.chart);

  const boosted = applyAddCredits(committed.state, 'test', 3, NOW);
  assert.equal(boosted.balance.totalAllowed, 6);
  assert.deepEqual(boosted.state.codes.test.sizeChart, saved.chart);

  const reset = applyReset(boosted.state, 'test', NOW);
  assert.equal(reset.balance.used, 0);
  assert.deepEqual(reset.state.codes.test.sizeChart, saved.chart);

  const cleared = applySetSizeChart(reset.state, 'test', null, NOW);
  assert.equal(cleared.state.codes.test.sizeChart, undefined);
  assert.equal(cleared.balance.totalAllowed, 6);
});

test('the file store keeps the chart beside the try counter', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'size-chart-'));
  const backend = createFileBackend(path.join(dir, 'usage.json'));
  const saved = validateSizeChart({ fit: 'fitted', sizes: sampleSizes });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;

  await backend.setSizeChart('test', saved.chart);
  assert.deepEqual(await backend.getSizeChart('test'), saved.chart);
  const before = await backend.check('test', true);
  assert.equal(before.remaining, 3);
  assert.equal(before.used, 0);

  const reserved = await backend.reserve('test', true);
  assert.equal(reserved.ok, true);
  await backend.addCredits('test', 3);
  assert.deepEqual(await backend.getSizeChart('test'), saved.chart);
  await backend.reset('test');
  const balance = await backend.check('test', true);
  assert.equal(balance.used, 0);
  assert.equal(balance.remaining, 6);
  assert.deepEqual(await backend.getSizeChart('test'), saved.chart);

  await backend.setSizeChart('test', null);
  assert.equal(await backend.getSizeChart('test'), null);
  const after = await backend.check('test', true);
  assert.equal(after.totalAllowed >= 3, true);
});

test('the result note is the agreed Bulgarian line', () => {
  assert.equal(
    SIZE_RESULT_NOTE,
    'Пробата е ориентировъчна – за размера се доверете на препоръката по мерки.'
  );
});
