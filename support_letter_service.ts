import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { generateSupportLetterPdf, LetterParticipantData } from './pdf_generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isVercel ? '/tmp/data' : path.resolve(__dirname, 'data');
const LETTERS_DIR = path.resolve(DATA_DIR, 'support_letters');
const SUBMISSIONS_FILE = path.resolve(DATA_DIR, 'support_submissions.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LETTERS_DIR)) {
    fs.mkdirSync(LETTERS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create data dir in support_letter_service:', e);
}

// Initialize Firebase SDK
let firebaseDb: any = null;
let firebaseStorage: any = null;

try {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const app = initializeApp(config);
    firebaseDb = getFirestore(app, config.firestoreDatabaseId);
    firebaseStorage = getStorage(app);
    console.log('Firebase initialized in support_letter_service with db:', config.firestoreDatabaseId);
  }
} catch (err: any) {
  console.warn('Could not initialize Firebase in support_letter_service:', err.message);
}

export interface SavedSubmission extends LetterParticipantData {
  id: string;
  refNumber: string;
  timestamp: string; // Europe/Sofia formatted
  createdAt: string; // ISO string
  pdfUrl: string;
  pdfPath?: string;
  submittedAtTimestamp?: number;
}

// Local file fallback cache
function loadSubmissionsLocal(): SavedSubmission[] {
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      const data = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading support letter submissions:', e);
  }
  return [];
}

function saveSubmissionsLocal(list: SavedSubmission[]): void {
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving support letter submissions:', e);
  }
}

// Format timestamp in Europe/Sofia timezone
function formatSofiaTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const p: Record<string, string> = {};
  parts.forEach((item) => {
    p[item.type] = item.value;
  });

  return `${p.day}.${p.month}.${p.year} г., ${p.hour}:${p.minute} ч.`;
}

export async function processSupportLetter(
  data: LetterParticipantData
): Promise<{ success: boolean; id: string; refNumber: string; pdfDownloadUrl: string; pdfBase64: string; message: string }> {
  const id = crypto.randomUUID();
  const hexPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  const refNumber = `MSL-LOI-2026-${hexPart}`;
  const now = new Date();
  const timestampSofia = formatSofiaTimestamp(now);
  const createdAtIso = now.toISOString();

  // 1. Generate PDF (Strictly 2 pages: BG page 1, EN page 2)
  const pdfBuffer = await generateSupportLetterPdf(data, refNumber, now);

  // 2. Save PDF file locally for reliable direct delivery
  const pdfFileName = `${refNumber}.pdf`;
  const pdfFilePath = path.join(LETTERS_DIR, pdfFileName);
  fs.writeFileSync(pdfFilePath, pdfBuffer);

  // 3. Attempt Firebase Storage upload
  let pdfDownloadUrl = `/api/support-letter/${id}/pdf`;
  if (firebaseStorage) {
    try {
      const storageRef = ref(firebaseStorage, `loi_submissions/${refNumber}.pdf`);
      await uploadBytes(storageRef, pdfBuffer, {
        contentType: 'application/pdf',
        customMetadata: {
          refNumber,
          companyName: data.companyName,
          uic: data.uic,
          timestampSofia,
        },
      });
      const firebaseUrl = await getDownloadURL(storageRef);
      if (firebaseUrl) {
        pdfDownloadUrl = firebaseUrl;
        console.log(`Uploaded PDF to Firebase Storage: ${firebaseUrl}`);
      }
    } catch (storageErr: any) {
      console.warn('Firebase Storage upload notice (using server PDF endpoint):', storageErr.message);
    }
  }

  // 4. Save to Firestore (collection "loi_submissions")
  const submissionRecord: SavedSubmission = {
    id,
    refNumber,
    companyName: data.companyName,
    uic: data.uic,
    website: data.website,
    contactName: data.contactName,
    role: data.role,
    email: data.email,
    needs: Array.isArray(data.needs) ? data.needs : [],
    motivation: data.motivation ? String(data.motivation).trim() : '',
    consentAccepted: true,
    accessCode: data.accessCode || '',
    timestamp: timestampSofia,
    createdAt: createdAtIso,
    pdfUrl: pdfDownloadUrl,
    pdfPath: pdfFilePath,
    lastImageUrl: data.lastImageUrl || '',
    submittedAtTimestamp: now.getTime(),
  };

  if (firebaseDb) {
    try {
      await setDoc(doc(firebaseDb, 'loi_submissions', id), submissionRecord);
      console.log(`Saved submission ${id} to Firestore collection "loi_submissions"`);
    } catch (dbErr: any) {
      console.error('Error saving to Firestore:', dbErr.message);
    }
  }

  // Local mirror backup
  const existingLocal = loadSubmissionsLocal();
  existingLocal.unshift(submissionRecord);
  saveSubmissionsLocal(existingLocal);

  // 5. Emails: Explicitly skipped per user instruction ("Do not send any emails for now")

  return {
    success: true,
    id,
    refNumber,
    pdfDownloadUrl,
    pdfBase64: pdfBuffer.toString('base64'),
    message: 'Благодарим! Ще се свържем с Вас до 2 работни дни.',
  };
}

