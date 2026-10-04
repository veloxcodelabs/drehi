import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExtraInstructions, sanitizeExtraInstructions } from './extra_instructions.ts';

test('sanitizeExtraInstructions trims, strips controls, and caps at 300', () => {
  assert.equal(sanitizeExtraInstructions('   '), '');
  assert.equal(sanitizeExtraInstructions(null), '');
  assert.equal(sanitizeExtraInstructions(12), '');
  assert.equal(sanitizeExtraInstructions('  дрехата да е по-дълга \n светъл фон  '), 'дрехата да е по-дълга светъл фон');
  assert.equal(sanitizeExtraInstructions('a\u0000b\u0007c'), 'a b c');
  const long = 'я'.repeat(400);
  assert.equal(sanitizeExtraInstructions(long).length, 300);
});

test('applyExtraInstructions leaves an empty note off the prompt', () => {
  const input = { prompt: 'lookbook', img_urls: ['https://example.com/a.png'], extra_instructions: '   \n  ' };
  const next = applyExtraInstructions(input);
  assert.equal(next.prompt, 'lookbook');
  assert.equal('extra_instructions' in next, false);
  assert.deepEqual(next.img_urls, ['https://example.com/a.png']);
  assert.equal(input.prompt, 'lookbook');
});

test('applyExtraInstructions appends the note to the model prompt', () => {
  const next = applyExtraInstructions({
    prompt: 'lookbook',
    extra_instructions: '  дрехата да е по-дълга, светъл фон  ',
  });
  assert.equal(next.prompt, 'lookbook\n\nAdditional instructions: дрехата да е по-дълга, светъл фон');
  assert.equal('extra_instructions' in next, false);
});
