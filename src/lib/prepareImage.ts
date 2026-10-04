import { IMAGE_FORMAT_MESSAGE, IMAGE_TOO_LARGE_MESSAGE, IMAGE_UPLOAD_FAILED_MESSAGE } from '../../image_payload';

const MAX_EDGE = 2000;
const TARGET_BYTES = 1_500_000;

type Drawable = { width: number; height: number };

async function decodeImage(file: File): Promise<Drawable & CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // HEIC and some camera formats only decode in certain browsers.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(IMAGE_FORMAT_MESSAGE));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderBlob(source: Drawable & CanvasImageSource, maxEdge: number, quality: number): Promise<Blob> {
  const longest = Math.max(source.width, source.height) || 1;
  const scale = Math.min(1, maxEdge / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error(IMAGE_UPLOAD_FAILED_MESSAGE);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(IMAGE_UPLOAD_FAILED_MESSAGE))),
      'image/jpeg',
      quality
    );
  });
}

/** Shrink a shopper photo before it is posted, so the JSON body stays under the host limit. */
export async function prepareImageFile(file: File): Promise<{ file: File; previewUrl: string }> {
  let source: Drawable & CanvasImageSource;
  try {
    source = await decodeImage(file);
  } catch (error) {
    if (error instanceof Error && error.message === IMAGE_FORMAT_MESSAGE) throw error;
    throw new Error(IMAGE_FORMAT_MESSAGE);
  }

  let edge = MAX_EDGE;
  let quality = 0.85;
  let blob = await renderBlob(source, edge, quality);
  while (blob.size > TARGET_BYTES && (quality > 0.5 || edge > 800)) {
    if (quality > 0.5) quality = Math.round((quality - 0.1) * 10) / 10;
    else edge = Math.round(edge * 0.85);
    blob = await renderBlob(source, edge, quality);
  }
  if ('close' in source && typeof source.close === 'function') source.close();
  if (blob.size > TARGET_BYTES) throw new Error(IMAGE_TOO_LARGE_MESSAGE);

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  const prepared = new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  return { file: prepared, previewUrl: URL.createObjectURL(blob) };
}
