import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limits-'));
process.env.USAGE_STORE = 'file';
process.env.USAGE_DATA_FILE = path.join(dir, 'usage.json');
process.env.DISABLE_SERVER_AUTOSTART = '1';
process.env.ADMIN_PASSWORD = 'test-admin-pass';
process.env.VMODEL_API_TOKEN = 'server-side-test-token';
process.env.VERCEL = '';

type TaskRecord = { status: string; output: string[]; error?: string };

const tasks = new Map<string, TaskRecord>();
let upstreamMode: 'ok' | 'quota' = 'ok';

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.includes('api.vmodel.ai')) return realFetch(input, init);

  if (url.endsWith('/create')) {
    if (upstreamMode === 'quota') {
      return new Response(
        JSON.stringify({
          code: 429,
          message: { en: 'quota exceeded' },
          error: {
            status: 'RESOURCE_EXHAUSTED',
            message:
              "Quota exceeded for quota metric 'GenerateContentRequestsPerDayPerProjectPerModel' and limit 'free tier'.",
          },
        }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      );
    }
    const id = `task_${Math.random().toString(16).slice(2)}`;
    tasks.set(id, { status: 'processing', output: [] });
    return new Response(JSON.stringify({ code: 200, result: { task_id: id, task_cost: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const id = url.split('/').pop() || '';
  const task = tasks.get(id);
  if (!task) {
    return new Response(JSON.stringify({ code: 404, message: 'missing' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(
    JSON.stringify({
      code: 200,
      result: {
        task_id: id,
        status: task.status,
        output: task.output,
        error: task.error || null,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}) as typeof fetch;

const { default: app } = await import('./server.ts');

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('no port');
const base = `http://127.0.0.1:${address.port}`;

async function auth(code: string) {
  const res = await realFetch(`${base}/api/auth-code?k=${encodeURIComponent(code)}`);
  return { status: res.status, data: await res.json() };
}

async function create(code: string) {
  const res = await realFetch(`${base}/api/tasks/create`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-access-code': code,
    },
    body: JSON.stringify({
      version: 'test-version',
      input: { prompt: 'lookbook' },
      accessCode: code,
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function poll(taskId: string, code: string) {
  const res = await realFetch(`${base}/api/tasks/${encodeURIComponent(taskId)}`, {
    headers: { 'x-access-code': code },
  });
  return { status: res.status, data: await res.json() };
}

async function reset(code: string) {
  const res = await realFetch(`${base}/api/admin/codes/reset`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-password': 'test-admin-pass',
    },
    body: JSON.stringify({ code }),
  });
  assert.equal(res.status, 200);
  return res.json();
}

test.after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test('server enforces try limits, refunds failures, and keeps the API token server-side', async () => {
  upstreamMode = 'ok';
  await reset('test');
  const start = await auth('test');
  assert.equal(start.data.valid, true);
  assert.equal(start.data.remaining, 3);
  assert.equal(start.data.totalAllowed, 3);

  for (let i = 0; i < 3; i++) {
    const created = await create('test');
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.result.remaining, 2 - i);
    const taskId = created.data.result.task_id as string;
    tasks.get(taskId)!.status = 'succeeded';
    tasks.get(taskId)!.output = ['https://example.com/look.png'];
    const done = await poll(taskId, 'test');
    assert.equal(done.data.result.status, 'succeeded');
    assert.equal(done.data.result.remaining, 2 - i);
  }

  const fourth = await create('test');
  assert.equal(fourth.status, 403);
  assert.equal(fourth.data.code, 'NO_TRIES');
  assert.match(fourth.data.error, /Пробите свършиха/);

  const refreshed = await auth('test');
  assert.equal(refreshed.data.remaining, 0);
  assert.equal(refreshed.data.used, 3);

  const resetResult = await reset('test');
  assert.equal(resetResult.remaining, 3);
  const afterReset = await auth('test');
  assert.equal(afterReset.data.remaining, 3);

  upstreamMode = 'quota';
  await reset('lucy');
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
    original(...args);
  };
  try {
    const created = await create('lucy');
    assert.equal(created.status, 429);
    assert.equal(created.data.code, 'QUOTA_EXCEEDED');
    assert.match(created.data.error, /пробата не е отнета/);
    assert.equal(JSON.stringify(created.data).includes('GenerateContentRequestsPerDay'), false);
    assert.equal(created.data.details, undefined);
  } finally {
    console.error = original;
    upstreamMode = 'ok';
  }
  assert.ok(
    logged.some((line) => line.includes('GenerateContentRequestsPerDayPerProjectPerModel')),
    logged.join('\n')
  );
  assert.ok(logged.some((line) => line.includes('kind=quota')));
  const balance = await auth('lucy');
  assert.equal(balance.data.remaining, 3);
  assert.equal(balance.data.used, 0);

  upstreamMode = 'ok';
  await reset('benmodel');
  const failedCreate = await create('benmodel');
  assert.equal(failedCreate.status, 200);
  assert.equal(failedCreate.data.result.remaining, 2);
  const failedTaskId = failedCreate.data.result.task_id as string;
  tasks.get(failedTaskId)!.status = 'failed';
  tasks.get(failedTaskId)!.error = "Quota exceeded for quota metric 'OnlinePredictionRequestsPerMinute'";
  const failedPoll = await poll(failedTaskId, 'benmodel');
  assert.equal(failedPoll.data.result.status, 'failed');
  assert.match(failedPoll.data.result.error, /пробата не е отнета/);
  assert.equal(String(failedPoll.data.result.error).includes('OnlinePrediction'), false);
  assert.equal(failedPoll.data.result.remaining, 3);
  const benmodelBalance = await auth('benmodel');
  assert.equal(benmodelBalance.data.remaining, 3);
  assert.equal(benmodelBalance.data.used, 0);

  upstreamMode = 'ok';
  await reset('veza');
  const parallel = await Promise.all(Array.from({ length: 6 }, () => create('veza')));
  const ok = parallel.filter((item) => item.status === 200);
  const denied = parallel.filter((item) => item.status === 403);
  assert.equal(ok.length, 3);
  assert.equal(denied.length, 3);
  for (const item of ok) {
    const taskId = item.data.result.task_id as string;
    tasks.get(taskId)!.status = 'failed';
    tasks.get(taskId)!.error = 'upstream blew up';
    await poll(taskId, 'veza');
  }
  const vezaBalance = await auth('veza');
  assert.equal(vezaBalance.data.used, 0);
  assert.equal(vezaBalance.data.remaining, 3);

  const missing = await create('');
  assert.equal(missing.status, 403);
  assert.equal(missing.data.code, 'ACCESS_DENIED');
  const unknown = await create('definitely-not-issued');
  assert.equal(unknown.status, 403);
  assert.equal(unknown.data.code, 'ACCESS_DENIED');

  upstreamMode = 'ok';
  await reset('lily');
  const res = await realFetch(`${base}/api/tasks/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vmodel-token': 'client-should-be-ignored' },
    body: JSON.stringify({
      version: 'test-version',
      input: { prompt: 'x' },
      accessCode: 'lily',
      apiToken: 'client-should-be-ignored',
    }),
  });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(JSON.stringify(data).includes('server-side-test-token'), false);
  assert.equal(JSON.stringify(data).includes('client-should-be-ignored'), false);
});
