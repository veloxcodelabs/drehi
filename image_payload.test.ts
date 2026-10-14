import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

process.env.DISABLE_SERVER_AUTOSTART = '1';
process.env.VERCEL = '1';

import { requestContainsImageData } from './image_payload.js';
const { uploadsDir, ensurePublicImageUrl, registerTaskFiles, cleanupTaskFiles, cleanupExpiredUploads } = await import('./server.js');

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

test('ensurePublicImageUrl saves image locally under a random unguessable filename on drehi.martitony.com', async () => {
  const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const publicUrl = await ensurePublicImageUrl(sampleDataUrl);

  assert.ok(publicUrl.startsWith('https://drehi.martitony.com/uploads/'), `URL must be on drehi.martitony.com: ${publicUrl}`);
  const filename = path.basename(new URL(publicUrl).pathname);
  assert.match(filename, /^[a-f0-9]{64}\.png$/i, 'Filename must be a 64-hex unguessable string');

  const onDiskPath = path.join(uploadsDir, filename);
  assert.ok(fs.existsSync(onDiskPath), 'File should exist on disk in uploads directory');

  // Verify task registration and cleanup after generation finishes
  const mockTaskId = `test_task_${Date.now()}`;
  registerTaskFiles(mockTaskId, [publicUrl]);
  cleanupTaskFiles(mockTaskId);
  assert.equal(fs.existsSync(onDiskPath), false, 'File must be deleted after task generation finishes');
});

test('cleanupExpiredUploads deletes files older than 30 minutes and preserves newer files', () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const oldFile = path.join(uploadsDir, 'old_expired_file.tmp');
  const newFile = path.join(uploadsDir, 'new_active_file.tmp');

  fs.writeFileSync(oldFile, 'expired');
  fs.writeFileSync(newFile, 'active');

  // Set oldFile mtime to 35 minutes ago (exceeding 30 min expiration threshold)
  const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
  fs.utimesSync(oldFile, thirtyFiveMinutesAgo, thirtyFiveMinutesAgo);

  cleanupExpiredUploads();

  assert.equal(fs.existsSync(oldFile), false, 'Expired file should be deleted');
  assert.equal(fs.existsSync(newFile), true, 'Active file should be preserved');

  // Cleanup active test file
  if (fs.existsSync(newFile)) fs.unlinkSync(newFile);
});

test('api/upload Express handler saves locally with 64-hex filename and never uses 3rd party host', async () => {
  const { default: app } = await import('./server.js');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  try {
    const res = await fetch(`${base}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: sampleDataUrl }),
    });

    assert.equal(res.status, 200);
    const jsonResponse = await res.json();
    assert.ok(jsonResponse && jsonResponse.url);
    assert.ok(jsonResponse.url.startsWith('https://drehi.martitony.com/uploads/'), `URL must be on our domain: ${jsonResponse.url}`);
    assert.match(jsonResponse.filename, /^[a-f0-9]{64}\.png$/i, 'Filename must be 64-hex unguessable');

    // Also verify file was written locally in uploadsDir
    const onDisk = path.join(uploadsDir, jsonResponse.filename);
    assert.ok(fs.existsSync(onDisk), 'Uploaded file must exist in uploads directory');
    if (fs.existsSync(onDisk)) fs.unlinkSync(onDisk);

    // Verify oversized payload gives 413
    const hugePayload = 'data:image/png;base64,' + 'A'.repeat(4_500_000);
    const errRes = await fetch(`${base}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: hugePayload }),
    });
    assert.equal(errRes.status, 413);
    const errJson = await errRes.json();
    assert.equal(errJson?.code, 'PAYLOAD_TOO_LARGE');
  } finally {
    server.close();
  }
});


