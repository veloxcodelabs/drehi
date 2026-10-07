/**
 * Size recommendation math and fit-aware prompt generation.
 * Pure deterministic logic — no external AI or network calls.
 */

export type FitType = 'slim' | 'regular' | 'relaxed';

export interface SizeRow {
  size: string; // e.g. "XS", "S", "M", "L", "XL"
  bust: number; // cm
  waist: number; // cm
  hips: number; // cm
  length?: number; // cm (shoulder to hem)
}

export interface SizeChart {
  fitType: FitType;
  rows: SizeRow[];
  updatedAt?: number;
}

export interface CustomerMeasurements {
  height?: number; // cm
  bust?: number; // cm
  waist?: number; // cm
  hips?: number; // cm
}

export interface SizeRecommendation {
  recommendedSize: string | null;
  explanationBg: string;
  smallerSize?: string;
  tightestZoneBg?: string;
  isOverMax?: boolean;
}

export const FIT_TYPE_LABELS: Record<FitType, string> = {
  regular: 'Стандартна',
  slim: 'Прилепнала',
  relaxed: 'Свободна',
};

export const DEFAULT_SAMPLE_SIZE_ROWS: SizeRow[] = [
  { size: 'XS', bust: 82, waist: 64, hips: 90, length: 85 },
  { size: 'S', bust: 86, waist: 68, hips: 94, length: 86 },
  { size: 'M', bust: 90, waist: 72, hips: 98, length: 88 },
  { size: 'L', bust: 96, waist: 78, hips: 104, length: 90 },
  { size: 'XL', bust: 102, waist: 84, hips: 110, length: 92 },
];

const STANDARD_SIZE_ORDER: Record<string, number> = {
  '3XS': 5,
  'XXS': 10,
  'XS': 20,
  'S': 30,
  'M': 40,
  'L': 50,
  'XL': 60,
  '2XL': 70,
  'XXL': 70,
  '3XL': 80,
  'XXXL': 80,
  '4XL': 90,
  '5XL': 100,
};

export function sortSizeRows(rows: SizeRow[]): SizeRow[] {
  return [...rows].sort((a, b) => {
    const aKey = a.size.trim().toUpperCase();
    const bKey = b.size.trim().toUpperCase();
    const orderA = STANDARD_SIZE_ORDER[aKey];
    const orderB = STANDARD_SIZE_ORDER[bKey];
    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }
    const numA = parseFloat(aKey);
    const numB = parseFloat(bKey);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    if (a.bust && b.bust && a.bust !== b.bust) {
      return a.bust - b.bust;
    }
    return aKey.localeCompare(bKey);
  });
}

/** Ease allowance in cm based on garment cut */
export function getEaseAllowance(fitType: FitType = 'regular'): number {
  switch (fitType) {
    case 'slim':
      return 3;
    case 'relaxed':
      return 10;
    case 'regular':
    default:
      return 6;
  }
}

/**
 * Recommend the smallest size where chart bust, waist, and hips
 * are each >= customer measurement + ease allowance.
 */
export function recommendSize(
  chart: SizeChart | null | undefined,
  measurements: CustomerMeasurements | null | undefined
): SizeRecommendation {
  if (!chart || !Array.isArray(chart.rows) || chart.rows.length === 0) {
    return { recommendedSize: null, explanationBg: '' };
  }

  const bust = typeof measurements?.bust === 'number' && measurements.bust > 0 ? measurements.bust : 0;
  const waist = typeof measurements?.waist === 'number' && measurements.waist > 0 ? measurements.waist : 0;
  const hips = typeof measurements?.hips === 'number' && measurements.hips > 0 ? measurements.hips : 0;

  if (bust === 0 && waist === 0 && hips === 0) {
    return { recommendedSize: null, explanationBg: '' };
  }

  const sortedRows = sortSizeRows(chart.rows);
  const ease = getEaseAllowance(chart.fitType);
  const targetBust = bust > 0 ? bust + ease : 0;
  const targetWaist = waist > 0 ? waist + ease : 0;
  const targetHips = hips > 0 ? hips + ease : 0;

  let recIdx = -1;
  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    const fitsBust = targetBust === 0 || row.bust >= targetBust;
    const fitsWaist = targetWaist === 0 || row.waist >= targetWaist;
    const fitsHips = targetHips === 0 || row.hips >= targetHips;

    if (fitsBust && fitsWaist && fitsHips) {
      recIdx = i;
      break;
    }
  }

  if (recIdx !== -1) {
    const recommended = sortedRows[recIdx];
    if (recIdx > 0) {
      const smaller = sortedRows[recIdx - 1];
      const bDef = targetBust > 0 ? targetBust - smaller.bust : 0;
      const wDef = targetWaist > 0 ? targetWaist - smaller.waist : 0;
      const hDef = targetHips > 0 ? targetHips - smaller.hips : 0;

      let tightestZone = 'в гърдите';
      const maxDef = Math.max(bDef, wDef, hDef);
      if (maxDef === wDef && wDef > 0) {
        tightestZone = 'в талията';
      } else if (maxDef === hDef && hDef > 0) {
        tightestZone = 'в ханша';
      } else if (bDef > 0) {
        tightestZone = 'в гърдите';
      }

      return {
        recommendedSize: recommended.size,
        smallerSize: smaller.size,
        tightestZoneBg: tightestZone,
        explanationBg: `Препоръчваме размер ${recommended.size}. ${smaller.size} ще стяга ${tightestZone}.`,
      };
    }

    return {
      recommendedSize: recommended.size,
      explanationBg: `Препоръчваме размер ${recommended.size}.`,
    };
  }

  // Measurements exceed the largest size in the chart
  const largest = sortedRows[sortedRows.length - 1];
  return {
    recommendedSize: largest.size,
    isOverMax: true,
    explanationBg: `Препоръчваме размер ${largest.size}. Мерките са близо до горната граница на таблицата.`,
  };
}

