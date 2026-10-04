import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dataFilePath = path.join(dataDir, 'access_data.json');
const logFilePath = path.join(dataDir, 'generations.log');

export interface CodeRecord {
  code: string;
  totalAllowed: number;
  used: number;
}

export interface GenerationLogEntry {
  code: string;
  time: string;
  status: 'success' | 'fail';
  taskId: string;
  details?: string;
}

interface StoredData {
  codes: Record<string, CodeRecord>;
  dailyUsage: {
    date: string; // YYYY-MM-DD
    count: number;
  };
  taskRegistrations: Record<
    string,
    {
      code: string;
      finalized: boolean;
      createdAt: number;
      taskData?: any;
    }
  >;
  logs: GenerationLogEntry[];
}

const RAW_VALID_CODES: string[] = [
  'test',
  'bekoda', 'concept166', 'cvetnov', 'erectedstore', 'faithinfatih', 'ignisatelier',
  'mariaqueenmaria', 'milshop', 'sassabjorg', 'studioibis', 'stylyne', 'veza',
  'veze', 'ambitsia', 'bg0511', 'antonella', 'bebeshore', 'behaviourswimwea',
  'byjgk', 'coolsouls', 'diplus', 'knapp', 'lbd', 'lorreti', 'palomafashion',
  'romantikafashion', 'selfishstyledesi', 'abellafashion', 'atelierengele', 'avenew',
  'boutiquecocoon', 'codemoda', 'denicaboutique', 'elissima', 'ephosbg', 'exfashion',
  'exclusivejeans', 'margonia', 'nelita', 'radichev', 'rudi', 'rumella',
  'sevibysevdalina', 'siskahandknit7', 'soulsinclothes', 'tarikuti', 'vamped',
  'vianswimwear', 'vikonte', 'vulgarista', 'whatamonstar', 'vezba', 'vilistil',
  'ethnobuldesign', 'stilnajena', 'tedy13', 'caviarcouture', 'plus0concept',
  'gioiafashionstor', 'ivatex', 'perfectlingerie', 'signorafashion', 'moncher',
  'nolli', 'bogariaatelier', 'paolastyle', 'tianabg', 'vladimirkaraleev', 'renystyle',
  'bohosi', 'aakasha', 'marikris', 'tyapti', 'slineshop', 'bonojeans', 'tuzar',
  'benmodel', 'styler', 'lazarini', 'pironetic', 'smfit', 'junona', 'loreen',
  'exza', 'alessa', 'lucy', 'lily', 'vivamoda', 'christine', 'sensdunoir', 'lovate',
  'inisessshop', 'yasha', 'veteida', 'iventishirts', 'maxifashion', 'cliche',
  'jenistyle', 'luximabg', 'pausejeansonline', 'ikstylee', 'aletaparizi', 'emem',
  'inobg', 'limonibg', 'maisontangerine', 'twelveoclock', 'mareamoda', 'animafashion',
  'sirenaplus', 'krass', 'misschic', 'ladonna', 'stelaruse', 'daphne', 'caramellaonline',
  'vitalityaw', 'alert', 'randeva', 'lucil', 'richtex', 'renifashion', 'startsport',
  'avinonline', '1inmind', 'geronimo', 'pierreshirts', 'dilastyle', 'denssell',
  'morado', 'etere', 'rosifashion', 'addictboutique', 'rainy', 'zinc', 'norex',
  'comersebg', 'echo', 'ellis', 'duasol', 'lenafashion', 'vegeabg', 'danielfashion',
  'rollmann', 'madstitches', 'aure', 'colorycollection', 'mexess', 'granda',
  'fabnetstudiobg', 'indigostyle', 'danini', 'venix', 'mijelstore', 'marty',
  'tonikafashion', 'lizakain', 'adorafashionhous', 'maxistyle', 'montre',
  'maximarket', 'amiamoda', 'veneraplus', 'oblechise', 'soonmama', 'dawnm',
  'borianasport', 'freelinebg', 'klin', 'karmaoriginal', 'womenspower',
  'twiggyshop', 'popov', 'candybaby', 'ksport', 'monipetrov', 'meriboo',
  'maxiladystyle', 'imane', 'efrea', 'redics', 'bstyle'
];

