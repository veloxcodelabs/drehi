import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import {
  extractVisitorId,
  hashVisitorId,
  getSofiaDateString,
  formatVisitorDailyLimitMessage,
  visitorCounter,
  VisitorDailyCounterStore,
  DEFAULT_DAILY_PER_VISITOR,
} from './visitor_limit.js';
import {
  CODE_CONFIGS,
  getVisitorDailyLimit,
  addCreditsToCode,
  checkAccessCode,
} from './access_control.js';

// Set up server environment variables for tests
process.env.USAGE_STORE = 'file';
process.env.DISABLE_SERVER_AUTOSTART = '1';
process.env.ADMIN_PASSWORD = 'test-admin-pass';
process.env.VMODEL_API_TOKEN = 'server-side-test-token';

test('visitor identification extracts cookie, falls back to header, then IP', () => {
  // 1. From cookie header
  const reqWithCookie: any = {
    headers: {
      cookie: 'other=1; msl_vid=vid_cookie_12345; session=abc',
    },
  };
  const fromCookie = extractVisitorId(reqWithCookie);
  assert.equal(fromCookie.source, 'cookie');
  assert.equal(fromCookie.visitorId, 'cookie:vid_cookie_12345');

  // 2. From header fallback
  const reqWithHeader: any = {
    headers: {
      'x-visitor-id': 'vid_header_67890',
    },
  };
  const fromHeader = extractVisitorId(reqWithHeader);
  assert.equal(fromHeader.source, 'header');
  assert.equal(fromHeader.visitorId, 'cookie:vid_header_67890');

  // 3. Fallback to client IP from x-forwarded-for
  const reqWithXff: any = {
    headers: {
      'x-forwarded-for': '198.51.100.42, 10.0.0.1',
    },
  };
  const fromXff = extractVisitorId(reqWithXff);
  assert.equal(fromXff.source, 'ip');
  assert.equal(fromXff.visitorId, 'ip:198.51.100.42');

  // 4. Fallback to remoteAddress
  const reqRemote: any = {
    headers: {},
    socket: { remoteAddress: '203.0.113.195' },
  };
  const fromRemote = extractVisitorId(reqRemote);
  assert.equal(fromRemote.source, 'ip');
  assert.equal(fromRemote.visitorId, 'ip:203.0.113.195');
});

