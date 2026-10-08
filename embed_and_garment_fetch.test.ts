import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { fileURLToPath } from 'node:url';

process.env.DISABLE_SERVER_AUTOSTART = '1';
process.env.VERCEL = '1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('isPrivateOrInternalIp correctly blocks internal and loopback IP addresses', async () => {
  const { isPrivateOrInternalIp } = await import('./server.js');

  // Loopback and zeroes
  assert.equal(isPrivateOrInternalIp('127.0.0.1'), true);
  assert.equal(isPrivateOrInternalIp('127.10.20.30'), true);
  assert.equal(isPrivateOrInternalIp('0.0.0.0'), true);
  assert.equal(isPrivateOrInternalIp('::1'), true);
  assert.equal(isPrivateOrInternalIp('::'), true);
  assert.equal(isPrivateOrInternalIp('::ffff:127.0.0.1'), true);

  // Private subnets
  assert.equal(isPrivateOrInternalIp('10.0.0.1'), true);
  assert.equal(isPrivateOrInternalIp('10.254.254.254'), true);
  assert.equal(isPrivateOrInternalIp('192.168.0.1'), true);
  assert.equal(isPrivateOrInternalIp('192.168.100.50'), true);
  assert.equal(isPrivateOrInternalIp('172.16.0.1'), true);
  assert.equal(isPrivateOrInternalIp('172.24.1.1'), true);
  assert.equal(isPrivateOrInternalIp('172.31.255.255'), true);

  // Link local / Cloud metadata
  assert.equal(isPrivateOrInternalIp('169.254.169.254'), true);
  assert.equal(isPrivateOrInternalIp('169.254.1.1'), true);

  // IPv6 ULA / link local
  assert.equal(isPrivateOrInternalIp('fe80::1'), true);
  assert.equal(isPrivateOrInternalIp('fc00::1'), true);
  assert.equal(isPrivateOrInternalIp('fd12:3456::1'), true);

  // Public IP addresses must NOT be blocked
  assert.equal(isPrivateOrInternalIp('8.8.8.8'), false);
  assert.equal(isPrivateOrInternalIp('1.1.1.1'), false);
  assert.equal(isPrivateOrInternalIp('151.101.65.140'), false);
  assert.equal(isPrivateOrInternalIp('172.15.255.255'), false); // Just below 172.16
  assert.equal(isPrivateOrInternalIp('172.32.0.1'), false); // Just above 172.31
});

test('validateGarmentTargetUrl enforces https and blocks SSRF targets', async () => {
  const { validateGarmentTargetUrl } = await import('./server.js');

  // Missing or non-https scheme
  const httpRes = await validateGarmentTargetUrl('http://example.com/image.jpg');
  assert.equal(httpRes.ok, false);
  assert.match(httpRes.error || '', /HTTPS/i);

  const ftpRes = await validateGarmentTargetUrl('ftp://example.com/image.jpg');
  assert.equal(ftpRes.ok, false);

  // Hostname pointing to localhost or private
  const localRes = await validateGarmentTargetUrl('https://localhost/dress.jpg');
  assert.equal(localRes.ok, false);

  const localIpRes = await validateGarmentTargetUrl('https://127.0.0.1/dress.jpg');
  assert.equal(localIpRes.ok, false);

  const metaRes = await validateGarmentTargetUrl('https://169.254.169.254/latest/meta-data');
  assert.equal(metaRes.ok, false);

  // Malformed URL
  const malformed = await validateGarmentTargetUrl('not-a-valid-url');
  assert.equal(malformed.ok, false);
});

test('embed.js exists in public directory and contains required MSL integration code', () => {
  const embedPath = path.resolve(__dirname, 'public', 'embed.js');
  assert.equal(fs.existsSync(embedPath), true, 'embed.js should exist in public');

  const content = fs.readFileSync(embedPath, 'utf8');
  assert.match(content, /data-code/, 'embed.js should inspect data-code');
  assert.match(content, /data-selector/, 'embed.js should support data-selector');
  assert.match(content, /msl-tryon-btn/, 'embed.js should use scoped msl- prefix for button');
  assert.match(content, /msl-modal/, 'embed.js should use scoped msl- prefix for modal');
  assert.match(content, /data-zoom-image/, 'embed.js should check high-res zoom attributes');
  assert.match(content, /MutationObserver/, 'embed.js should use MutationObserver for dynamic Next.js sites');
  assert.match(content, /embed=1/, 'embed.js should open iframe with embed=1 parameter');
  assert.match(content, /Пробвай онлайн/, 'embed.js button text should be "Пробвай онлайн"');
});

test('embed-demo.html exists in public directory and contains boutique mockup', () => {
  const demoPath = path.resolve(__dirname, 'public', 'embed-demo.html');
  assert.equal(fs.existsSync(demoPath), true, 'embed-demo.html should exist in public');

  const content = fs.readFileSync(demoPath, 'utf8');
  assert.match(content, /product-image/, 'embed-demo.html should have .product-image container');
  assert.match(content, /embed\.js/, 'embed-demo.html should include embed.js script');
  assert.match(content, /data-code="julia"/, 'embed-demo.html should configure data-code="julia"');
  assert.match(content, /data-selector="\.product-image img"/, 'embed-demo.html should configure selector');
});

test('ResultViewport displays updated AI disclaimer text', () => {
  const viewportPath = path.resolve(__dirname, 'src', 'components', 'ResultViewport.tsx');
  const content = fs.readFileSync(viewportPath, 'utf8');
  assert.match(
    content,
    /Визуализация с AI – ориентировъчна\. За точен размер вижте таблицата с мерки\./,
    'ResultViewport must contain the updated disclaimer text'
  );
  assert.doesNotMatch(content, /Готова студийна визия/, 'ResultViewport should not contain the old text');
});

test('HTTP endpoint /api/fetch-garment and static files via Express', async () => {
  const { default: app } = await import('./server.js') as { default: Express };
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Missing URL
    const missingRes = await fetch(`${base}/api/fetch-garment`);
    assert.equal(missingRes.status, 400);
    const missingData = await missingRes.json();
    assert.match(missingData.error, /url/i);

    // 2. Reject HTTP (non-https)
    const httpRes = await fetch(`${base}/api/fetch-garment?url=${encodeURIComponent('http://shop.bg/dress.jpg')}`);
    assert.equal(httpRes.status, 400);
    const httpData = await httpRes.json();
    assert.match(httpData.error, /HTTPS/i);

    // 3. Reject localhost / SSRF
    const localRes = await fetch(`${base}/api/fetch-garment?url=${encodeURIComponent('https://localhost/dress.jpg')}`);
    assert.equal(localRes.status, 400);
    const localData = await localRes.json();
    assert.match(localData.error, /Забранен адрес/i);

    // 4. Reject private IP
    const privateRes = await fetch(`${base}/api/fetch-garment?url=${encodeURIComponent('https://192.168.1.1/dress.jpg')}`);
    assert.equal(privateRes.status, 400);

    // 5. Check static /embed.js serving
    const embedJsRes = await fetch(`${base}/embed.js`);
    assert.equal(embedJsRes.status, 200);
    const embedJsContent = await embedJsRes.text();
    assert.match(embedJsContent, /msl-tryon-btn/);

    // 6. Check static /embed-demo.html serving
    const demoRes = await fetch(`${base}/embed-demo.html`);
    assert.equal(demoRes.status, 200);
    const demoContent = await demoRes.text();
    assert.match(demoContent, /Boutique Noir/);
    assert.match(demoContent, /data-code="julia"/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
