import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createFileBackend, parseServiceAccount } from './usage_store.ts';

test('parallel reserves cannot exceed 3 tries for one code', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'));
  const backend = createFileBackend(path.join(dir, 'usage.json'));
  const results = await Promise.all(
    Array.from({ length: 8 }, () => backend.reserve('test', true))
  );
  const allowed = results.filter((result) => result.ok);
  const denied = results.filter((result) => !result.ok);
  assert.equal(allowed.length, 3);
  assert.equal(denied.length, 5);
  for (const result of denied) {
    if (!result.ok) assert.equal(result.reason, 'no_tries');
  }
  const balance = await backend.check('test', true);
  assert.equal(balance.remaining, 0);
  assert.equal(balance.used, 0);
  assert.equal(balance.activeHolds, 3);
});

test('service account parser accepts JSON and base64 and never requires a live project', () => {
  const json = JSON.stringify({
    project_id: 'gen-lang-client-demo',
    client_email: 'firebase-adminsdk@gen-lang-client-demo.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----',
  });
  const parsed = parseServiceAccount(json);
  assert.equal(parsed.project_id, 'gen-lang-client-demo');
  assert.match(parsed.private_key, /BEGIN PRIVATE KEY/);
  assert.equal(parsed.private_key.includes('\\n'), false);

  const wrapped = parseServiceAccount(Buffer.from(json).toString('base64'));
  assert.equal(wrapped.client_email, parsed.client_email);
});
