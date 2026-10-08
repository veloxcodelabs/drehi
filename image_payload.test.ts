import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestContainsImageData } from './image_payload.js';
import { uploadsDir, ensurePublicImageUrl, registerTaskFiles, cleanupTaskFiles, cleanupExpiredUploads } from './server.js';

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

test('cleanupExpiredUploads deletes files older than 24 hours and preserves newer files', () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const oldFile = path.join(uploadsDir, 'old_expired_file.tmp');
  const newFile = path.join(uploadsDir, 'new_active_file.tmp');

  fs.writeFileSync(oldFile, 'expired');
  fs.writeFileSync(newFile, 'active');

  // Set oldFile mtime to 25 hours ago
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, twentyFiveHoursAgo, twentyFiveHoursAgo);

  cleanupExpiredUploads();

  assert.equal(fs.existsSync(oldFile), false, 'Expired file should be deleted');
  assert.equal(fs.existsSync(newFile), true, 'Active file should be preserved');

  // Cleanup active test file
  if (fs.existsSync(newFile)) fs.unlinkSync(newFile);
});
