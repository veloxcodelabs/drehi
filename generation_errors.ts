/**
 * Turns upstream image-API failures into a short Bulgarian message for the
 * visitor, while keeping the raw payload for server logs.
 *
 * Google AI Pro (the consumer Gemini subscription) does not raise Gemini API
 * quotas. When the image service answers 429 / RESOURCE_EXHAUSTED, the log
 * line includes the quota metric name from the upstream body.
 */

export const QUOTA_PUBLIC_MESSAGE =
  'В момента лимитът на услугата за генериране е изчерпан. Това не е от вашите проби — пробата не е отнета. Моля, опитайте по-късно.';

export const FAILURE_PUBLIC_MESSAGE =
  'Генерирането не успя. Пробата не е отнета. Моля, опитайте отново.';

export const STORAGE_PUBLIC_MESSAGE =
  'Системата за проби временно не е достъпна. Моля, опитайте отново след малко.';

export const UNCONFIGURED_PUBLIC_MESSAGE =
  'Генерирането временно не е достъпно. Пробата не е отнета. Моля, опитайте по-късно.';

export interface ClassifiedUpstreamError {
  kind: 'quota' | 'other';
  publicMessage: string;
  httpStatus: number;
  quotaMetric: string | null;
  summary: string;
}

function stringifyBody(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export function extractQuotaMetric(text: string): string | null {
  const patterns = [
    /quota metric ['"]([^'"]+)['"]/i,
    /["']quota_metric["']\s*:\s*["']([^"']+)["']/i,
    /["']quotaMetric["']\s*:\s*["']([^"']+)["']/i,
    /["']metric["']\s*:\s*["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function isQuotaFailure(httpStatus: number, text: string): boolean {
  if (httpStatus === 429) return true;
  return /resource_exhausted|quota exceeded|exceeded your current quota|rate[\s_-]?limit|too many requests|quota metric|check your plan and billing|insufficient_quota/i.test(
    text
  );
}

export function classifyUpstreamFailure(httpStatus: number, body: unknown): ClassifiedUpstreamError {
  const summary = stringifyBody(body).slice(0, 8000);
  const quota = isQuotaFailure(httpStatus, summary);
  const metric = extractQuotaMetric(summary);
  return {
    kind: quota ? 'quota' : 'other',
    publicMessage: quota ? QUOTA_PUBLIC_MESSAGE : FAILURE_PUBLIC_MESSAGE,
    httpStatus: quota ? 429 : httpStatus >= 400 && httpStatus <= 599 ? httpStatus : 502,
    quotaMetric: metric,
    summary,
  };
}

export function logUpstreamFailure(context: string, classified: ClassifiedUpstreamError, body: unknown): void {
  console.error(
    `[Generation upstream error] context=${context} kind=${classified.kind} http=${classified.httpStatus} quotaMetric=${classified.quotaMetric ?? 'n/a'}`
  );
  console.error('[Generation upstream body]', typeof body === 'string' ? body : safeJson(body));
}

function safeJson(body: unknown): string {
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
