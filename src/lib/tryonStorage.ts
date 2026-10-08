import { CustomerMeasurements, SizeChart, GenerationTask, UploadedImage } from '../types';

/**
 * Deterministic string hash function.
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Hash an uploaded image by its URL, filename and size.
 */
export function hashImage(
  img: { url?: string; previewUrl?: string; filename?: string; size?: number } | null | undefined
): string {
  if (!img) return 'none';
  const raw = `${img.url || img.previewUrl || ''}#${img.filename || ''}#${img.size || 0}`;
  return hashString(raw);
}

export type CacheImageInput = {
  url?: string;
  previewUrl?: string;
  filename?: string;
  size?: number;
  id?: string;
};

/**
 * Computes consistency cache key:
 * key = hash(person photo) + hash(garment image) + chosen size + body measurements
 */
export function buildConsistencyCacheKey(
  personImg: CacheImageInput | null | undefined,
  garmentImg: CacheImageInput | null | undefined,
  chosenSize: string | null | undefined,
  measurements: CustomerMeasurements | null | undefined
): string {
  const pHash = hashImage(personImg);
  const gHash = hashImage(garmentImg);
  const sizeKey = (chosenSize || 'none').trim().toUpperCase();
  const mKey = `h${measurements?.height ?? 0}_b${measurements?.bust ?? 0}_w${measurements?.waist ?? 0}_hp${measurements?.hips ?? 0}`;
  return `tryon_cc_${pHash}_${gHash}_${sizeKey}_${mKey}`;
}

