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

/**
 * Computes consistency cache key:
 * key = hash(person photo) + hash(garment image) + chosen size + body measurements
 */
export function buildConsistencyCacheKey(
  personImg: UploadedImage | null | undefined,
  garmentImg: UploadedImage | null | undefined,
  chosenSize: string | null | undefined,
  measurements: CustomerMeasurements | null | undefined
): string {
  const pHash = hashImage(personImg);
  const gHash = hashImage(garmentImg);
  const sizeKey = (chosenSize || 'none').trim().toUpperCase();
  const mKey = `h${measurements?.height ?? 0}_b${measurements?.bust ?? 0}_w${measurements?.waist ?? 0}_hp${measurements?.hips ?? 0}`;
  return `tryon_cc_${pHash}_${gHash}_${sizeKey}_${mKey}`;
}

const CONSISTENCY_CACHE_PREFIX = 'martitony_cc_v1_';

export function getCachedTryOnResult(cacheKey: string): GenerationTask | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CONSISTENCY_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read try-on consistency cache:', err);
    return null;
  }
}

export function saveCachedTryOnResult(cacheKey: string, task: GenerationTask): void {
  if (typeof window === 'undefined' || !cacheKey) return;
  try {
    localStorage.setItem(`${CONSISTENCY_CACHE_PREFIX}${cacheKey}`, JSON.stringify(task));
  } catch (err) {
    console.warn('Could not write try-on consistency cache:', err);
  }
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
