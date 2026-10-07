/**
 * Deterministic size recommendation for a boutique chart.
 *
 * No model call lives here. The studio compares body measurements with the
 * shop's chart, and the generation prompt only receives the resulting centimetres.
 *
 * GPT Image 2.5 accepts prompt, reference images, aspect ratio, resolution, and
 * model variant. It does not accept a seed or a temperature, so those fields are
 * not sent. The same measurements always produce the same fit paragraph.
 */

export const FIT_TYPES = ['fitted', 'regular', 'loose'] as const;
export type FitType = (typeof FIT_TYPES)[number];

/**
 * Extra centimetres the garment must allow beyond the body.
 * Fitted stays inside the 2–4 cm range; regular and loose add more room.
 * Change these numbers to retune every shop at once.
 */
export const EASE_CM: Record<FitType, number> = {
  fitted: 3,
  regular: 6,
  loose: 10,
};

/** Acromion height as a fraction of stature. Chart length is shoulder to hem. */
export const SHOULDER_HEIGHT_RATIO = 0.82;

export const DEFAULT_SIZE_LABELS = ['XS', 'S', 'M', 'L', 'XL'] as const;
export const MAX_SIZE_ROWS = 12;

export const SIZE_RESULT_NOTE =
  'Пробата е ориентировъчна – за размера се доверете на препоръката по мерки.';

const BODY_RANGES = {
  height: [120, 230],
  bust: [50, 200],
  waist: [40, 200],
  hips: [50, 210],
} as const;

const GARMENT_RANGES = {
  bust: [40, 220],
  waist: [30, 220],
  hips: [40, 230],
  length: [15, 220],
} as const;

export interface SizeRow {
  label: string;
  bust: number;
  waist: number;
  hips: number;
  length: number;
}

export interface SizeChart {
  fit: FitType;
  sizes: SizeRow[];
}

export interface BodyMeasurements {
  height: number;
  bust: number;
  waist: number;
  hips: number;
}

export type FitZone = 'bust' | 'waist' | 'hips';
export type EaseWord = 'tight' | 'close' | 'relaxed' | 'loose';

export interface SizeRecommendation {
  /** First chart row (smallest, if the shop listed them that way) that covers the body plus ease. */
  sizeLabel: string | null;
  fits: boolean;
  message: string;
  smallerLabel: string | null;
  tightZones: FitZone[];
}

export type MeasurementRead =
  | { status: 'empty' }
  | { status: 'incomplete' }
  | { status: 'invalid' }
  | { status: 'ok'; body: BodyMeasurements };

export type ChartValidation =
  | { ok: true; chart: SizeChart }
  | { ok: false; error: string };

const ZONE_BG: Record<FitZone, string> = {
  bust: 'гърдите',
  waist: 'талията',
  hips: 'ханша',
};

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.replace(/\s+/g, ' ').trim();
  if (!label || label.length > 12) return null;
  if (/[\u0000-\u001F\u007F]/.test(label)) return null;
  return label;
}

function readCm(value: unknown, min: number, max: number): number | null {
  let text = '';
  if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else if (typeof value === 'string') text = value.trim().replace(',', '.');
  else return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Math.round(Number(text) * 10) / 10;
  if (n < min || n > max) return null;
  return n;
}

function readFit(value: unknown): FitType | null {
  return value === 'fitted' || value === 'regular' || value === 'loose' ? value : null;
}