const DEFAULT_CODES: Record<string, CodeRecord> = RAW_VALID_CODES.reduce((acc, code) => {
  acc[code] = { code, totalAllowed: 3, used: 0 };
  return acc;
}, {} as Record<string, CodeRecord>);

const GLOBAL_DAILY_CAP = 300;

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadData(): StoredData {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Keep valid codes from DEFAULT_CODES, but preserve existing custom totalAllowed and used!
      const updatedCodes: Record<string, CodeRecord> = {};
      for (const [codeKey, defaultObj] of Object.entries(DEFAULT_CODES)) {
        if (parsed.codes && parsed.codes[codeKey]) {
          updatedCodes[codeKey] = {
            code: codeKey,
            totalAllowed:
              typeof parsed.codes[codeKey].totalAllowed === 'number'
                ? parsed.codes[codeKey].totalAllowed
                : defaultObj.totalAllowed,
            used: typeof parsed.codes[codeKey].used === 'number' ? parsed.codes[codeKey].used : 0,
          };
        } else {
          updatedCodes[codeKey] = { ...defaultObj };
        }
      }

      // Preserve any dynamically added codes from parsed.codes as well
      if (parsed.codes) {
        for (const [codeKey, record] of Object.entries(parsed.codes as Record<string, CodeRecord>)) {
          if (!updatedCodes[codeKey] && record && typeof record.totalAllowed === 'number') {
            updatedCodes[codeKey] = {
              code: codeKey,
              totalAllowed: record.totalAllowed,
              used: typeof record.used === 'number' ? record.used : 0,
            };
          }
        }
      }

      parsed.codes = updatedCodes;

      if (!parsed.dailyUsage || typeof parsed.dailyUsage.count !== 'number') {
        parsed.dailyUsage = { date: getTodayString(), count: 0 };
      }
      if (!parsed.taskRegistrations) parsed.taskRegistrations = {};
      if (!Array.isArray(parsed.logs)) parsed.logs = [];

      saveData(parsed);
      return parsed;
    }
  } catch (err) {
    console.error('[Access Control] Failed to read data file, initializing fresh:', err);
  }

  const initial: StoredData = {
    codes: { ...DEFAULT_CODES },
    dailyUsage: { date: getTodayString(), count: 0 },
    taskRegistrations: {},
    logs: [],
  };
  saveData(initial);
  return initial;
}

function saveData(data: StoredData): void {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Access Control] Failed to save data file:', err);
  }
}

function appendToLogFile(entry: GenerationLogEntry): void {
  try {
    const line = `[${entry.time}] CODE: ${entry.code} | STATUS: ${entry.status.toUpperCase()} | TASK: ${entry.taskId}${
      entry.details ? ` | DETAILS: ${entry.details}` : ''
    }\n`;
    fs.appendFileSync(logFilePath, line, 'utf-8');
  } catch (err) {
    console.error('[Access Control] Failed to append to log file:', err);
  }
}

export function sanitizeCode(code?: string | null): string {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toLowerCase();
}

/**
 * Checks an access code's current validity and remaining allowance.
 */
