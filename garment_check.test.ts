import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GARMENT_ROLE_PROMPT,
  isNearDuplicateGrid,
  upstreamSignalsUnappliedGarment,
  withGarmentRoles,
} from './garment_check.ts';

const GRID = 32;

function fill(value: number): Uint8Array {
  return new Uint8Array(GRID * GRID * 3).fill(value);
}

test('withGarmentRoles names the two images and leaves other requests alone', () => {
  assert.equal(withGarmentRoles('lookbook', 0), 'lookbook');
  assert.equal(withGarmentRoles('lookbook', 1), 'lookbook');
  const labeled = withGarmentRoles('lookbook', 2);
  assert.ok(labeled.startsWith(GARMENT_ROLE_PROMPT));
  assert.ok(labeled.endsWith('lookbook'));
  assert.equal(withGarmentRoles(labeled, 2), labeled);
});

test('upstreamSignalsUnappliedGarment reads error and logs only', () => {
  assert.equal(upstreamSignalsUnappliedGarment({ error: null, logs: null }), false);
  assert.equal(upstreamSignalsUnappliedGarment({ error: 'quota exceeded' }), false);
  assert.equal(
    upstreamSignalsUnappliedGarment({ error: 'could not detect the garment in the photo' }),
    true
  );
  assert.equal(upstreamSignalsUnappliedGarment({ logs: 'no garment found' }), true);
  assert.equal(
    upstreamSignalsUnappliedGarment({
      error: null,
      prompt: 'The first reference image is the garment to put on',
    }),
    false
  );
});

test('isNearDuplicateGrid flags a copy and keeps a changed region', () => {
  const model = fill(180);
  assert.equal(isNearDuplicateGrid(model, new Uint8Array(model)), true);

  const graded = new Uint8Array(model);
  for (let i = 0; i < graded.length; i++) graded[i] = Math.min(255, graded[i] + 2);
  assert.equal(isNearDuplicateGrid(model, graded), true);

  const changed = new Uint8Array(model);
  for (let y = 8; y < 24; y++) {
    for (let x = 8; x < 24; x++) {
      const i = (y * GRID + x) * 3;
      changed[i] = 10;
      changed[i + 1] = 12;
      changed[i + 2] = 14;
    }
  }
  assert.equal(isNearDuplicateGrid(model, changed), false);
});
