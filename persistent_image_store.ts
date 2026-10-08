import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getFirestoreDb, isFirestoreMode } from './usage_store.js';

export interface PersistentImageRecord {
  id: string;
  data: string; // base64 string
  mime: string;
  filename: string;
  createdAt: number;
  expiresAt: number;
  size: number;
}

const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), 'data', 'persistent_images');

/**
 * Ensures the local fallback directory exists.
 */
function ensureLocalDir(): void {
  try {
    if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[Persistent Image] Could not create local storage dir:', err);
  }
}

/**
 * Compresses an image buffer if needed so it stays comfortably within Firestore document limit (< 750 KB).
 */
async function optimizeImageForStorage(buffer: Buffer, mime: string): Promise<{ buffer: Buffer; mime: string }> {
  // If already under 600 KB, keep as-is
  if (buffer.length <= 600_000) {
    return { buffer, mime };
  }

  try {
    const optimized = await sharp(buffer)
      .resize({ width: 1400, height: 1800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();
    return { buffer: optimized, mime: 'image/jpeg' };
  } catch (err) {
    console.warn('[Persistent Image] Sharp optimization notice:', err);
    return { buffer, mime };
  }
}

/**
 * Save a temporary image in persistent storage with an expiry (default 24h).
 */
export async function savePersistentImage(
  id: string,
  rawBuffer: Buffer,
  rawMime: string,
  filename: string,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<{ id: string; expiresAt: number }> {
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const { buffer, mime } = await optimizeImageForStorage(rawBuffer, rawMime);
  const now = Date.now();
  const expiresAt = now + ttlMs;

  const record: PersistentImageRecord = {
    id: cleanId,
    data: buffer.toString('base64'),
    mime: mime || 'image/jpeg',
    filename: filename || `${cleanId}.jpg`,
    createdAt: now,
    expiresAt,
    size: buffer.length,
  };

  if (isFirestoreMode()) {
    try {
      const db = await getFirestoreDb();
      await db.collection('temporary_images').doc(cleanId).set(record);
      console.log(
        `[Persistent Image] Saved to Firestore: ${cleanId} (${buffer.length} bytes, expires ${new Date(expiresAt).toISOString()})`
      );
      return { id: cleanId, expiresAt };
    } catch (err) {
      console.error('[Persistent Image] Firestore write failed, falling back to local file:', err);
    }
  }

  // Local file storage fallback
  try {
    ensureLocalDir();
    const filePath = path.join(LOCAL_STORAGE_DIR, `${cleanId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record));
    console.log(`[Persistent Image] Saved to local file: ${cleanId} (${buffer.length} bytes)`);
  } catch (err) {
    console.error('[Persistent Image] Local file write failed:', err);
  }

  return { id: cleanId, expiresAt };
}

/**
 * Retrieve a temporary image from persistent storage.
 * Returns null if missing or expired.
 */
export async function getPersistentImage(
  id: string
): Promise<{ buffer: Buffer; mime: string; filename: string; expiresAt: number } | null> {
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const now = Date.now();

  if (isFirestoreMode()) {
    try {
      const db = await getFirestoreDb();
      const doc = await db.collection('temporary_images').doc(cleanId).get();
      if (!doc.exists) {
        return null;
      }
      const data = doc.data() as PersistentImageRecord;
      if (data.expiresAt && now > data.expiresAt) {
        console.log(`[Persistent Image] Image ${cleanId} has expired. Deleting from Firestore.`);
        db.collection('temporary_images').doc(cleanId).delete().catch(() => null);
        return null;
      }
      return {
        buffer: Buffer.from(data.data, 'base64'),
        mime: data.mime || 'image/jpeg',
        filename: data.filename || `${cleanId}.jpg`,
        expiresAt: data.expiresAt,
      };
    } catch (err) {
      console.error('[Persistent Image] Firestore read error:', err);
    }
  }

  // Local file fallback
  try {
    ensureLocalDir();
    const filePath = path.join(LOCAL_STORAGE_DIR, `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw) as PersistentImageRecord;
      if (data.expiresAt && now > data.expiresAt) {
        fs.unlinkSync(filePath);
        return null;
      }
      return {
        buffer: Buffer.from(data.data, 'base64'),
        mime: data.mime || 'image/jpeg',
        filename: data.filename || `${cleanId}.jpg`,
        expiresAt: data.expiresAt,
      };
    }
  } catch (err) {
    console.error('[Persistent Image] Local file read error:', err);
  }

  return null;
}

/**
 * Check if a persistent image exists and is still valid without loading the full buffer.
 */
export async function checkPersistentImageExists(id: string): Promise<boolean> {
  const img = await getPersistentImage(id);
  return img !== null;
}