export function checkAccessCode(rawCode?: string | null): {
  valid: boolean;
  code: string;
  remaining: number;
  totalAllowed: number;
  used: number;
  dailyRemaining: number;
  dailyLimitReached: boolean;
} {
  const code = sanitizeCode(rawCode);
  const data = loadData();

  // Reset daily count if date rolled over
  const today = getTodayString();
  if (data.dailyUsage.date !== today) {
    data.dailyUsage = { date: today, count: 0 };
    saveData(data);
  }

  const dailyRemaining = Math.max(0, GLOBAL_DAILY_CAP - data.dailyUsage.count);
  const dailyLimitReached = data.dailyUsage.count >= GLOBAL_DAILY_CAP;

  if (!code || !data.codes[code]) {
    return {
      valid: false,
      code,
      remaining: 0,
      totalAllowed: 0,
      used: 0,
      dailyRemaining,
      dailyLimitReached,
    };
  }

  const record = data.codes[code];
  const remaining = Math.max(0, record.totalAllowed - record.used);

  return {
    valid: true,
    code,
    remaining,
    totalAllowed: record.totalAllowed,
    used: record.used,
    dailyRemaining,
    dailyLimitReached,
  };
}

/**
 * Validates if a code is eligible to trigger a new generation task.
 */
export function canStartGeneration(rawCode?: string | null): {
  allowed: boolean;
  reason?: string;
  statusCode: number;
  remaining: number;
} {
  const check = checkAccessCode(rawCode);

  if (!check.valid) {
    return {
      allowed: false,
      reason: 'Тази проба е само с покана. Пишете ни на info@martitony.com',
      statusCode: 403,
      remaining: 0,
    };
  }

  if (check.dailyLimitReached) {
    return {
      allowed: false,
      reason: 'Дневният лимит за генериране в системата е достигнат. Моля, опитайте отново утре.',
      statusCode: 429,
      remaining: check.remaining,
    };
  }

  if (check.remaining <= 0) {
    return {
      allowed: false,
      reason: 'Пробите свършиха – пишете ни на info@martitony.com за още',
      statusCode: 403,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    statusCode: 200,
    remaining: check.remaining,
  };
}

/**
 * Associates an in-flight task with an access code.
 */
export function registerPendingTask(taskId: string, rawCode: string, initialData?: any): void {
  const code = sanitizeCode(rawCode);
  const data = loadData();
  data.taskRegistrations[taskId] = {
    code,
    finalized: false,
    createdAt: Date.now(),
    taskData: initialData || {},
  };
  saveData(data);
}

/**
 * Saves successful output and details to a registered task
 */
export function saveTaskSuccess(taskId: string, details: any): void {
  const data = loadData();
  if (data.taskRegistrations[taskId]) {
    data.taskRegistrations[taskId].taskData = {
      ...(data.taskRegistrations[taskId].taskData || {}),
      ...details,
      status: 'succeeded',
    };
    saveData(data);
  }
}

/**
 * Returns all succeeded tasks strictly belonging to an access code
 */
export function getTasksForCode(rawCode: string): any[] {
  const code = sanitizeCode(rawCode);
  if (!code) return [];
  const data = loadData();
  const list: any[] = [];
  for (const [taskId, reg] of Object.entries(data.taskRegistrations)) {
    if (reg.code === code && reg.taskData && Array.isArray(reg.taskData.outputUrls) && reg.taskData.outputUrls.length > 0) {
      list.push({
        id: taskId,
        ...reg.taskData,
        createdAt: reg.createdAt,
      });
    }
  }
  // Sort newest first
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

/**
 * Verifies whether a taskId belongs to the given access code
 */
export function isTaskOwnedByCode(taskId: string, rawCode: string): boolean {
  const code = sanitizeCode(rawCode);
  if (!code) return false;
  const data = loadData();
  const reg = data.taskRegistrations[taskId];
  if (!reg) return true; // not registered locally
  return reg.code === code;
}

/**
 * Finalizes task result. Decrements remaining counter ONLY on success.
 */
export function finalizeTaskResult(
  taskId: string,
  isSuccess: boolean,
  details?: string
): { decremented: boolean; remaining: number; code: string } {
  const data = loadData();
  const registration = data.taskRegistrations[taskId];

  if (!registration) {
    return { decremented: false, remaining: 0, code: '' };
  }

  const { code } = registration;
  const time = new Date().toISOString();

  // If already finalized, do not decrement again
  if (registration.finalized) {
    const record = data.codes[code];
    return {
      decremented: false,
      remaining: record ? Math.max(0, record.totalAllowed - record.used) : 0,
      code,
    };
  }

  registration.finalized = true;

  let decremented = false;
  let remaining = 0;

  if (isSuccess) {
    // Check daily date rollover
    const today = getTodayString();
    if (data.dailyUsage.date !== today) {
      data.dailyUsage = { date: today, count: 0 };
    }
    data.dailyUsage.count += 1;

    // Decrement remaining by incrementing used
    if (data.codes[code]) {
      data.codes[code].used += 1;
      remaining = Math.max(0, data.codes[code].totalAllowed - data.codes[code].used);
      decremented = true;
    }

    const logEntry: GenerationLogEntry = {
      code,
      time,
      status: 'success',
      taskId,
      details: details || `Successful generation (Remaining: ${remaining})`,
    };
    data.logs.push(logEntry);
    appendToLogFile(logEntry);
    console.log(`[Access Control SUCCESS] Code: "${code}" | Task: ${taskId} | Remaining: ${remaining} | Daily total: ${data.dailyUsage.count}/300`);
  } else {
    // Error/failed: Do NOT decrement counter
    const record = data.codes[code];
    remaining = record ? Math.max(0, record.totalAllowed - record.used) : 0;

    const logEntry: GenerationLogEntry = {
      code,
      time,
      status: 'fail',
      taskId,
      details: details || 'Generation failed (Counter preserved)',
    };
    data.logs.push(logEntry);
    appendToLogFile(logEntry);
    console.log(`[Access Control FAIL] Code: "${code}" | Task: ${taskId} | No decrement | Remaining: ${remaining}`);
  }

  saveData(data);

  return { decremented, remaining, code };
}

/**
 * Returns latest logs for inspection.
 */
export function getGenerationLogs(limit = 100): GenerationLogEntry[] {
  const data = loadData();
  return (data.logs || []).slice(-limit).reverse();
}

/**
 * Adds credits (allowed generations) to a specific access code.
 */
export function addCreditsToCode(rawCode: string, additionalCredits: number = 3): {
  code: string;
  totalAllowed: number;
  used: number;
  remaining: number;
} {
  const code = sanitizeCode(rawCode);
  const data = loadData();
  const current = data.codes[code];
  const used = current ? (typeof current.used === 'number' ? current.used : 0) : 0;
  const currentTotal = current ? (typeof current.totalAllowed === 'number' ? current.totalAllowed : 0) : 0;

  const currentRemaining = Math.max(0, currentTotal - used);
  const newTotalAllowed = currentRemaining === 0 ? used + additionalCredits : currentTotal + additionalCredits;

  data.codes[code] = {
    code,
    totalAllowed: newTotalAllowed,
    used,
  };

  saveData(data);
  console.log(`[Access Control] Added ${additionalCredits} credits to code "${code}". New totalAllowed: ${newTotalAllowed}, used: ${used}, remaining: ${newTotalAllowed - used}`);

  return {
    code,
    totalAllowed: newTotalAllowed,
    used,
    remaining: Math.max(0, newTotalAllowed - used),
  };
}

/**
 * Sets explicit allowed generations for a specific access code.
 */
export function setCreditsForCode(rawCode: string, totalAllowed: number): {
  code: string;
  totalAllowed: number;
  used: number;
  remaining: number;
} {
  const code = sanitizeCode(rawCode);
  const data = loadData();
  const current = data.codes[code];
  const used = current ? (typeof current.used === 'number' ? current.used : 0) : 0;

  data.codes[code] = {
    code,
    totalAllowed,
    used,
  };

  saveData(data);
  return {
    code,
    totalAllowed,
    used,
    remaining: Math.max(0, totalAllowed - used),
  };
}