export function describeFitDifference(garmentCm: number, bodyCm: number): string {
  const diff = garmentCm - bodyCm;
  if (diff < 0) return 'tight, fabric pulling';
  if (diff <= 4) return 'close-fitting';
  if (diff <= 10) return 'relaxed';
  return 'loose';
}

export function describeHemPosition(garmentLength?: number, height?: number): string | null {
  if (!garmentLength || garmentLength <= 0) return null;
  if (height && height > 0) {
    const ratio = garmentLength / height;
    if (ratio < 0.38) return 'hem at waist/hip level';
    if (ratio < 0.5) return 'hem at mid-thigh';
    if (ratio < 0.58) return 'hem just above the knee';
    if (ratio < 0.65) return 'hem at the knee';
    if (ratio < 0.78) return 'hem at mid-calf';
    return 'hem near the ankles';
  }
  return null;
}

export const EXACT_PROPORTIONS_INVARIANT =
  "Always keep the person's face, body proportions, pose, background and footwear unchanged, and keep the garment's cut, color, pattern and details exactly as in the garment image.";

/**
 * Builds fit-aware guidance appended to the image generation prompt.
 */
export function buildFitPromptGuidance(
  chart: SizeChart | null | undefined,
  chosenSize: string | null | undefined,
  measurements: CustomerMeasurements | null | undefined
): string {
  if (!chosenSize) return '';
  const row = chart?.rows?.find((r) => r.size.toUpperCase() === chosenSize.toUpperCase());

  const sentences: string[] = [];
  if (row) {
    if (typeof row.bust === 'number' && row.bust > 0 && typeof measurements?.bust === 'number' && measurements.bust > 0) {
      const desc = describeFitDifference(row.bust, measurements.bust);
      sentences.push(`At the bust, the garment is ${desc}.`);
    }
    if (typeof row.waist === 'number' && row.waist > 0 && typeof measurements?.waist === 'number' && measurements.waist > 0) {
      const desc = describeFitDifference(row.waist, measurements.waist);
      sentences.push(`At the waist, the garment is ${desc}.`);
    }
    if (typeof row.hips === 'number' && row.hips > 0 && typeof measurements?.hips === 'number' && measurements.hips > 0) {
      const desc = describeFitDifference(row.hips, measurements.hips);
      sentences.push(`At the hips, the garment is ${desc}.`);
    }

    const hem = describeHemPosition(row.length, measurements?.height);
    if (hem) {
      sentences.push(`Garment ${hem}.`);
    }
  }

  const fitSentence = sentences.length > 0
    ? sentences.join(' ')
    : `Garment fit is tailored for chosen size ${chosenSize.toUpperCase()}.`;

  return `${fitSentence} ${EXACT_PROPORTIONS_INVARIANT}`;
}

/**
 * Appends fit guidance to prompt if not already present.
 */
export function applyFitGuidanceToPrompt(
  prompt: unknown,
  chart: SizeChart | null | undefined,
  chosenSize: string | null | undefined,
  measurements: CustomerMeasurements | null | undefined
): string {
  const base = typeof prompt === 'string' ? prompt.trim() : '';
  if (!chosenSize) return base;
  if (base.includes(EXACT_PROPORTIONS_INVARIANT)) return base;

  const guidance = buildFitPromptGuidance(chart, chosenSize, measurements);
  if (!guidance) return base;
  return base ? `${base}\n\n${guidance}` : guidance;
}
