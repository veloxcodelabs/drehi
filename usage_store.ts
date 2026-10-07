/**
 * Durable try counters.
 *
 * On Vercel the backend is Firestore (firebase-admin). Rules deny browser access;
 * only the service account in FIREBASE_SERVICE_ACCOUNT can read or write.
 * Local development and tests use an atomic file so the app runs without credentials.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  emptyState,
  applyAddCredits,
  applyAttach,
  applyCheck,
  applyCommitTask,
  applyGetSizeChart,
  applyReleaseReservation,
  applyReleaseTask,
  applyReserve,
  applyReset,
  applySaveSizeChart,
  metaOfTask,
  ownerOfTask,
  sofiaDateString,
  tasksFor,
  DEFAULT_TRIES,
  type Balance,
  type CodeDoc,
  type DayDoc,
  type FinalizeOutcome,
  type RecentTask,
  type ReservationDoc,
  type ReserveOutcome,
  type UsageState,
} from './usage_logic.js';
import type { SizeChart } from './fit_guidance.js';

export class UsageStoreError extends Error {
  readonly code = 'STORAGE_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'UsageStoreError';
  }
}

export interface UsageBackend {
  check(code: string, known: boolean): Promise<Balance>;
  reserve(code: string, known: boolean): Promise<ReserveOutcome>;
  attach(reservationId: string, taskId: string, meta?: RecentTask): Promise<void>;
  commitTask(taskId: string, patch?: Partial<RecentTask>): Promise<FinalizeOutcome>;
  releaseTask(taskId: string): Promise<FinalizeOutcome>;
  releaseReservation(reservationId: string): Promise<FinalizeOutcome>;
  reset(code: string): Promise<Balance>;
  addCredits(code: string, additional: number): Promise<Balance>;
  tasks(code: string): Promise<RecentTask[]>;
  ownerOf(taskId: string): Promise<string | null>;
  metaOf(taskId: string): Promise<RecentTask | null>;
  getSizeChart(code: string): Promise<SizeChart | null>;
  saveSizeChart(code: string, chart: SizeChart | null): Promise<SizeChart | null>;
}

export function selectMode(): 'file' | 'firestore' {
  if (process.env.USAGE_STORE === 'file') return 'file';
  if (process.env.USAGE_STORE === 'firestore') return 'firestore';
  if (process.env.VERCEL || process.env.FIREBASE_SERVICE_ACCOUNT) return 'firestore';
  return 'file';
}

export function isFirestoreMode(): boolean {
  return selectMode() === 'firestore';
}

function normalizeState(raw: any): UsageState {
  if (!raw || typeof raw !== 'object') return emptyState();
  return {
    codes: raw.codes && typeof raw.codes === 'object' ? raw.codes : {},
    days: raw.days && typeof raw.days === 'object' ? raw.days : {},
    reservations: raw.reservations && typeof raw.reservations === 'object' ? raw.reservations : {},
    taskIndex: raw.taskIndex && typeof raw.taskIndex === 'object' ? raw.taskIndex : {},
  };
}

export function createFileBackend(filePath: string): UsageBackend {
  let chain: Promise<void> = Promise.resolve();

  const exclusive = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const read = (): UsageState => {
    try {
      if (fs.existsSync(filePath)) {
        return normalizeState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      }
    } catch (err) {
      console.error('[Usage] Could not read counter file:', err);
    }
    return emptyState();
  };

  const write = (state: UsageState) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, filePath);
  };

  const update = async <T>(fn: (state: UsageState) => { state: UsageState; value: T }): Promise<T> => {
    return exclusive(() => {
      const current = read();
      const { state, value } = fn(current);
      write(state);
      return value;
    });
  };

  return {
    check(code, known) {
      return update((state) => {
        const result = applyCheck(state, code, { now: Date.now(), known });
        return { state: result.state, value: result.balance };
      });
    },
    reserve(code, known) {
      const reservationId = newReservationId();
      return update((state) => {
        const result = applyReserve(state, code, reservationId, { now: Date.now(), known });
        return { state: result.state, value: result.outcome };
      });
    },
    attach(reservationId, taskId, meta) {
      return update((state) => {
        const result = applyAttach(state, reservationId, taskId, meta);
        return { state: result.state, value: undefined };
      });
    },
    commitTask(taskId, patch) {
      return update((state) => {
        const result = applyCommitTask(state, taskId, Date.now(), patch);
        return { state: result.state, value: result.outcome };
      });
    },
    releaseTask(taskId) {
      return update((state) => {
        const result = applyReleaseTask(state, taskId, Date.now());
        return { state: result.state, value: result.outcome };
      });
    },
    releaseReservation(reservationId) {
      return update((state) => {
        const result = applyReleaseReservation(state, reservationId, Date.now());
        return { state: result.state, value: result.outcome };
      });
    },
    reset(code) {
      return update((state) => {
        const result = applyReset(state, code, Date.now());
        return { state: result.state, value: result.balance };
      });
    },
    addCredits(code, additional) {
      return update((state) => {
        const result = applyAddCredits(state, code, additional, Date.now());
        return { state: result.state, value: result.balance };
      });
    },
    tasks(code) {
      return exclusive(() => tasksFor(read(), code));
    },
    ownerOf(taskId) {
      return exclusive(() => ownerOfTask(read(), taskId));
    },
    metaOf(taskId) {
      return exclusive(() => metaOfTask(read(), taskId));
    },
    getSizeChart(code) {
      return exclusive(() => applyGetSizeChart(read(), code));
    },
    saveSizeChart(code, chart) {
      return update((state) => {
        const result = applySaveSizeChart(state, code, chart);
        return { state: result.state, value: result.sizeChart };
      });
    },
  };
}

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(raw: string): ServiceAccountJson {
  let text = (raw || '').trim();
  if (!text) {
    throw new UsageStoreError('FIREBASE_SERVICE_ACCOUNT is empty');
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  if (!text.startsWith('{')) {
    text = Buffer.from(text, 'base64').toString('utf8');
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UsageStoreError('FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64 JSON');
  }
  const privateKey = String(json.private_key || json.privateKey || '').replace(/\\n/g, '\n');
  const projectId = String(json.project_id || json.projectId || '');
  const clientEmail = String(json.client_email || json.clientEmail || '');
  if (!projectId || !clientEmail || !privateKey.includes('BEGIN')) {
    throw new UsageStoreError('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email, or private_key');
  }
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

function readDatabaseId(): string {
  if (process.env.FIRESTORE_DATABASE_ID && process.env.FIRESTORE_DATABASE_ID.trim()) {
    return process.env.FIRESTORE_DATABASE_ID.trim();
  }
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.firestoreDatabaseId) return String(config.firestoreDatabaseId);
  } catch (err) {
    console.error('[Usage] Could not read firebase-applet-config.json', err);
  }
  throw new UsageStoreError('FIRESTORE_DATABASE_ID is not set and firebase-applet-config.json has no database id');
}

let firestoreDb: any = null;

export async function getFirestoreDb(): Promise<any> {
  if (firestoreDb) return firestoreDb;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (!raw.trim()) {
    throw new UsageStoreError(
      'FIREBASE_SERVICE_ACCOUNT is not set. Try limits cannot be stored on this server until that variable is set.'
    );
  }
  const account = parseServiceAccount(raw);
  const databaseId = readDatabaseId();
  const { initializeApp, cert, getApps, getApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: account.project_id,
          clientEmail: account.client_email,
          privateKey: account.private_key,
        }),
        projectId: account.project_id,
      });
  firestoreDb = getFirestore(app, databaseId);
  console.log(`[Usage] Firestore counters ready (project ${account.project_id}, database ${databaseId}, account ${account.client_email})`);
  return firestoreDb;
}

function asCode(data: any): CodeDoc {
  return {
    totalAllowed: typeof data?.totalAllowed === 'number' ? data.totalAllowed : DEFAULT_TRIES,
    used: typeof data?.used === 'number' ? data.used : 0,
    holds: data?.holds && typeof data.holds === 'object' ? data.holds : {},
    recentTasks: Array.isArray(data?.recentTasks) ? data.recentTasks : [],
    sizeChart: data?.sizeChart && typeof data.sizeChart === 'object' ? data.sizeChart : null,
  };
}

function asDay(data: any): DayDoc {
  return {
    count: typeof data?.count === 'number' ? data.count : 0,
    holds: data?.holds && typeof data.holds === 'object' ? data.holds : {},
  };
}

function asReservation(id: string, data: any): ReservationDoc {
  return {
    id,
    code: String(data?.code || ''),
    dailyDate: String(data?.dailyDate || ''),
    createdAt: typeof data?.createdAt === 'number' ? data.createdAt : 0,
    status: data?.status === 'committed' || data?.status === 'released' ? data.status : 'held',
    ...(data?.taskId ? { taskId: String(data.taskId) } : {}),
    ...(data?.meta ? { meta: data.meta } : {}),
  };
}

function cleanForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function taskDocId(taskId: string): string {
  return encodeURIComponent(taskId);
}

function createFirestoreBackend(): UsageBackend {
  const run = async <T>(work: (db: any) => Promise<T>): Promise<T> => {
    try {
      const db = await getFirestoreDb();
      return await work(db);
    } catch (err) {
      if (err instanceof UsageStoreError) throw err;
      console.error('[Usage] Firestore operation failed:', err);
      throw new UsageStoreError('Firestore could not update try counters');
    }
  };

  const loadCodeBundle = async (tx: any, db: any, code: string, now: number): Promise<UsageState> => {
    const state = emptyState();
    const codeSnap = await tx.get(db.doc(`generation_usage/${code}`));
    if (codeSnap.exists) state.codes[code] = asCode(codeSnap.data());

    const dayKeys = new Set<string>([sofiaDateString(new Date(now))]);
    const reservationIds: string[] = [];
    const codeDoc = state.codes[code];
    if (codeDoc) {
      for (const [id, hold] of Object.entries(codeDoc.holds)) {
        if (hold?.dailyDate) dayKeys.add(hold.dailyDate);
        reservationIds.push(id);
      }
    }

    for (const dayKey of dayKeys) {
      const snap = await tx.get(db.doc(`generation_daily/${dayKey}`));
      if (snap.exists) state.days[dayKey] = asDay(snap.data());
    }
    for (const id of reservationIds) {
      const snap = await tx.get(db.doc(`generation_reservations/${id}`));
      if (snap.exists) state.reservations[id] = asReservation(id, snap.data());
    }
    return state;
  };

  const writeState = (tx: any, db: any, before: UsageState, after: UsageState) => {
    const writeDoc = (refPath: string, beforeValue: unknown, afterValue: unknown) => {
      if (JSON.stringify(beforeValue ?? null) === JSON.stringify(afterValue ?? null)) return;
      if (afterValue == null) return;
      tx.set(db.doc(refPath), cleanForFirestore(afterValue));
    };

    for (const code of new Set([...Object.keys(before.codes), ...Object.keys(after.codes)])) {
      writeDoc(`generation_usage/${code}`, before.codes[code], after.codes[code]);
    }
    for (const day of new Set([...Object.keys(before.days), ...Object.keys(after.days)])) {
      writeDoc(`generation_daily/${day}`, before.days[day], after.days[day]);
    }
    for (const id of new Set([...Object.keys(before.reservations), ...Object.keys(after.reservations)])) {
      writeDoc(`generation_reservations/${id}`, before.reservations[id], after.reservations[id]);
    }
    for (const taskId of new Set([...Object.keys(before.taskIndex), ...Object.keys(after.taskIndex)])) {
      const beforeId = before.taskIndex[taskId];
      const afterId = after.taskIndex[taskId];
      if (beforeId === afterId || !afterId) continue;
      tx.set(db.doc(`generation_task_index/${taskDocId(taskId)}`), {
        taskId,
        reservationId: afterId,
        code: after.reservations[afterId]?.code || before.reservations[afterId]?.code || '',
      });
    }
  };

  const transactCode = async <T>(
    code: string,
    apply: (state: UsageState, now: number) => { state: UsageState; value: T }
  ): Promise<T> => {
    return run(async (db) => {
      return db.runTransaction(async (tx: any) => {
        const now = Date.now();
        const before = await loadCodeBundle(tx, db, code, now);
        const { state, value } = apply(before, now);
        writeState(tx, db, before, state);
        return value;
      });
    });
  };

  const loadByReservation = async (tx: any, db: any, reservationId: string): Promise<UsageState> => {
    const state = emptyState();
    const reservationSnap = await tx.get(db.doc(`generation_reservations/${reservationId}`));
    if (!reservationSnap.exists) return state;
    const reservation = asReservation(reservationId, reservationSnap.data());
    state.reservations[reservationId] = reservation;
    if (reservation.code) {
      const codeSnap = await tx.get(db.doc(`generation_usage/${reservation.code}`));
      if (codeSnap.exists) state.codes[reservation.code] = asCode(codeSnap.data());
    }
    if (reservation.dailyDate) {
      const daySnap = await tx.get(db.doc(`generation_daily/${reservation.dailyDate}`));
      if (daySnap.exists) state.days[reservation.dailyDate] = asDay(daySnap.data());
    }
    if (reservation.taskId) state.taskIndex[reservation.taskId] = reservationId;
    return state;
  };

  const loadByTask = async (tx: any, db: any, taskId: string): Promise<UsageState> => {
    const state = emptyState();
    const indexSnap = await tx.get(db.doc(`generation_task_index/${taskDocId(taskId)}`));
    if (!indexSnap.exists) return state;
    const reservationId = String(indexSnap.data()?.reservationId || '');
    if (!reservationId) return state;
    state.taskIndex[taskId] = reservationId;
    const loaded = await loadByReservation(tx, db, reservationId);
    loaded.taskIndex[taskId] = reservationId;
    return loaded;
  };

  return {
    check(code, known) {
      return transactCode(code, (state, now) => {
        const result = applyCheck(state, code, { now, known });
        return { state: result.state, value: result.balance };
      });
    },
    reserve(code, known) {
      const reservationId = newReservationId();
      return transactCode(code, (state, now) => {
        const result = applyReserve(state, code, reservationId, { now, known });
        return { state: result.state, value: result.outcome };
      });
    },
    attach(reservationId, taskId, meta) {
      return run(async (db) => {
        await db.runTransaction(async (tx: any) => {
          const before = await loadByReservation(tx, db, reservationId);
          const result = applyAttach(before, reservationId, taskId, meta);
          writeState(tx, db, before, result.state);
        });
      });
    },
    commitTask(taskId, patch) {
      return run(async (db) => {
        return db.runTransaction(async (tx: any) => {
          const before = await loadByTask(tx, db, taskId);
          const result = applyCommitTask(before, taskId, Date.now(), patch);
          writeState(tx, db, before, result.state);
          return result.outcome;
        });
      });
    },
    releaseTask(taskId) {
      return run(async (db) => {
        return db.runTransaction(async (tx: any) => {
          const before = await loadByTask(tx, db, taskId);
          const result = applyReleaseTask(before, taskId, Date.now());
          writeState(tx, db, before, result.state);
          return result.outcome;
        });
      });
    },
    releaseReservation(reservationId) {
      return run(async (db) => {
        return db.runTransaction(async (tx: any) => {
          const before = await loadByReservation(tx, db, reservationId);
          const result = applyReleaseReservation(before, reservationId, Date.now());
          writeState(tx, db, before, result.state);
          return result.outcome;
        });
      });
    },
    reset(code) {
      return transactCode(code, (state, now) => {
        const result = applyReset(state, code, now);
        return { state: result.state, value: result.balance };
      });
    },
    addCredits(code, additional) {
      return transactCode(code, (state, now) => {
        const result = applyAddCredits(state, code, additional, now);
        return { state: result.state, value: result.balance };
      });
    },
    tasks(code) {
      return run(async (db) => {
        const snap = await db.doc(`generation_usage/${code}`).get();
        if (!snap.exists) return [];
        return tasksFor({ ...emptyState(), codes: { [code]: asCode(snap.data()) } }, code);
      });
    },
    ownerOf(taskId) {
      return run(async (db) => {
        const snap = await db.doc(`generation_task_index/${taskDocId(taskId)}`).get();
        if (!snap.exists) return null;
        return snap.data()?.code ? String(snap.data().code) : null;
      });
    },
    metaOf(taskId) {
      return run(async (db) => {
        const indexSnap = await db.doc(`generation_task_index/${taskDocId(taskId)}`).get();
        if (!indexSnap.exists) return null;
        const reservationId = String(indexSnap.data()?.reservationId || '');
        if (!reservationId) return null;
        const reservationSnap = await db.doc(`generation_reservations/${reservationId}`).get();
        if (!reservationSnap.exists) return null;
        const meta = reservationSnap.data()?.meta;
        return meta && typeof meta === 'object' ? (meta as RecentTask) : null;
      });
    },
    getSizeChart(code) {
      return run(async (db) => {
        const snap = await db.doc(`generation_usage/${code}`).get();
        if (!snap.exists) return null;
        const data = snap.data();
        return data?.sizeChart && typeof data.sizeChart === 'object' ? data.sizeChart : null;
      });
    },
    saveSizeChart(code, chart) {
      return run(async (db) => {
        return db.runTransaction(async (tx: any) => {
          const docRef = db.doc(`generation_usage/${code}`);
          const snap = await tx.get(docRef);
          if (!snap.exists) {
            tx.set(docRef, cleanForFirestore({
              totalAllowed: DEFAULT_TRIES,
              used: 0,
              holds: {},
              recentTasks: [],
              sizeChart: chart,
            }));
          } else {
            tx.set(docRef, cleanForFirestore({ sizeChart: chart }), { merge: true });
          }
          return chart;
        });
      });
    },
  };
}

function newReservationId(): string {
  return `res_${crypto.randomBytes(12).toString('hex')}`;
}

let singleton: UsageBackend | null = null;

export function getUsageBackend(): UsageBackend {
  if (!singleton) {
    const mode = selectMode();
    if (mode === 'file') {
      const filePath =
        process.env.USAGE_DATA_FILE || path.resolve(process.cwd(), 'data', 'usage_state.json');
      console.log('[Usage] Using file counter store at', filePath);
      singleton = createFileBackend(filePath);
    } else {
      console.log('[Usage] Using Firestore counter store');
      singleton = createFirestoreBackend();
    }
  }
  return singleton;
}

export function resetUsageBackendForTests(): void {
  singleton = null;
  firestoreDb = null;
}
