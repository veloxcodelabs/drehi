/**
 * Pure try-limit rules. Persistence (Firestore or a local file) applies these
 * inside a single atomic read-modify-write so parallel requests cannot overshoot.
 *
 * A try is reserved up front (so two browsers cannot both spend the last try)
 * and is counted only when the generation succeeds. Failures release the hold.
 */

export const DEFAULT_TRIES = 3;
export const DAILY_CAP = 300;
export const HOLD_TTL_MS = 20 * 60 * 1000;

export interface Hold {
  createdAt: number;
  dailyDate: string;
  taskId?: string;
}

export interface RecentTask {
  id: string;
  createdAt: number;
  prompt?: string;
  modelName?: string;
  version?: string;
  aspectRatio?: string;
  resolution?: string;
  outputUrls?: string[];
  status?: string;
  predictTime?: number;
  totalTime?: number;
  completedAt?: number;
}

export interface CodeDoc {
  totalAllowed: number;
  used: number;
  holds: Record<string, Hold>;
  recentTasks: RecentTask[];
}

export interface DayDoc {
  count: number;
  holds: Record<string, { createdAt: number; code: string }>;
}

export interface ReservationDoc {
  id: string;
  code: string;
  dailyDate: string;
  createdAt: number;
  status: 'held' | 'committed' | 'released';
  taskId?: string;
  meta?: RecentTask;
}

export interface UsageState {
  codes: Record<string, CodeDoc>;
  days: Record<string, DayDoc>;
  reservations: Record<string, ReservationDoc>;
  taskIndex: Record<string, string>;
}

export interface Balance {
  valid: boolean;
  code: string;
  remaining: number;
  totalAllowed: number;
  used: number;
  dailyRemaining: number;
  dailyLimitReached: boolean;
  activeHolds: number;
}

export type DenyReason = 'invalid' | 'no_tries' | 'daily';

export interface ReserveOk {
  ok: true;
  reservationId: string;
  balance: Balance;
}

export interface ReserveNo {
  ok: false;
  reason: DenyReason;
  balance: Balance;
}

export type ReserveOutcome = ReserveOk | ReserveNo;

export interface FinalizeOutcome {
  counted: boolean;
  balance: Balance;
  code: string;
}

export function emptyState(): UsageState {
  return { codes: {}, days: {}, reservations: {}, taskIndex: {} };
}

export function sofiaDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function invalidBalance(code: string): Balance {
  return {
    valid: false,
    code,
    remaining: 0,
    totalAllowed: 0,
    used: 0,
    dailyRemaining: 0,
    dailyLimitReached: false,
    activeHolds: 0,
  };
}

function cloneState(state: UsageState): UsageState {
  return structuredClone(state);
}

function emptyDay(): DayDoc {
  return { count: 0, holds: {} };
}

function ensureDay(state: UsageState, dayKey: string): DayDoc {
  if (!state.days[dayKey]) state.days[dayKey] = emptyDay();
  return state.days[dayKey];
}

function blankCode(totalAllowed: number): CodeDoc {
  return { totalAllowed, used: 0, holds: {}, recentTasks: [] };
}

/** Drop expired holds from one code. Also drops them from any loaded day docs. */
function sweepCode(state: UsageState, code: string, now: number, ttl: number): void {
  const codeDoc = state.codes[code];
  if (!codeDoc) return;
  for (const [id, hold] of Object.entries(codeDoc.holds)) {
    if (now - hold.createdAt <= ttl) continue;
    delete codeDoc.holds[id];
    const day = state.days[hold.dailyDate];
    if (day?.holds[id]) delete day.holds[id];
    const reservation = state.reservations[id];
    if (reservation && reservation.status === 'held') reservation.status = 'released';
  }
}

/**
 * Free daily-cap slots whose holds have expired.
 * Does not release the visitor's reservation: a late success can still be counted
 * until that visitor's own code document is swept.
 */
function sweepDay(day: DayDoc, now: number, ttl: number): void {
  for (const [id, hold] of Object.entries(day.holds)) {
    if (now - hold.createdAt <= ttl) continue;
    delete day.holds[id];
  }
}

function balanceFor(
  state: UsageState,
  code: string,
  now: number,
  dailyCap: number,
  defaultAllowed: number,
  known: boolean
): Balance {
  const dayKey = sofiaDateString(new Date(now));
  const day = state.days[dayKey] || emptyDay();
  const codeDoc = state.codes[code];
  if (!codeDoc && !known) return invalidBalance(code);

  const totalAllowed = codeDoc?.totalAllowed ?? defaultAllowed;
  const used = codeDoc?.used ?? 0;
  const activeHolds = codeDoc ? Object.keys(codeDoc.holds).length : 0;
  const remaining = Math.max(0, totalAllowed - used - activeHolds);
  const dailyActive = Object.keys(day.holds).length;
  const dailyRemaining = Math.max(0, dailyCap - day.count - dailyActive);

  return {
    valid: true,
    code,
    remaining,
    totalAllowed,
    used,
    dailyRemaining,
    dailyLimitReached: day.count + dailyActive >= dailyCap,
    activeHolds,
  };
}

