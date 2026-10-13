import type { Request } from 'express';
import crypto from 'crypto';

export const VISITOR_COOKIE_NAME = 'msl_vid';
export const DEFAULT_DAILY_PER_VISITOR = 10;
export const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60; // 31536000 seconds

/**
 * Returns current date string in Europe/Sofia timezone (YYYY-MM-DD).
 */
export function getSofiaDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Formats the standard message when a visitor reaches their daily limit.
 */
export function formatVisitorDailyLimitMessage(limit: number = DEFAULT_DAILY_PER_VISITOR): string {
  return `Достигнахте дневния лимит от ${limit} проби. Опитайте отново утре.`;
}

/**
 * Extracts anonymous visitor identification from the request.
 * Priority:
 *   1. First-party cookie "msl_vid" (SameSite=None; Secure)
 *   2. Client header fallback "x-visitor-id"
 *   3. Client IP from "x-forwarded-for" (first IP in chain)
 *   4. Client socket remoteAddress
 */
export function extractVisitorId(req: Request): { visitorId: string; source: 'cookie' | 'header' | 'ip' } {
  // 1. Check first-party cookie
  const cookieHeader = req.headers?.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)msl_vid=([^;]+)/);
    if (match && match[1]) {
      const val = decodeURIComponent(match[1].trim());
      if (val) {
        return { visitorId: `cookie:${val}`, source: 'cookie' };
      }
    }
  }

  // 2. Check client header fallback
  const headerVid = req.headers?.['x-visitor-id'];
  if (typeof headerVid === 'string' && headerVid.trim()) {
    return { visitorId: `cookie:${headerVid.trim()}`, source: 'header' };
  }

  // 3. Fallback to client IP (x-forwarded-for)
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const firstIp = xff.split(',')[0].trim();
    if (firstIp) {
      return { visitorId: `ip:${firstIp}`, source: 'ip' };
    }
  } else if (Array.isArray(xff) && xff.length > 0 && xff[0]) {
    const firstIp = xff[0].split(',')[0].trim();
    if (firstIp) {
      return { visitorId: `ip:${firstIp}`, source: 'ip' };
    }
  }

  // 4. Remote address fallback
  const remoteIp = req.socket?.remoteAddress || (req as any).ip || '127.0.0.1';
  return { visitorId: `ip:${remoteIp}`, source: 'ip' };
}

/**
 * Computes a SHA-256 hash of the visitor identifier so that no personal data
 * or raw IP addresses are ever stored in memory.
 */
export function hashVisitorId(visitorId: string): string {
  return crypto.createHash('sha256').update(visitorId).digest('hex');
}

/**
 * In-memory store for visitor daily generation counts.
 * - Keyed by `${code}:${visitorHash}` for the current Europe/Sofia calendar day.
 * - Stores ONLY the anonymous ID hash and integer count.
 * - Automatically resets all counters when the Europe/Sofia day changes.
 */
export class VisitorDailyCounterStore {
  private currentDay: string = getSofiaDateString();
  // key: `${code}:${visitorHash}` -> count
  private counts = new Map<string, number>();

  private ensureDay(date?: Date): string {
    const today = getSofiaDateString(date);
    if (today !== this.currentDay) {
      this.counts.clear();
      this.currentDay = today;
    }
    return today;
  }

  /**
   * Retrieves how many generations this visitor has completed today for this code.
   */
  public getCount(visitorHash: string, code: string, date?: Date): number {
    this.ensureDay(date);
    const key = `${code.toLowerCase()}:${visitorHash}`;
    return this.counts.get(key) || 0;
  }

  /**
   * Increments the generation count for this visitor and code.
   */
  public increment(visitorHash: string, code: string, date?: Date): number {
    this.ensureDay(date);
    const key = `${code.toLowerCase()}:${visitorHash}`;
    const next = (this.counts.get(key) || 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  /**
   * Checks whether this visitor has reached or exceeded their daily limit.
   */
  public isLimitReached(visitorHash: string, code: string, limit: number, date?: Date): boolean {
    return this.getCount(visitorHash, code, date) >= limit;
  }

  /**
   * Calculates remaining tries for this visitor on this code today.
   */
  public getRemaining(visitorHash: string, code: string, limit: number, date?: Date): number {
    const used = this.getCount(visitorHash, code, date);
    return Math.max(0, limit - used);
  }

  /**
   * Manually resets memory state (useful for testing or day transitions).
   */
  public reset(day?: string): void {
    this.counts.clear();
    this.currentDay = day || getSofiaDateString();
  }

  public getCurrentDay(): string {
    return this.ensureDay();
  }

  public getTrackedEntriesCount(): number {
    this.ensureDay();
    return this.counts.size;
  }
}

export const visitorCounter = new VisitorDailyCounterStore();
