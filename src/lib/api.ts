import { GenerationTask, TaskApiResult, AccessCodeStatus } from '../types';

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
    if (!res.ok) return [];
    const data = await res.json();
    return data.tasks || [];
  } catch (err) {
    console.warn('Failed to fetch remote tasks for code', err);
    return [];
  }
}

// Upload file to server and receive accessible HTTP URL
export async function uploadImageFile(file: File): Promise<{ url: string; filename: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl,
            filename: file.name,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed with status ${res.status}`);
        }

        const data = await res.json();
        resolve({ url: data.url, filename: data.filename, dataUrl });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Check backend service status
export async function checkApiHealth(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return {
      success: Boolean(data.success),
      message: data.message || (data.success ? 'Engine online' : 'Service unavailable'),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to reach service',
    };
  }
}

// Validate access code with server
export async function validateAccessCode(code: string): Promise<AccessCodeStatus> {
  try {
    const res = await fetch(`/api/auth-code?k=${encodeURIComponent(code.trim())}`);
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      valid: false,
      code,
      remaining: 0,
      totalAllowed: 0,
      used: 0,
      dailyRemaining: 0,
      dailyLimitReached: false,
      message: err.message,
    };
  }
}

// Create generation task
export async function createTask(params: {
  version: string;
  input: Record<string, any>;
  simulate?: boolean;
  accessCode?: string;
}): Promise<{ taskId: string; cost?: number; isSimulated?: boolean; remaining?: number }> {
  const simulate = params.simulate ?? false;

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

  const data = await res.json();

  if (!res.ok || data.code !== 200) {
    const message = data.error || (data.message && data.message.en) || 'Failed to create task';
    throw new Error(message);
  }

  return {
    taskId: data.result.task_id,
    cost: data.result.task_cost,
    isSimulated: data.result.isSimulated || false,
    remaining: data.result.remaining,
  };
}

// Fetch task status
export async function getTask(taskId: string, accessCode?: string): Promise<TaskApiResult> {
  const url = `/api/tasks/${encodeURIComponent(taskId)}`;

  const res = await fetch(url, {
    headers: {
      ...(accessCode ? { 'x-access-code': accessCode } : {}),
    },
  });
  const data = await res.json();

  if (!res.ok || data.code !== 200) {
    const message = data.error || (data.message && data.message.en) || 'Failed to fetch task status';
    throw new Error(message);
  }

  return data.result;
}

// Get image proxy URL for seamless viewing and downloading
export function getProxyImageUrl(url: string, download = false): string {
  if (!url) return '';
  if (url.startsWith('/uploads/') || url.startsWith('blob:') || url.startsWith('data:')) {
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
  const res = await fetch('/api/support-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Възникна грешка при изпращане на писмото за подкрепа.');
  }

  return data;
}

