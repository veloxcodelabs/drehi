import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Express } from 'express';

process.env.DISABLE_SERVER_AUTOSTART = '1';
process.env.ADMIN_PASSWORD = 'pdf-test-pass';
process.env.VERCEL = '1';

test('admin can open a letter after the PDF file is gone, and guests cannot', async () => {
  const { default: app } = await import('./server.ts') as { default: Express };
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const dataDir = '/tmp/data';
  fs.mkdirSync(dataDir, { recursive: true });
  const submission = {
    id: 'pdf-rebuild-test',
    refNumber: 'MSL-LOI-2026-REBUILD',
    companyName: 'Тест ЕООД',
    uic: '123456789',
    website: 'https://shop.example',
    contactName: 'Иван Иванов',
    role: 'Управител',
    email: 'ivan@shop.example',
    needs: ['По-висока конверсия в онлайн магазина'],
    motivation: 'Искаме пилот.',
    consentAccepted: true,
    timestamp: '01.10.2026 г., 13:00 ч.',
    createdAt: '2026-10-01T10:00:00.000Z',
    pdfUrl: '/api/support-letter/pdf-rebuild-test/pdf',
    pdfPath: path.join(dataDir, 'support_letters', 'missing.pdf'),
  };
  fs.writeFileSync(path.join(dataDir, 'support_submissions.json'), JSON.stringify([submission]));

  try {
    const pdfUrl = `${base}/api/support-letter/${submission.id}/pdf`;
    const guest = await fetch(pdfUrl);
    assert.equal(guest.status, 401);

    const passwordInUrl = await fetch(`${pdfUrl}?password=pdf-test-pass`);
    assert.equal(passwordInUrl.status, 401);

    const login = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'pdf-test-pass' }),
    });
    const loginData = await login.json();
    const setCookie = login.headers.get('set-cookie') || '';
    assert.match(setCookie, /msl_admin=/);
    assert.equal(setCookie.includes('pdf-test-pass'), false);
    const cookiePair = setCookie.split(';')[0];

    const withBearer = await fetch(pdfUrl, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    const bearerBytes = Buffer.from(await withBearer.arrayBuffer());
    assert.equal(withBearer.status, 200);
    assert.equal(withBearer.headers.get('content-type'), 'application/pdf');
    assert.equal(bearerBytes.subarray(0, 4).toString(), '%PDF');

    const withHeader = await fetch(pdfUrl, {
      headers: { 'X-Admin-Token': loginData.token },
    });
    assert.equal(withHeader.status, 200);
    assert.equal(Buffer.from(await withHeader.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

    const withCookie = await fetch(pdfUrl, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(withCookie.status, 200);
    assert.equal(Buffer.from(await withCookie.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

    const wrong = await fetch(pdfUrl, {
      headers: { Authorization: 'Bearer not-the-session' },
    });
    assert.equal(wrong.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
