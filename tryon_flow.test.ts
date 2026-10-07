import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendSize,
  buildFitPromptGuidance,
  applyFitGuidanceToPrompt,
  describeFitDifference,
  describeHemPosition,
  getEaseAllowance,
  EXACT_PROPORTIONS_INVARIANT,
  type SizeChart,
} from './fit_guidance.js';
import {
  hashString,
  hashImage,
  buildConsistencyCacheKey,
} from './src/lib/tryonStorage.js';

const SAMPLE_CHART: SizeChart = {
  fitType: 'regular',
  rows: [
    { size: 'XS', bust: 82, waist: 64, hips: 90, length: 85 },
    { size: 'S', bust: 86, waist: 68, hips: 94, length: 86 },
    { size: 'M', bust: 90, waist: 72, hips: 98, length: 88 },
    { size: 'L', bust: 96, waist: 78, hips: 104, length: 90 },
    { size: 'XL', bust: 102, waist: 84, hips: 110, length: 92 },
  ],
};

test('Ease allowances follow specifications for slim, regular, relaxed', () => {
  assert.equal(getEaseAllowance('slim'), 3);
  assert.equal(getEaseAllowance('regular'), 6);
  assert.equal(getEaseAllowance('relaxed'), 10);
});

test('Recommendation with slim ease (+3 cm)', () => {
  const slimChart: SizeChart = { ...SAMPLE_CHART, fitType: 'slim' };
  // Customer: bust 83, waist 65, hips 91
  // Targets: bust 86, waist 68, hips 94 -> matches S exactly (86, 68, 94)
  const rec = recommendSize(slimChart, { bust: 83, waist: 65, hips: 91 });
  assert.equal(rec.recommendedSize, 'S');
});

test('Recommendation with relaxed ease (+10 cm)', () => {
  const relaxedChart: SizeChart = { ...SAMPLE_CHART, fitType: 'relaxed' };
  // Customer: bust 83, waist 65, hips 91
  // Targets: bust 93, waist 75, hips 101 -> S(86), M(90) are too small; L(96, 78, 104) fits!
  const rec = recommendSize(relaxedChart, { bust: 83, waist: 65, hips: 91 });
  assert.equal(rec.recommendedSize, 'L');
});

test('Fit difference wording matches <0 tight, 0-4 close-fitting, 4-10 relaxed, >10 loose', () => {
  assert.equal(describeFitDifference(80, 85), 'tight, fabric pulling'); // -5
  assert.equal(describeFitDifference(80, 81), 'tight, fabric pulling'); // -1
  assert.equal(describeFitDifference(80, 80), 'close-fitting'); // 0
  assert.equal(describeFitDifference(84, 80), 'close-fitting'); // 4
  assert.equal(describeFitDifference(85, 80), 'relaxed'); // 5
  assert.equal(describeFitDifference(90, 80), 'relaxed'); // 10
  assert.equal(describeFitDifference(91, 80), 'loose'); // 11
});

test('Hem position calculates key positions from length and height', () => {
  assert.equal(describeHemPosition(88, 170), 'hem just above the knee');
  assert.equal(describeHemPosition(125, 170), 'hem at mid-calf');
});

test('Invariant sentence matches exact specification', () => {
  assert.equal(
    EXACT_PROPORTIONS_INVARIANT,
    "Always keep the person's face, body proportions, pose, background and footwear unchanged, and keep the garment's cut, color, pattern and details exactly as in the garment image."
  );
});

test('Consistency cache key format integrates image hashes, chosen size and measurements', () => {
  const personImg = { url: 'https://cdn.example.com/person1.jpg', filename: 'me.jpg', size: 102400 };
  const garmentImg = { url: 'https://cdn.example.com/garment1.jpg', filename: 'dress.jpg', size: 204800 };
  const measurements = { height: 170, bust: 86, waist: 68, hips: 94 };

  const key1 = buildConsistencyCacheKey(personImg, garmentImg, 'M', measurements);
  const key2 = buildConsistencyCacheKey(personImg, garmentImg, 'M', measurements);
  assert.equal(key1, key2);

  // Different size yields different key
  const key3 = buildConsistencyCacheKey(personImg, garmentImg, 'L', measurements);
  assert.notEqual(key1, key3);

  // Different measurement yields different key
  const key4 = buildConsistencyCacheKey(personImg, garmentImg, 'M', { ...measurements, bust: 90 });
  assert.notEqual(key1, key4);
});