export interface RuleOptions {
  now: number;
  known: boolean;
  defaultAllowed?: number;
  dailyCap?: number;
  holdTtlMs?: number;
}

function opts(input: RuleOptions) {
  return {
    now: input.now,
    known: input.known,
    defaultAllowed: input.defaultAllowed ?? DEFAULT_TRIES,
    dailyCap: input.dailyCap ?? DAILY_CAP,
    ttl: input.holdTtlMs ?? HOLD_TTL_MS,
  };
}

export function applyCheck(
  state: UsageState,
  code: string,
  input: RuleOptions
): { state: UsageState; balance: Balance } {
  const next = cloneState(state);
  const { now, known, defaultAllowed, dailyCap, ttl } = opts(input);
  if (!known && !next.codes[code]) {
    return { state: next, balance: invalidBalance(code) };
  }
  sweepCode(next, code, now, ttl);
  const day = ensureDay(next, sofiaDateString(new Date(now)));
  sweepDay(day, now, ttl);
  return { state: next, balance: balanceFor(next, code, now, dailyCap, defaultAllowed, known) };
}

export function applyReserve(
  state: UsageState,
  code: string,
  reservationId: string,
  input: RuleOptions
): { state: UsageState; outcome: ReserveOutcome } {
  const checked = applyCheck(state, code, input);
  if (!checked.balance.valid) {
    return { state: checked.state, outcome: { ok: false, reason: 'invalid', balance: checked.balance } };
  }
  if (checked.balance.dailyLimitReached || checked.balance.dailyRemaining <= 0) {
    return { state: checked.state, outcome: { ok: false, reason: 'daily', balance: checked.balance } };
  }
  if (checked.balance.remaining <= 0) {
    return { state: checked.state, outcome: { ok: false, reason: 'no_tries', balance: checked.balance } };
  }

  const next = checked.state;
  const { now, defaultAllowed, dailyCap } = opts(input);
  const dayKey = sofiaDateString(new Date(now));
  const day = ensureDay(next, dayKey);
  if (!next.codes[code]) next.codes[code] = blankCode(defaultAllowed);
  const codeDoc = next.codes[code];

  const reservation: ReservationDoc = {
    id: reservationId,
    code,
    dailyDate: dayKey,
    createdAt: now,
    status: 'held',
  };
  codeDoc.holds[reservationId] = { createdAt: now, dailyDate: dayKey };
  day.holds[reservationId] = { createdAt: now, code };
  next.reservations[reservationId] = reservation;

  return {
    state: next,
    outcome: {
      ok: true,
      reservationId,
      balance: balanceFor(next, code, now, dailyCap, defaultAllowed, true),
    },
  };
}

export function applyAttach(
  state: UsageState,
  reservationId: string,
  taskId: string,
  meta?: RecentTask
): { state: UsageState; attached: boolean } {
  const next = cloneState(state);
  const reservation = next.reservations[reservationId];
  if (!reservation || reservation.status !== 'held') {
    return { state: next, attached: false };
  }
  reservation.taskId = taskId;
  if (meta) reservation.meta = { ...reservation.meta, ...meta, id: taskId };
  const hold = next.codes[reservation.code]?.holds[reservationId];
  if (hold) hold.taskId = taskId;
  next.taskIndex[taskId] = reservationId;
  return { state: next, attached: true };
}

function finalizeFromReservation(
  state: UsageState,
  reservationId: string,
  mode: 'commit' | 'release',
  now: number,
  dailyCap: number,
  defaultAllowed: number,
  taskPatch?: Partial<RecentTask>
): { state: UsageState; outcome: FinalizeOutcome } {
  const next = cloneState(state);
  const reservation = next.reservations[reservationId];
  if (!reservation) {
    return {
      state: next,
      outcome: { counted: false, code: '', balance: invalidBalance('') },
    };
  }

  const code = reservation.code;
  const known = true;
  const codeDoc = next.codes[code];

  if (mode === 'commit' && reservation.status === 'committed') {
    if (taskPatch && codeDoc) {
      const id = reservation.taskId || reservationId;
      const existing = codeDoc.recentTasks.find((item) => item.id === id);
      const merged: RecentTask = {
        ...(existing || { id, createdAt: reservation.createdAt }),
        ...taskPatch,
        id,
        status: 'succeeded',
        outputUrls: taskPatch.outputUrls || existing?.outputUrls || [],
      };
      codeDoc.recentTasks = [merged, ...codeDoc.recentTasks.filter((item) => item.id !== id)].slice(0, 30);
    }
    return {
      state: next,
      outcome: {
        counted: false,
        code,
        balance: balanceFor(next, code, now, dailyCap, defaultAllowed, known),
      },
    };
  }

  if (reservation.status !== 'held') {
    return {
      state: next,
      outcome: {
        counted: false,
        code,
        balance: balanceFor(next, code, now, dailyCap, defaultAllowed, known),
      },
    };
  }

  const day = ensureDay(next, reservation.dailyDate);
  if (codeDoc?.holds[reservationId]) delete codeDoc.holds[reservationId];
  if (day.holds[reservationId]) delete day.holds[reservationId];

  if (mode === 'commit' && codeDoc) {
    codeDoc.used += 1;
    day.count += 1;
    reservation.status = 'committed';
    const base: RecentTask = reservation.meta || {
      id: reservation.taskId || reservationId,
      createdAt: reservation.createdAt,
    };
    const task: RecentTask = {
      ...base,
      ...taskPatch,
      id: reservation.taskId || base.id,
      status: 'succeeded',
      outputUrls: taskPatch?.outputUrls || base.outputUrls || [],
    };
    codeDoc.recentTasks = [task, ...codeDoc.recentTasks.filter((item) => item.id !== task.id)].slice(0, 30);
  } else {
    reservation.status = 'released';
  }

  return {
    state: next,
    outcome: {
      counted: mode === 'commit',
      code,
      balance: balanceFor(next, code, now, dailyCap, defaultAllowed, known),
    },
  };
}

