import test from 'node:test';
import assert from 'node:assert/strict';
import { requestContainsImageData } from './image_payload.ts';

test('requestContainsImageData flags data URLs and ignores normal prompts', () => {
  assert.equal(requestContainsImageData({ prompt: 'lookbook', extra_instructions: 'по-дълга' }), false);
  assert.equal(
    requestContainsImageData({ img_urls: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'] }),
    false
  );
  assert.equal(
    requestContainsImageData({ img_urls: ['data:image/jpeg;base64,AAAA', 'https://cdn.example/b.jpg'] }),
    true
  );
  assert.equal(requestContainsImageData({ prompt: 'A'.repeat(60_000) }), true);
});