test('hashVisitorId produces consistent 64-hex SHA-256 hash without personal data', () => {
  const hash1 = hashVisitorId('cookie:vid_123');
  const hash2 = hashVisitorId('cookie:vid_123');
  const hashOther = hashVisitorId('cookie:vid_999');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashOther);
  assert.equal(hash1.length, 64);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test('VisitorDailyCounterStore tracks counts and resets automatically when Sofia day changes', () => {
  const store = new VisitorDailyCounterStore();
  const visitorA = hashVisitorId('cookie:alice');
  const visitorB = hashVisitorId('cookie:bob');

  store.reset('2026-10-12');
  assert.equal(store.getCount(visitorA, 'test'), 0);

  // Increment visitor A
  store.increment(visitorA, 'test');
  store.increment(visitorA, 'test');
  assert.equal(store.getCount(visitorA, 'test'), 2);
  assert.equal(store.getRemaining(visitorA, 'test', 10), 8);
  assert.equal(store.isLimitReached(visitorA, 'test', 10), false);

  // Visitor B has independent count
  assert.equal(store.getCount(visitorB, 'test'), 0);
  store.increment(visitorB, 'test');
  assert.equal(store.getCount(visitorB, 'test'), 1);

  // Same visitor on different code has independent count
  assert.equal(store.getCount(visitorA, 'bekoda'), 0);
  store.increment(visitorA, 'bekoda');
  assert.equal(store.getCount(visitorA, 'bekoda'), 1);
  assert.equal(store.getCount(visitorA, 'test'), 2);

  // Simulate next day in Sofia
  const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const nextDayStr = getSofiaDateString(nextDay);
  store.reset(nextDayStr);

  // Automatically reset to 0 for the new day
  assert.equal(store.getCount(visitorA, 'test'), 0);
  assert.equal(store.getTrackedEntriesCount(), 0);
});

test('configurable per-code limits and limit message format', () => {
  assert.equal(getVisitorDailyLimit('test'), DEFAULT_DAILY_PER_VISITOR);
  assert.equal(formatVisitorDailyLimitMessage(10), 'Достигнахте дневния лимит от 10 проби. Опитайте отново утре.');

  // Override limit for custom code
  CODE_CONFIGS['custom_brand'] = { dailyPerVisitor: 25 };
  assert.equal(getVisitorDailyLimit('custom_brand'), 25);
  assert.equal(formatVisitorDailyLimitMessage(25), 'Достигнахте дневния лимит от 25 проби. Опитайте отново утре.');
  delete CODE_CONFIGS['custom_brand'];
  assert.equal(getVisitorDailyLimit('custom_brand'), DEFAULT_DAILY_PER_VISITOR);

  // Marikris has dailyPerVisitor 5 and 200 initial credits
  assert.equal(CODE_CONFIGS['marikris']?.initialCredits, 200);
  assert.equal(CODE_CONFIGS['marikris']?.dailyPerVisitor, 5);
  assert.equal(getVisitorDailyLimit('marikris'), 5);
});

test('HTTP server: refuses 11th try with 429 and exact Bulgarian message without consuming code credits', async () => {
  const { default: app } = await import('./server.ts');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${address.port}`;

  const vid = 'test_visitor_' + Math.random().toString(36).slice(2);
  const code = 'test';

  // Ensure code has plenty of credits for this test
  await addCreditsToCode(code, 50);
  const balanceBefore = await checkAccessCode(code);
  const initialRemaining = balanceBefore.remaining;

  visitorCounter.reset();

  try {
    // Run 10 simulated generations for this visitor
    for (let i = 1; i <= 10; i++) {
      const res = await fetch(`${base}/api/tasks/create`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': `msl_vid=${vid}`,
          'x-access-code': code,
        },
        body: JSON.stringify({
          version: 'test-version',
          input: { prompt: `Test look ${i}` },
          simulate: true,
          accessCode: code,
        }),
      });

      assert.equal(res.status, 200, `Request ${i} should succeed`);
      const body = await res.json();
      assert.equal(body.code, 200);
      assert.ok(body.result.task_id);
    }

    // 11th request must be refused with HTTP 429
    const refusedRes = await fetch(`${base}/api/tasks/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': `msl_vid=${vid}`,
        'x-access-code': code,
      },
      body: JSON.stringify({
        version: 'test-version',
        input: { prompt: 'Test look 11' },
        simulate: true,
        accessCode: code,
      }),
    });

    assert.equal(refusedRes.status, 429);
    const refusedBody = await refusedRes.json();
    assert.equal(
      refusedBody.error,
      'Достигнахте дневния лимит от 10 проби. Опитайте отново утре.'
    );
    assert.equal(refusedBody.code, 'VISITOR_DAILY_LIMIT_REACHED');

    // Code credits must not be consumed for the refused 11th request
    // Exactly 10 were started, so remaining should be initialRemaining - 10
    const balanceAfter = await checkAccessCode(code);
    assert.equal(balanceAfter.remaining, initialRemaining - 10);

    // Another visitor with different cookie should still be allowed
    const otherVid = 'other_visitor_' + Math.random().toString(36).slice(2);
    const otherRes = await fetch(`${base}/api/tasks/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': `msl_vid=${otherVid}`,
        'x-access-code': code,
      },
      body: JSON.stringify({
        version: 'test-version',
        input: { prompt: 'Other visitor look' },
        simulate: true,
        accessCode: code,
      }),
    });
    assert.equal(otherRes.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('HTTP server: refuses 6th try for marikris with 429 and limit 5 message', async () => {
  const { default: app } = await import('./server.ts');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${address.port}`;

  const vid = 'marikris_visitor_' + Math.random().toString(36).slice(2);
  const code = 'marikris';

  visitorCounter.reset();

  try {
    // 5 allowed generations for marikris
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${base}/api/tasks/create`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': `msl_vid=${vid}`,
          'x-access-code': code,
        },
        body: JSON.stringify({
          version: 'test-version',
          input: { prompt: `Marikris look ${i}` },
          simulate: true,
          accessCode: code,
        }),
      });
      assert.equal(res.status, 200, `Request ${i} should succeed`);
    }

    // 6th request must be refused with HTTP 429 and limit 5 message
    const refusedRes = await fetch(`${base}/api/tasks/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': `msl_vid=${vid}`,
        'x-access-code': code,
      },
      body: JSON.stringify({
        version: 'test-version',
        input: { prompt: 'Marikris look 6' },
        simulate: true,
        accessCode: code,
      }),
    });

    assert.equal(refusedRes.status, 429);
    const refusedBody = await refusedRes.json();
    assert.equal(
      refusedBody.error,
      'Достигнахте дневния лимит от 5 проби. Опитайте отново утре.'
    );
    assert.equal(refusedBody.limit, 5);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

