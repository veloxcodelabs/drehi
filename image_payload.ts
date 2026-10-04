/** Shown when a photo cannot be sent without exceeding the host body limit. */
export const IMAGE_TOO_LARGE_MESSAGE =
  'Снимката е твърде голяма. Моля, качете по-малка снимка (до около 1,5 MB).';

export const IMAGE_FORMAT_MESSAGE =
  'Този формат не се поддържа. Моля, качете JPG или PNG.';

export const IMAGE_UPLOAD_FAILED_MESSAGE =
  'Снимката не можа да се качи. Моля, опитайте отново.';

/**
 * True when a create/upload payload still contains image bytes (data URL or a huge
 * non-URL string). Generation must be refused before a try is reserved.
 */
export function requestContainsImageData(value: unknown): boolean {
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^data:/i.test(text)) return true;
    if (text.length > 50_000 && !/^https?:\/\//i.test(text)) return true;
    return false;
  }
  if (Array.isArray(value)) return value.some((item) => requestContainsImageData(item));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => requestContainsImageData(item));
  }
  return false;
}

export function isPublicHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}