function letterFromRecord(record: Partial<SavedSubmission>): LetterParticipantData {
  return {
    companyName: String(record.companyName || ''),
    uic: String(record.uic || ''),
    website: String(record.website || ''),
    contactName: String(record.contactName || ''),
    role: String(record.role || ''),
    email: String(record.email || ''),
    needs: Array.isArray(record.needs) ? record.needs.map((item) => String(item)) : [],
    motivation: record.motivation ? String(record.motivation) : '',
    consentAccepted: record.consentAccepted !== false,
    accessCode: record.accessCode || '',
    lastImageUrl: record.lastImageUrl || '',
  };
}

function dateFromRecord(record: Partial<SavedSubmission>): Date {
  if (record.createdAt) {
    const parsed = new Date(record.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof record.submittedAtTimestamp === 'number') return new Date(record.submittedAtTimestamp);
  return new Date();
}

/** Rebuild a letter from the fields stored with the submission. */
export async function buildLetterPdfFromSubmission(record: Partial<SavedSubmission>): Promise<Buffer> {
  const refNumber = String(record.refNumber || record.id || 'MSL-LOI');
  return generateSupportLetterPdf(letterFromRecord(record), refNumber, dateFromRecord(record));
}

async function findSubmissionRecord(id: string): Promise<SavedSubmission | null> {
  const local = loadSubmissionsLocal().find((item) => item.id === id || item.refNumber === id);
  if (local) return local;
  if (!firebaseDb) return null;

  try {
    const direct = await getDoc(doc(firebaseDb, 'loi_submissions', id));
    if (direct.exists()) return direct.data() as SavedSubmission;
  } catch (error: any) {
    console.warn('[Support letter] Firestore get failed:', error.message);
  }

  try {
    const snap = await getDocs(collection(firebaseDb, 'loi_submissions'));
    let found: SavedSubmission | null = null;
    snap.forEach((docSnap) => {
      const data = docSnap.data() as SavedSubmission;
      if (!found && (data.id === id || data.refNumber === id || docSnap.id === id)) found = data;
    });
    return found;
  } catch (error: any) {
    console.warn('[Support letter] Firestore scan failed:', error.message);
    return null;
  }
}

/**
 * PDF bytes for an admin download. Uses the file on this instance when it is
 * still there, otherwise rebuilds the letter from the saved submission.
 */
export async function loadSubmissionPdf(id: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const safeId = String(id || '').trim();
  if (!safeId) return null;

  const localList = loadSubmissionsLocal();
  const cached = localList.find((item) => item.id === safeId || item.refNumber === safeId);
  if (cached?.pdfPath && fs.existsSync(cached.pdfPath)) {
    return {
      buffer: fs.readFileSync(cached.pdfPath),
      fileName: `Letter_of_Intent_${cached.refNumber || safeId}.pdf`,
    };
  }

  try {
    const files = fs.existsSync(LETTERS_DIR) ? fs.readdirSync(LETTERS_DIR) : [];
    const matched = files.find((fileName) => fileName.includes(safeId));
    if (matched) {
      return {
        buffer: fs.readFileSync(path.join(LETTERS_DIR, matched)),
        fileName: `Letter_of_Intent_${matched}`,
      };
    }
  } catch (error) {
    console.warn('[Support letter] Local PDF lookup failed:', error);
  }

  const record = await findSubmissionRecord(safeId);
  if (!record) return null;
  const buffer = await buildLetterPdfFromSubmission(record);
  return {
    buffer,
    fileName: `Letter_of_Intent_${record.refNumber || safeId}.pdf`,
  };
}

// Fetch all submissions from Firestore (newest first)
export async function getAllSubmissions(): Promise<SavedSubmission[]> {
  if (firebaseDb) {
    try {
      const snap = await getDocs(collection(firebaseDb, 'loi_submissions'));
      const items: SavedSubmission[] = [];
      snap.forEach((docSnap) => {
        items.push(docSnap.data() as SavedSubmission);
      });

      // Sort newest first
      items.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      return items;
    } catch (err: any) {
      console.error('Failed to get submissions from Firestore, falling back to local:', err.message);
    }
  }

  // Fallback to local
  const local = loadSubmissionsLocal();
  local.sort((a, b) => (b.submittedAtTimestamp || 0) - (a.submittedAtTimestamp || 0));
  return local;
}
