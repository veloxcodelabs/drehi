export const VISITOR_COOKIE_NAME = 'msl_vid';

/**
 * Ensures a random anonymous visitor ID is stored in a first-party cookie
 * with 1-year expiry and SameSite=None; Secure so it works inside embed iframes.
 */
export function getOrSetVisitorId(): string {
  if (typeof document === 'undefined') return '';

  const match = document.cookie.match(/(?:^|;\s*)msl_vid=([^;]+)/);
  if (match && match[1]) {
    const existing = decodeURIComponent(match[1].trim());
    if (existing) return existing;
  }

  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const newVid = 'msl_' + randomPart;

  const oneYearSeconds = 365 * 24 * 60 * 60;
  // First-party cookie with 1-year expiry, SameSite=None; Secure
  try {
    document.cookie = `${VISITOR_COOKIE_NAME}=${encodeURIComponent(newVid)}; max-age=${oneYearSeconds}; path=/; SameSite=None; Secure`;
  } catch (err) {
    console.warn('[Visitor] Could not write document.cookie:', err);
  }

  return newVid;
}
