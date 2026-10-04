import sharp from 'sharp';

/**
 * Shown when the try-on result is still the model photo, or the image service
 * says it could not apply a garment. The try is refunded in that case.
 */
export const GARMENT_UNRECOGNIZED_MESSAGE =
  'Не успяхме да разпознаем дрехата — качете ясна снимка на една дреха.';

/**
 * GPT Image 2.5 has no garment/person fields. The only order it sees is
 * `img_urls`: index 0 is the garment, index 1 is the person.
 */
export const GARMENT_ROLE_PROMPT =
  'The first reference image is the garment to put on. The second reference image is the person. Replace the clothes the person is currently wearing with the exact garment from the first image. Keep the person\'s face, body, and pose. Do not return the second image unchanged.';

const GRID = 32;
const BLOCK = 8;

export function withGarmentRoles(prompt: unknown, imageCount: number): string {
  const base = typeof prompt === 'string' ? prompt.trim() : '';
  if (imageCount !== 2) return base;
  if (base.startsWith(GARMENT_ROLE_PROMPT)) return base;
  return base ? `${GARMENT_ROLE_PROMPT}\n\n${base}` : GARMENT_ROLE_PROMPT;
}

/** Reads only error/logs. The prompt itself mentions "garment" and must not count. */
export function upstreamSignalsUnappliedGarment(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const record = result as { error?: unknown; logs?: unknown };
  const text = [record.error, record.logs]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n');
  if (!text) return false;
  return /could not (?:detect|recognize|identify|apply|find)|(?:no|missing|empty) (?:garment|clothing|mask)|garment (?:not )?(?:found|detected|recognized|applied)|failed to (?:segment|parse|apply) (?:the )?(?:garment|clothing|mask)|clothing not (?:detected|recognized)/i.test(
    text
  );
}

export function isNearDuplicateGrid(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length !== GRID * GRID * 3) return false;
  const { mad, correlation } = scoreGrids(a, b);
  if (mad <= 3.5) return true;

  let unchangedBlocks = 0;
  const blocksPerSide = GRID / BLOCK;
  for (let by = 0; by < GRID; by += BLOCK) {
    for (let bx = 0; bx < GRID; bx += BLOCK) {
      let sad = 0;
      let count = 0;
      for (let y = by; y < by + BLOCK; y++) {
        for (let x = bx; x < bx + BLOCK; x++) {
          const i = (y * GRID + x) * 3;
          sad += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          count += 3;
        }
      }
      if (sad / count <= 12) unchangedBlocks++;
    }
  }
  return unchangedBlocks === blocksPerSide * blocksPerSide && correlation >= 0.96 && mad <= 14;
}

function scoreGrids(a: Uint8Array, b: Uint8Array): { mad: number; correlation: number } {
  const pixels = a.length / 3;
  let sad = 0;
  let sumA = 0;
  let sumB = 0;
  const lumA = new Float64Array(pixels);
  const lumB = new Float64Array(pixels);
  for (let i = 0, p = 0; i < a.length; i += 3, p++) {
    sad += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    lumA[p] = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    lumB[p] = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    sumA += lumA[p];
    sumB += lumB[p];
  }
  const meanA = sumA / pixels;
  const meanB = sumB / pixels;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let p = 0; p < pixels; p++) {
    const da = lumA[p] - meanA;
    const db = lumB[p] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return {
    mad: sad / a.length,
    correlation: den === 0 ? 1 : num / den,
  };
}

async function downloadImage(url: string, token: string): Promise<Buffer | null> {
  try {
    const headers: Record<string, string> = {};
    if (token && /vmodel\.ai/i.test(url)) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 32 || bytes.length > 25_000_000) return null;
    return bytes;
  } catch (error) {
    console.warn('[Garment check] image download failed', error);
    return null;
  }
}

async function toGrid(bytes: Buffer): Promise<Uint8Array> {
  const raw = await sharp(bytes).resize(GRID, GRID, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  return new Uint8Array(raw);
}

/**
 * True when the output is a near-copy of the model photo.
 * Null when the images could not be read — the caller should keep the result.
 */
export async function outputMatchesModelPhoto(
  outputUrl: string,
  modelUrl: string,
  token = ''
): Promise<boolean | null> {
  if (!outputUrl || !modelUrl) return null;
  if (outputUrl === modelUrl) return true;
  const [output, model] = await Promise.all([
    downloadImage(outputUrl, token),
    downloadImage(modelUrl, token),
  ]);
  if (!output || !model) return null;
  try {
    const [outputGrid, modelGrid] = await Promise.all([toGrid(output), toGrid(model)]);
    return isNearDuplicateGrid(outputGrid, modelGrid);
  } catch (error) {
    console.warn('[Garment check] could not decode images', error);
    return null;
  }
}
