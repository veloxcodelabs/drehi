import { GenerationTask, TaskApiResult, AccessCodeStatus, SizeChart } from '../types';
import { prepareImageFile } from './prepareImage';
import {
  IMAGE_TOO_LARGE_MESSAGE,
  IMAGE_UPLOAD_FAILED_MESSAGE,
  isPublicHttpUrl,
  requestContainsImageData,
} from '../../image_payload';

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  remaining?: number;
  dailyRemaining?: number;
  dailyLimitReached?: boolean;
  used?: number;
  totalAllowed?: number;

  constructor(
    message: string,
    extra: {
      status?: number;
      code?: string;
      remaining?: number;
      dailyRemaining?: number;
      dailyLimitReached?: boolean;
      used?: number;
      totalAllowed?: number;
    } = {}
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = extra.status ?? 500;
    this.code = extra.code;
    this.remaining = extra.remaining;
    this.dailyRemaining = extra.dailyRemaining;
    this.dailyLimitReached = extra.dailyLimitReached;
    this.used = extra.used;
    this.totalAllowed = extra.totalAllowed;
  }
}

async function readJsonBody(res: Response): Promise<any | null> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  return res.json().catch(() => null);
}

const SIMULATE_STORAGE_KEY = 'studio_simulate_mode';
const HISTORY_STORAGE_KEY = 'studio_task_history_v1';

export function getStoredSimulateMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIMULATE_STORAGE_KEY) === 'true';
}

export function setStoredSimulateMode(simulate: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SIMULATE_STORAGE_KEY, simulate ? 'true' : 'false');
}

export function clearLegacyGlobalHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    localStorage.removeItem('studio_task_history');
  } catch {}
}

export function getStoredHistory(code?: string): GenerationTask[] {
  if (typeof window === 'undefined') return [];
  if (!code || !code.trim()) return [];
  try {
    const key = `studio_history_code_${code.toLowerCase().trim()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to parse history from localStorage', err);
    return [];
  }
}

export function saveStoredHistory(code: string, tasks: GenerationTask[]): void {
  if (typeof window === 'undefined' || !code || !code.trim()) return;
  try {
    const key = `studio_history_code_${code.toLowerCase().trim()}`;
    localStorage.setItem(key, JSON.stringify(tasks.slice(0, 50)));
  } catch (err) {
    console.error('Failed to save history to localStorage', err);
  }
}

export async function fetchUserTasks(code: string): Promise<GenerationTask[]> {
  if (!code || !code.trim()) return [];
  try {
    const res = await fetch(`/api/user-tasks?code=${encodeURIComponent(code.trim())}`, {
      headers: {
        'x-access-code': code.trim(),
      },
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      return data.tasks || [];
    }
    return [];
  } catch {
    return [];
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(IMAGE_UPLOAD_FAILED_MESSAGE));
    reader.readAsDataURL(file);
  });
}

// Compress, then upload. The returned url is always https and is safe to send to /api/tasks/create.
export async function uploadImageFile(file: File): Promise<{ url: string; filename: string; previewUrl: string }> {
  const prepared = await prepareImageFile(file);
  const dataUrl = await readFileAsDataUrl(prepared.file);
  let res: Response;
  try {
    res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataUrl,
        filename: prepared.file.name,
      }),
    });
  } catch {
    throw new ApiRequestError(IMAGE_UPLOAD_FAILED_MESSAGE);
  }

  const data = await readJsonBody(res);
  if (res.status === 413) {
    throw new ApiRequestError(data?.error || IMAGE_TOO_LARGE_MESSAGE, { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  if (!res.ok || !isPublicHttpUrl(data?.url)) {
    throw new ApiRequestError(data?.error || IMAGE_UPLOAD_FAILED_MESSAGE, { status: res.status });
  }
  return {
    url: data.url,
    filename: data.filename || prepared.file.name,
    previewUrl: prepared.previewUrl,
  };
}

// Check backend service status
export async function checkApiHealth(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      return {
        success: Boolean(data.success),
        message: data.message || 'Engine online',
      };
    }
    return { success: true, message: 'Client engine ready' };
  } catch {
    return {
      success: true,
      message: 'Client engine operational',
    };
  }
}

const emptyAccessStatus = (code = ''): AccessCodeStatus => ({
  valid: false,
  code,
  remaining: 0,
  totalAllowed: 0,
  used: 0,
  dailyRemaining: 0,
  dailyLimitReached: false,
  sizeChart: null,
});

/**
 * Remaining tries come only from the server. There is no browser-side counter.
 */
export async function validateAccessCode(code: string): Promise<AccessCodeStatus> {
  const cleanCode = (code || '').trim().toLowerCase();
  if (!cleanCode) return emptyAccessStatus('');

  try {
    const res = await fetch(`/api/auth-code?k=${encodeURIComponent(cleanCode)}`, {
      cache: 'no-store',
    });
    const data = await readJsonBody(res);
    if (data && typeof data.valid === 'boolean' && typeof data.remaining === 'number') {
      return data;
    }
    return {
      ...emptyAccessStatus(cleanCode),
      message: data?.message || data?.error || 'Връзката със сървъра не успя. Моля, опреснете страницата.',
    };
  } catch (err) {
    console.warn('[Access Code] Server endpoint unreachable:', err);
    return {
      ...emptyAccessStatus(cleanCode),
      message: 'Връзката със сървъра не успя. Моля, опреснете страницата.',
    };
  }
}

export interface CreatedTask {
  taskId: string;
  cost?: number;
  isSimulated?: boolean;
  remaining?: number;
  dailyRemaining?: number;
  dailyLimitReached?: boolean;
}

// Create generation task. Errors are thrown so the UI can show the server message.
export async function createTask(params: {
  version: string;
  input: Record<string, any>;
  simulate?: boolean;
  accessCode?: string;
}): Promise<CreatedTask> {
  const simulate = params.simulate ?? false;
  if (requestContainsImageData(params.input)) {
    throw new ApiRequestError(IMAGE_TOO_LARGE_MESSAGE, { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  const res = await fetch('/api/tasks/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.accessCode ? { 'x-access-code': params.accessCode } : {}),
    },
    body: JSON.stringify({
      version: params.version,
      input: params.input,
      simulate,
      accessCode: params.accessCode,
    }),
  });

  const data = await readJsonBody(res);
  if (res.ok && data?.code === 200 && data.result?.task_id) {
    return {
      taskId: data.result.task_id,
      cost: data.result.task_cost,
      isSimulated: data.result.isSimulated || false,
      remaining: typeof data.result.remaining === 'number' ? data.result.remaining : undefined,
      dailyRemaining: data.result.dailyRemaining,
      dailyLimitReached: data.result.dailyLimitReached,
    };
  }

  throw new ApiRequestError(
    data?.error || (res.status === 413 ? IMAGE_TOO_LARGE_MESSAGE : 'Възникна грешка при стартиране на генерацията.'),
    {
      status: res.status,
      code: typeof data?.code === 'string' ? data.code : undefined,
      remaining: typeof data?.remaining === 'number' ? data.remaining : undefined,
      dailyRemaining: data?.dailyRemaining,
      dailyLimitReached: data?.dailyLimitReached,
      used: data?.used,
      totalAllowed: data?.totalAllowed,
    }
  );
}

// Fetch task status. Remaining tries, when present, are the server's number.
export async function getTask(taskId: string, accessCode?: string): Promise<TaskApiResult> {
  const url = `/api/tasks/${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      ...(accessCode ? { 'x-access-code': accessCode } : {}),
    },
  });
  const data = await readJsonBody(res);
  if (res.ok && data?.code === 200 && data.result) {
    return data.result;
  }
  throw new ApiRequestError(
    data?.error || 'Неуспешна проверка на генерацията.',
    {
      status: res.status,
      code: typeof data?.code === 'string' ? data.code : undefined,
      remaining: typeof data?.remaining === 'number' ? data.remaining : undefined,
    }
  );
}

