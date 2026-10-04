/** Optional free-text note appended to the VModel `prompt`. Change the cap here. */
export const EXTRA_INSTRUCTIONS_MAX_CHARS = 300;

/**
 * Trim, drop control characters, collapse whitespace, and cap length.
 * Non-strings and blank text become an empty string so the request stays unchanged.
 */
export function sanitizeExtraInstructions(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, EXTRA_INSTRUCTIONS_MAX_CHARS)
    .trim();
}

/**
 * Append sanitized extra instructions to `input.prompt` and drop the extra field
 * so it is not forwarded as its own parameter. An empty note leaves `prompt` as-is.
 */
export function applyExtraInstructions(input: unknown): Record<string, unknown> {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const next: Record<string, unknown> = { ...source };
  const extra = sanitizeExtraInstructions(next.extra_instructions);
  delete next.extra_instructions;
  if (!extra) return next;

  const base = typeof next.prompt === 'string' ? next.prompt.trim() : '';
  next.prompt = base ? `${base}\n\nAdditional instructions: ${extra}` : extra;
  return next;
}
