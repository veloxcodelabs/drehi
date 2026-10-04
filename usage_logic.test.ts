import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_CAP,
  DEFAULT_TRIES,
  HOLD_TTL_MS,
  applyAddCredits,
  applyAttach,
  applyCheck,
  applyCommitTask,
  applyReleaseTask,
  applyReserve,
  applyReset,
  emptyState,
  sofiaDateString,
  type UsageState,
} from './usage_logic.ts';

const NOW = Date.parse('2026-10-04T12:00:00.000Z');

function reserveCommit(state: UsageState, code: string, n: number, now = NOW): UsageState {
  let current = state;
  for (let i = 0; i < n; i++) {
    const id = `res_${code}_${i}`;
    const taskId = `task_${code}_${i}`;
    const reserved = applyReserve(current, code, id, { now, known: true });
    assert.equal(reserved.outcome.ok, true, `reserve ${i} for ${code}`);
    const attached = applyAttach(reserved.state, id, taskId);
    const committed = applyCommitTask(attached.state, taskId, now, { outputUrls: [`https://img/${taskId}`] });
    assert.equal(committed.outcome.counted, true);
    current = committed.state;
  }
  return current;
}

test('Sofia calendar date is used, not UTC', () => {
  assert.equal(sofiaDateString(new Date('2026-10-03T20:30:00.000Z')), '2026-10-03');
  assert.equal(sofiaDateString(new Date('2026-10-03T21:30:00.000Z')), '2026-10-04');
  assert.equal(sofiaDateString(new Date('2026-10-04T00:00:00.000Z')), '2026-10-04');
});

test('a code gets exactly 3 successful tries and the 4th is refused', () => {
  let state = reserveCommit(emptyState(), 'test', 3);
  const balance = applyCheck(state, 'test', { now: NOW, known: true }).balance;
  assert.equal(balance.used, 3);
  assert.equal(balance.remaining, 0);
  assert.equal(balance.totalAllowed, DEFAULT_TRIES);

  const fourth = applyReserve(state, 'test', 'res_extra', { now: NOW, known: true });
  assert.equal(fourth.outcome.ok, false);
  if (!fourth.outcome.ok) assert.equal(fourth.outcome.reason, 'no_tries');
});

test('a failed generation does not consume a try', () => {
  const reserved = applyReserve(emptyState(), 'test', 'res_1', { now: NOW, known: true });
  assert.equal(reserved.outcome.ok, true);
  if (!reserved.outcome.ok) return;
  assert.equal(reserved.outcome.balance.remaining, 2);

  const attached = applyAttach(reserved.state, 'res_1', 'task_fail');
  const released = applyReleaseTask(attached.state, 'task_fail', NOW);
  assert.equal(released.outcome.counted, false);
  assert.equal(released.outcome.balance.used, 0);
  assert.equal(released.outcome.balance.remaining, DEFAULT_TRIES);

  const again = applyCommitTask(released.state, 'task_fail', NOW);
  assert.equal(again.outcome.counted, false);
  assert.equal(again.outcome.balance.used, 0);
});

test('committing the same success twice counts once', () => {
  const reserved = applyReserve(emptyState(), 'benmodel', 'res_1', { now: NOW, known: true });
  const attached = applyAttach(reserved.state, 'res_1', 'task_1');
  const first = applyCommitTask(attached.state, 'task_1', NOW, { outputUrls: ['https://img/1'] });
  const second = applyCommitTask(first.state, 'task_1', NOW, { outputUrls: ['https://img/1'] });
  assert.equal(first.outcome.counted, true);
  assert.equal(second.outcome.counted, false);
  assert.equal(second.outcome.balance.used, 1);
  assert.equal(second.outcome.balance.remaining, 2);
});

test('unknown codes cannot generate', () => {
  const outcome = applyReserve(emptyState(), 'not-a-real-code', 'res_1', { now: NOW, known: false });
  assert.equal(outcome.outcome.ok, false);
  if (!outcome.outcome.ok) assert.equal(outcome.outcome.reason, 'invalid');
});

test('expired holds are refunded and can be used again', () => {
  const reserved = applyReserve(emptyState(), 'test', 'res_1', { now: NOW, known: true });
  const later = NOW + HOLD_TTL_MS + 5_000;
  const checked = applyCheck(reserved.state, 'test', { now: later, known: true });
  assert.equal(checked.balance.remaining, 3);
  assert.equal(checked.balance.used, 0);
  const again = applyReserve(checked.state, 'test', 'res_2', { now: later, known: true });
  assert.equal(again.outcome.ok, true);
});

test('daily cap is 300 successes on the Europe/Sofia date and is shared', () => {
  const day = sofiaDateString(new Date(NOW));
  const state = emptyState();
  state.days[day] = { count: DAILY_CAP, holds: {} };
  const blocked = applyReserve(state, 'test', 'res_1', { now: NOW, known: true });
  assert.equal(blocked.outcome.ok, false);
  if (!blocked.outcome.ok) assert.equal(blocked.outcome.reason, 'daily');

  const almost = emptyState();
  almost.days[day] = { count: DAILY_CAP - 1, holds: {} };
  const last = applyReserve(almost, 'lucy', 'res_last', { now: NOW, known: true });
  assert.equal(last.outcome.ok, true);
  const attached = applyAttach(last.state, 'res_last', 'task_last');
  const committed = applyCommitTask(attached.state, 'task_last', NOW);
  assert.equal(committed.state.days[day].count, DAILY_CAP);
  const next = applyReserve(committed.state, 'test', 'res_over', { now: NOW, known: true });
  assert.equal(next.outcome.ok, false);
  if (!next.outcome.ok) assert.equal(next.outcome.reason, 'daily');
});

test('a success just before Sofia midnight counts on that Sofia day', () => {
  const evening = Date.parse('2026-10-03T20:30:00.000Z');
  const morning = Date.parse('2026-10-03T21:30:00.000Z');
  const reserved = applyReserve(emptyState(), 'test', 'res_1', { now: evening, known: true });
  const attached = applyAttach(reserved.state, 'res_1', 'task_1');
  const committed = applyCommitTask(attached.state, 'task_1', morning);
  assert.equal(committed.state.days['2026-10-03'].count, 1);
  assert.equal(committed.state.days['2026-10-04'], undefined);
  assert.equal(committed.outcome.balance.dailyRemaining, DAILY_CAP);
  assert.equal(committed.outcome.balance.remaining, 2);
});

test('reset restores a full allowance without raising the cap above what was granted', () => {
  let state = reserveCommit(emptyState(), 'test', 3);
  const reset = applyReset(state, 'test', NOW);
  assert.equal(reset.balance.used, 0);
  assert.equal(reset.balance.remaining, 3);
  assert.equal(reset.balance.totalAllowed, 3);

  const boosted = applyAddCredits(reset.state, 'test', 3, NOW);
  assert.equal(boosted.balance.totalAllowed, 6);
  assert.equal(boosted.balance.remaining, 6);
  const resetAgain = applyReset(boosted.state, 'test', NOW);
  assert.equal(resetAgain.balance.totalAllowed, 6);
  assert.equal(resetAgain.balance.remaining, 6);
});