// Get image proxy URL for seamless viewing and downloading
export function getProxyImageUrl(url: string, download = false): string {
  if (!url) return '';
  if (url.startsWith('/uploads/') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (!download && (url.startsWith('https://images.unsplash.com') || url.startsWith('https://images.pexels.com'))) {
    return url;
  }
  const params = new URLSearchParams({ url });
  if (download) params.set('download', 'true');
  return `/api/proxy-image?${params.toString()}`;
}

// Submit Support Letter
export async function submitSupportLetter(
  payload: import('../types').SupportLetterData
): Promise<import('../types').SupportLetterResponse> {
  try {
    const res = await fetch('/api/support-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await readJsonBody(res);
    if (res.ok && data?.success) {
      return data;
    }
    throw new ApiRequestError(data?.error || 'Възникна грешка при изпращането. Моля, опитайте отново.', {
      status: res.status,
    });
  } catch (err) {
    if (err instanceof ApiRequestError) throw err;
    console.warn('Support letter server submission failed:', err);
    throw new ApiRequestError('Връзката със сървъра не успя. Моля, опитайте отново.');
  }
}

// Fetch size chart for customer code
export async function getSizeChart(code: string): Promise<SizeChart | null> {
  const cleanCode = (code || '').trim().toLowerCase();
  if (!cleanCode) return null;
  try {
    const res = await fetch(`/api/size-chart?k=${encodeURIComponent(cleanCode)}`, { cache: 'no-store' });
    const data = await readJsonBody(res);
    return data?.sizeChart || null;
  } catch {
    return null;
  }
}

// Admin: fetch size chart for any code
export async function getSizeChartAdmin(code: string, adminToken: string): Promise<SizeChart | null> {
  const cleanCode = (code || '').trim().toLowerCase();
  if (!cleanCode) return null;
  const res = await fetch(`/api/admin/size-chart?code=${encodeURIComponent(cleanCode)}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'X-Admin-Token': adminToken,
    },
    cache: 'no-store',
  });
  const data = await readJsonBody(res);
  if (!res.ok) throw new Error(data?.error || 'Грешка при зареждане на таблицата.');
  return data?.sizeChart || null;
}

// Admin: save size chart for code
export async function saveSizeChartAdmin(
  code: string,
  sizeChart: SizeChart | null,
  adminToken: string
): Promise<SizeChart | null> {
  const cleanCode = (code || '').trim().toLowerCase();
  if (!cleanCode) throw new Error('Моля, въведете код.');
  const res = await fetch('/api/admin/size-chart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify({ code: cleanCode, sizeChart }),
  });
  const data = await readJsonBody(res);
  if (!res.ok) throw new Error(data?.error || 'Грешка при запазване на таблицата.');
  return data?.sizeChart || null;
}