export function validateSizeChart(input: unknown): ChartValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Таблицата с размери е непълна.' };
  }
  const record = input as Record<string, unknown>;
  const fit = readFit(record.fit);
  if (!fit) {
    return { ok: false, error: 'Изберете кройка: прилепнала, стандартна или свободна.' };
  }
  if (!Array.isArray(record.sizes) || record.sizes.length === 0) {
    return { ok: false, error: 'Добавете поне един размер.' };
  }
  if (record.sizes.length > MAX_SIZE_ROWS) {
    return { ok: false, error: 'Може да има най-много 12 размера.' };
  }

  const sizes: SizeRow[] = [];
  const seen = new Set<string>();
  for (const row of record.sizes) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { ok: false, error: 'Попълнете бюст, талия, ханш и дължина в сантиметри за всеки размер.' };
    }
    const fields = row as Record<string, unknown>;
    const label = cleanLabel(fields.label);
    if (!label) {
      return {
        ok: false,
        error: typeof fields.label === 'string' && fields.label.trim().length > 12
          ? 'Името на размера е твърде дълго.'
          : 'Всеки ред трябва да има име на размер.',
      };
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Размерът „${label}“ се повтаря.` };
    }
    seen.add(key);
    const bust = readCm(fields.bust, GARMENT_RANGES.bust[0], GARMENT_RANGES.bust[1]);
    const waist = readCm(fields.waist, GARMENT_RANGES.waist[0], GARMENT_RANGES.waist[1]);
    const hips = readCm(fields.hips, GARMENT_RANGES.hips[0], GARMENT_RANGES.hips[1]);
    const length = readCm(fields.length, GARMENT_RANGES.length[0], GARMENT_RANGES.length[1]);
    if (bust == null || waist == null || hips == null || length == null) {
      const missing = [fields.bust, fields.waist, fields.hips, fields.length].some(
        (value) => value === '' || value == null
      );
      return {
        ok: false,
        error: missing
          ? 'Попълнете бюст, талия, ханш и дължина в сантиметри за всеки размер.'
          : 'Мерките в таблицата са извън допустимия диапазон.',
      };
    }
    sizes.push({ label, bust, waist, hips, length });
  }

  return { ok: true, chart: { fit, sizes } };
}

export function parseSizeChart(value: unknown): SizeChart | null {
  const result = validateSizeChart(value);
  return result.ok ? result.chart : null;
}

export function interpretMeasurements(input: {
  height: string;
  bust: string;
  waist: string;
  hips: string;
}): MeasurementRead {
  const entries = [
    ['height', input.height, BODY_RANGES.height],
    ['bust', input.bust, BODY_RANGES.bust],
    ['waist', input.waist, BODY_RANGES.waist],
    ['hips', input.hips, BODY_RANGES.hips],
  ] as const;
  const filled = entries.filter(([, raw]) => raw.trim() !== '');
  if (filled.length === 0) return { status: 'empty' };

  const parsed: Partial<BodyMeasurements> = {};
  for (const [key, raw, range] of entries) {
    if (!raw.trim()) continue;
    const value = readCm(raw, range[0], range[1]);
    if (value == null) return { status: 'invalid' };
    parsed[key] = value;
  }
  if (filled.length < entries.length) return { status: 'incomplete' };
  return {
    status: 'ok',
    body: {
      height: parsed.height as number,
      bust: parsed.bust as number,
      waist: parsed.waist as number,
      hips: parsed.hips as number,
    },
  };
}

export function parseFitRequest(value: unknown): { size: string; body: BodyMeasurements } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const size = cleanLabel(typeof record.size === 'string' ? record.size : '');
  if (!size) return null;
  const height = readCm(record.height, BODY_RANGES.height[0], BODY_RANGES.height[1]);
  const bust = readCm(record.bust, BODY_RANGES.bust[0], BODY_RANGES.bust[1]);
  const waist = readCm(record.waist, BODY_RANGES.waist[0], BODY_RANGES.waist[1]);
  const hips = readCm(record.hips, BODY_RANGES.hips[0], BODY_RANGES.hips[1]);
  if (height == null || bust == null || waist == null || hips == null) return null;
  return { size, body: { height, bust, waist, hips } };
}

function covers(size: SizeRow, body: BodyMeasurements, ease: number): boolean {
  return size.bust >= body.bust + ease && size.waist >= body.waist + ease && size.hips >= body.hips + ease;
}

function tightZones(size: SizeRow, body: BodyMeasurements, ease: number): FitZone[] {
  const zones: FitZone[] = [];
  if (size.bust < body.bust + ease) zones.push('bust');
  if (size.waist < body.waist + ease) zones.push('waist');
  if (size.hips < body.hips + ease) zones.push('hips');
  return zones;
}

function joinZones(zones: FitZone[]): string {
  const names = zones.map((zone) => ZONE_BG[zone]);
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

/**
 * Smallest chart row whose bust, waist and hips are at least the body plus ease.
 * Rows are compared in the order the shop saved them, from smallest to largest.
 */
export function recommendSize(chart: SizeChart, body: BodyMeasurements): SizeRecommendation {
  const ease = EASE_CM[chart.fit];
  const sizes = chart.sizes;
  if (sizes.length === 0) {
    return { sizeLabel: null, fits: false, message: '', smallerLabel: null, tightZones: [] };
  }

  let chosenIndex = -1;
  for (let i = 0; i < sizes.length; i++) {
    if (covers(sizes[i], body, ease)) {
      chosenIndex = i;
      break;
    }
  }

  if (chosenIndex === -1) {
    const last = sizes[sizes.length - 1];
    const zones = tightZones(last, body, ease);
    const where = joinZones(zones);
    return {
      sizeLabel: last.label,
      fits: false,
      smallerLabel: null,
      tightZones: zones,
      message: where
        ? `Няма размер, който покрива мерките. Най-близък е ${last.label} — ще стяга в ${where}.`
        : `Няма размер, който покрива мерките. Най-близък е ${last.label}.`,
    };
  }

  const chosen = sizes[chosenIndex];
  if (chosenIndex === 0) {
    return {
      sizeLabel: chosen.label,
      fits: true,
      smallerLabel: null,
      tightZones: [],
      message: `Препоръчваме размер ${chosen.label}.`,
    };
  }

  const smaller = sizes[chosenIndex - 1];
  const zones = tightZones(smaller, body, ease);
  const where = joinZones(zones);
  return {
    sizeLabel: chosen.label,
    fits: true,
    smallerLabel: smaller.label,
    tightZones: zones,
    message: where
      ? `Препоръчваме размер ${chosen.label}. ${smaller.label} ще стяга в ${where}.`
      : `Препоръчваме размер ${chosen.label}.`,
  };
}

export function classifyEase(diffCm: number): EaseWord {
  if (diffCm < 2) return 'tight';
  if (diffCm < 6) return 'close';
  if (diffCm < 12) return 'relaxed';
  return 'loose';
}

/** Where the hem falls, assuming length is measured from the shoulder. */
export function describeHem(heightCm: number, garmentLengthCm: number): string {
  const hemFromFloor = SHOULDER_HEIGHT_RATIO * heightCm - garmentLengthCm;
  const ratio = hemFromFloor / heightCm;
  if (ratio >= 0.58) return 'at the waist';
  if (ratio >= 0.5) return 'at the hip';
  if (ratio >= 0.42) return 'on the upper thigh';
  if (ratio >= 0.36) return 'at mid-thigh';
  if (ratio >= 0.31) return 'above the knee';
  if (ratio >= 0.26) return 'at the knee';
  if (ratio >= 0.2) return 'below the knee';
  if (ratio >= 0.12) return 'at mid-calf';
  if (ratio >= 0.04) return 'at the ankle';
  return 'at the floor';
}

function formatCm(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function findSize(chart: SizeChart, label: string): SizeRow | null {
  const key = label.trim().toLowerCase();
  return chart.sizes.find((row) => row.label.toLowerCase() === key) || null;
}

export function buildFitGuidance(chart: SizeChart, sizeLabel: string, body: BodyMeasurements): string {
  const size = findSize(chart, sizeLabel);
  if (!size) return '';
  const zones: Array<[string, number, number]> = [
    ['Bust', size.bust, body.bust],
    ['Waist', size.waist, body.waist],
    ['Hips', size.hips, body.hips],
  ];
  const lines = zones.map(([name, garment, person]) => {
    const diff = Math.round((garment - person) * 10) / 10;
    return `${name}: garment ${formatCm(garment)} cm, body ${formatCm(person)} cm, difference ${formatCm(diff)} cm (${classifyEase(diff)}).`;
  });
  return [
    `Size and fit: render size ${size.label} from the ${chart.fit} size chart. Match these garment-to-body differences and do not invent a different size.`,
    ...lines,
    `Garment length ${formatCm(size.length)} cm on a person ${formatCm(body.height)} cm tall: the hem falls ${describeHem(body.height, size.length)}.`,
    'Keep the person\'s body proportions, pose, and footwear exactly as in the second reference photo. Do not slim, stretch, lengthen, or reshape the body or the shoes.',
    'Keep the garment\'s cut, length, neckline, sleeves, pattern, and details exactly as in the first reference photo. Do not redesign or rescale the garment. The fabric may only sit on the body according to the centimetre differences above.',
  ].join('\n');
}

/**
 * Append fit guidance from the shop's stored chart and drop `fit_request`
 * so it is never forwarded as its own model parameter.
 * No chart, or an unusable request, leaves `prompt` unchanged.
 */
export function applyFitRequest(input: unknown, chart: SizeChart | null): Record<string, unknown> {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const next: Record<string, unknown> = { ...source };
  const request = next.fit_request;
  delete next.fit_request;
  if (!chart) return next;
  const parsed = parseFitRequest(request);
  if (!parsed) return next;
  const guidance = buildFitGuidance(chart, parsed.size, parsed.body);
  if (!guidance) return next;
  const base = typeof next.prompt === 'string' ? next.prompt.trim() : '';
  next.prompt = base ? `${base}\n\n${guidance}` : guidance;
  return next;
}