export function isTaskOutputExpired(task?: GenerationTask | null): boolean {
  if (!task || !Array.isArray(task.outputUrls) || task.outputUrls.length === 0) return false;
  const url = task.outputUrls[0];
  if (!url) return false;
  if (url.startsWith('/uploads/') || url.startsWith('data:') || url.startsWith('blob:')) return false;
  const expiresMatch = url.match(/[?&]Expires=(\d+)/i);
  if (expiresMatch) {
    const expiresSec = parseInt(expiresMatch[1], 10);
    if (!isNaN(expiresSec) && Date.now() / 1000 > expiresSec) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates the exact expiry timestamp in milliseconds for a task's stored image.
 * Uses presigned URL expiration if present (e.g. Alibaba OSS / AWS S3), or a 24-hour window for uploads.
 */
export function getTaskImageExpiryTime(task?: GenerationTask | null): number | null {
  if (!task || !Array.isArray(task.outputUrls) || task.outputUrls.length === 0) return null;

  for (const url of task.outputUrls) {
    if (typeof url === 'string') {
      const match = url.match(/[?&]Expires=(\d+)/i);
      if (match) {
        const sec = parseInt(match[1], 10);
        if (!isNaN(sec) && sec > 0) {
          return sec * 1000;
        }
      }
    }
  }

  if (Array.isArray(task.referenceImages)) {
    for (const url of task.referenceImages) {
      if (typeof url === 'string') {
        const match = url.match(/[?&]Expires=(\d+)/i);
        if (match) {
          const sec = parseInt(match[1], 10);
          if (!isNaN(sec) && sec > 0) {
            return sec * 1000;
          }
        }
      }
    }
  }

  // For local /uploads/ or permanent images, assign a 24-hour cache TTL from task creation/completion
  const baseTime = task.completedAt || task.createdAt || Date.now();
  return baseTime + 24 * 60 * 60 * 1000;
}

export interface ConsistencyCacheEntry {
  task: GenerationTask;
  expiresAt: number | null;
  cachedAt: number;
}

const CONSISTENCY_CACHE_PREFIX = 'martitony_cc_v1_';

export function removeCachedTryOnResult(cacheKey: string): void {
  if (typeof window === 'undefined' || !cacheKey) return;
  try {
    localStorage.removeItem(`${CONSISTENCY_CACHE_PREFIX}${cacheKey}`);
    console.log(`[Consistency Cache] Removed cache entry for key "${cacheKey}".`);
  } catch (err) {
    console.warn('[Consistency Cache] Could not remove cache entry:', err);
  }
}

export function getCachedTryOnResult(cacheKey: string): GenerationTask | null {
  if (typeof window === 'undefined' || !cacheKey) return null;
  try {
    const raw = localStorage.getItem(`${CONSISTENCY_CACHE_PREFIX}${cacheKey}`);
    if (!raw) {
      console.log(`[Consistency Cache] Cache miss for key "${cacheKey}" (no entry in storage).`);
      return null;
    }
    const parsed = JSON.parse(raw);
    let task: GenerationTask;
    let expiresAt: number | null = null;
    if (parsed && parsed.task && typeof parsed.cachedAt === 'number') {
      task = parsed.task;
      expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : null;
    } else {
      task = parsed as GenerationTask;
      expiresAt = getTaskImageExpiryTime(task);
    }

    if (!task || !Array.isArray(task.outputUrls) || task.outputUrls.length === 0) {
      console.log(`[Consistency Cache] Cache miss for key "${cacheKey}" (entry has no valid outputUrls). Purging.`);
      removeCachedTryOnResult(cacheKey);
      return null;
    }

    // Check expiry timestamp
    if (expiresAt && Date.now() >= expiresAt) {
      console.log(
        `[Consistency Cache] Cache expired for key "${cacheKey}". Image expired at ${new Date(
          expiresAt
        ).toISOString()} (now: ${new Date().toISOString()}). Reason: image expiry timestamp passed. Purging.`
      );
      removeCachedTryOnResult(cacheKey);
      return null;
    }

    // Check if task output signature is expired
    if (isTaskOutputExpired(task)) {
      console.log(
        `[Consistency Cache] Cache expired for key "${cacheKey}". Reason: task output signature is expired. Purging.`
      );
      removeCachedTryOnResult(cacheKey);
      return null;
    }

    console.log(
      `[Consistency Cache] Cache hit for key "${cacheKey}". Stored image expiry: ${
        expiresAt ? new Date(expiresAt).toISOString() : 'none'
      }. Verifying image availability...`
    );
    return task;
  } catch (err) {
    console.warn(`[Consistency Cache] Could not read cache for key "${cacheKey}":`, err);
    return null;
  }
}

export function saveCachedTryOnResult(cacheKey: string, task: GenerationTask): void {
  if (typeof window === 'undefined' || !cacheKey || !task) return;
  try {
    const expiresAt = getTaskImageExpiryTime(task);
    const entry: ConsistencyCacheEntry = {
      task,
      expiresAt,
      cachedAt: Date.now(),
    };
    localStorage.setItem(`${CONSISTENCY_CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry));
    console.log(
      `[Consistency Cache] Saved entry for key "${cacheKey}". Expiry time set to: ${
        expiresAt ? new Date(expiresAt).toISOString() : 'none'
      }.`
    );
  } catch (err) {
    console.warn('[Consistency Cache] Could not write cache:', err);
  }
}

/**
 * Verifies that a target image URL actually exists and can be loaded in the browser.
 * Resolves to true if image loads successfully; false if it 404s, 403s, 410s, or times out.
 */
export async function verifyImageUrlLoads(url: string, timeoutMs: number = 2500): Promise<boolean> {
  if (!url || typeof window === 'undefined') return false;
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve(false);
      }
    }, timeoutMs);

    const img = new Image();
    img.onload = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(true);
      }
    };
    img.onerror = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(false);
      }
    };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

/**
 * Per-garment size chart storage keyed by garment image hash
 */
export function getSavedGarmentTable(
  garmentImg: UploadedImage | null | undefined
): SizeChart | null {
  if (!garmentImg || typeof window === 'undefined') return null;
  const gHash = hashImage(garmentImg);
  try {
    const raw = localStorage.getItem(`garment_size_table_${gHash}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not load saved garment chart:', err);
    return null;
  }
}

export function saveGarmentTable(
  garmentImg: UploadedImage | null | undefined,
  chart: SizeChart
): void {
  if (!garmentImg || typeof window === 'undefined') return;
  const gHash = hashImage(garmentImg);
  try {
    localStorage.setItem(`garment_size_table_${gHash}`, JSON.stringify(chart));
  } catch (err) {
    console.warn('Could not save garment chart:', err);
  }
}

/**
 * Customer body measurements persistence in browser (localStorage)
 */
const BODY_MEASUREMENTS_STORAGE_KEY = 'martitony_customer_body_measurements_v1';

export function getSavedBodyMeasurements(): CustomerMeasurements {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BODY_MEASUREMENTS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not load saved body measurements:', err);
    return {};
  }
}

export function saveBodyMeasurements(measurements: CustomerMeasurements): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BODY_MEASUREMENTS_STORAGE_KEY, JSON.stringify(measurements));
  } catch (err) {
    console.warn('Could not save body measurements:', err);
  }
}