export function applyCommitTask(
  state: UsageState,
  taskId: string,
  now: number,
  taskPatch?: Partial<RecentTask>,
  dailyCap = DAILY_CAP,
  defaultAllowed = DEFAULT_TRIES
): { state: UsageState; outcome: FinalizeOutcome } {
  const reservationId = state.taskIndex[taskId];
  if (!reservationId) {
    return {
      state: cloneState(state),
      outcome: { counted: false, code: '', balance: invalidBalance('') },
    };
  }
  return finalizeFromReservation(state, reservationId, 'commit', now, dailyCap, defaultAllowed, taskPatch);
}

export function applyReleaseTask(
  state: UsageState,
  taskId: string,
  now: number,
  dailyCap = DAILY_CAP,
  defaultAllowed = DEFAULT_TRIES
): { state: UsageState; outcome: FinalizeOutcome } {
  const reservationId = state.taskIndex[taskId];
  if (!reservationId) {
    return {
      state: cloneState(state),
      outcome: { counted: false, code: '', balance: invalidBalance('') },
    };
  }
  return finalizeFromReservation(state, reservationId, 'release', now, dailyCap, defaultAllowed);
}

export function applyReleaseReservation(
  state: UsageState,
  reservationId: string,
  now: number,
  dailyCap = DAILY_CAP,
  defaultAllowed = DEFAULT_TRIES
): { state: UsageState; outcome: FinalizeOutcome } {
  return finalizeFromReservation(state, reservationId, 'release', now, dailyCap, defaultAllowed);
}

export function applyReset(
  state: UsageState,
  code: string,
  now: number,
  defaultAllowed = DEFAULT_TRIES
): { state: UsageState; balance: Balance } {
  const next = cloneState(state);
  const codeDoc = next.codes[code] || blankCode(defaultAllowed);
  for (const [id, hold] of Object.entries(codeDoc.holds)) {
    const day = next.days[hold.dailyDate];
    if (day?.holds[id]) delete day.holds[id];
    const reservation = next.reservations[id];
    if (reservation && reservation.status === 'held') reservation.status = 'released';
  }
  codeDoc.holds = {};
  codeDoc.used = 0;
  if (!codeDoc.totalAllowed || codeDoc.totalAllowed < defaultAllowed) {
    codeDoc.totalAllowed = defaultAllowed;
  }
  next.codes[code] = codeDoc;
  return {
    state: next,
    balance: balanceFor(next, code, now, DAILY_CAP, defaultAllowed, true),
  };
}

export function applyAddCredits(
  state: UsageState,
  code: string,
  additional: number,
  now: number,
  defaultAllowed = DEFAULT_TRIES
): { state: UsageState; balance: Balance } {
  const next = cloneState(state);
  const current = next.codes[code] || blankCode(0);
  const extra = Number.isFinite(additional) && additional > 0 ? Math.floor(additional) : defaultAllowed;
  const used = current.used || 0;
  const totalAllowed = current.totalAllowed || 0;
  const currentRemaining = Math.max(0, totalAllowed - used);
  const newTotal = currentRemaining === 0 ? used + extra : totalAllowed + extra;
  current.totalAllowed = newTotal;
  current.used = used;
  current.holds = current.holds || {};
  current.recentTasks = current.recentTasks || [];
  next.codes[code] = current;
  return {
    state: next,
    balance: balanceFor(next, code, now, DAILY_CAP, defaultAllowed, true),
  };
}

export function tasksFor(state: UsageState, code: string): RecentTask[] {
  const tasks = state.codes[code]?.recentTasks || [];
  return [...tasks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function ownerOfTask(state: UsageState, taskId: string): string | null {
  const reservationId = state.taskIndex[taskId];
  if (!reservationId) return null;
  return state.reservations[reservationId]?.code || null;
}
