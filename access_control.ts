import {
  getUsageBackend,
  UsageStoreError,
  type UsageBackend,
} from './usage_store.js';
import type { Balance, RecentTask } from './usage_logic.js';
import { parseSizeChart, type SizeChart } from './size_chart.js';

/**
 * Server-side invite limits.
 *
 * Each code may complete 3 generations in total. The counter lives in Firestore
 * (or a local file during development) and is updated inside a transaction, so a
 * refresh, a second browser, or two clicks at once cannot mint extra tries.
 * Only a successful generation consumes a try. Failures release the hold.
 *
 * The easy code `test` is also limited to 3. Reset it from /admin
 * ("Нулирай пробите") or:
 *   curl -X POST "$APP_URL/api/admin/codes/reset" \
 *     -H "content-type: application/json" \
 *     -H "x-admin-password: $ADMIN_PASSWORD" \
 *     -d '{"code":"test"}'
 */

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
  'maxiladystyle', 'imane', 'efrea', 'redics', 'bstyle',
  'sofiaboutique', 'ivyboutique', 'ivanel', '24deluxe', 'gvipstyle', '359og',
  'harm', 'vsfashion', 'luxu', 'kristia', 'darlin', 'dressiada',
  'love2love', 'zonamoda', 'vzaro', 'galena', 'galinel', 'edrehi',
  'allura', 'skarleto', 'onlinedrehi', 'onyxman', 'boutiquemilano', 'negativewear',
  'theweekend', 'valenti', 'fabele', 'ciavore', 'nextlevel', 'modadrehi',
  'merinossa', 'dfashion', 'fashionwoman', 'metamorphoza', 'linenfairytales', 'theamu',
  'pletivo', 'gangbg', 'mdr24', 'bulgarskidrehi', 'activewear',
  'shefashion', 'moonstone', 'vanyafashion', 'studiomarcia', 'shtampi', 'motivarto',
  'edinstvena', 'yovini', 'lememe', 'noonebrand', 'ulle', 'bossburg',
  'gabymoda', 'boutiquesette', 'movomo', 'minimalbg', 'pinklady', 'alexandraitaly',
  'odejdi', 'askia', 'shevicasvet', 'politass', 'indigofashion', 'hrisima',
  'dizi', 'laralux', 'gazela', '3dogs', 'modero', 'corsoitalia',
  'moodtop', 'kimswear', 'shevicabg', 'pepeboutique', 'italiana',
  'everglam', 'bequeen', 'loveyourcurvy', 'sianova', 'junis', 'vayana',
  'zhannes', 'butikizkushenie', 'oficialnirokli', 'kikibg', 'collectionkabo', 'aneliafashion',
  'modish', 'dnkt', 'delfina', 'velinavanity', 'femi', 'belyoibanski',
  'mdclothing', 'mire', 'ladybg', 'uniquebg', 'funkykids', 'bozovstil',
  'yogavibe', 'dress4less', 'dika', 'jnsecret', 'legionk', 'varriosport',
  'zarena', 'reluxeroom',
  'gaytan', 'elizabet', 'egoboutique', 'tonylans', 'vizia', 'ingiliz',
  'paramidonna', 'monadiki', 'karanova', 'inaassa', 'mojoleather', 'abovetherest',
  'genezis', 'mamomoya', 'goodfashion', 'revue5', 'viasaborna', 'pepina',
  'atelierivoire', 'zappy', 'amirass', 'vulshebnitsa', 'ivorybridal', 'beliva',
  'azuri', 'odeta', 'effetti', 'angelwings', 'popijami', 'magim',
  'brutale', 'zerofit', 'missqueen', 'ygg',
  'mythos', 'marinita', 'pakyov', 'mimo', 'tiaragaliano', 'bulbel',
  'belioonline', 'avangard', 'newsilhouette', 'incomfypjs', 'pijamite', 'zlatev',
  'daris', 'sofiv', 'makshoes', 'estella', 'cavaler', 'giovanna',
  'realleather', 'mbg', 'bridalgallery', 'jollie', 'millebridal', 'princessfashion',
  'areti', 'weddingresidence', 'flair', 'scelements', 'borastreet', 'capo',
  'pletko', 'dressiano',
  'vodo', 'gebrielle', 'obuvkibg', 'gido', 'peshtera', 'family4',
  'biju', 'kidsfashion', 'gulliver', 'loretta', 'lemisa', 'vera',
  'bagsmag', 'bagso', 'kinderland', 'roberto', 'enigmaleather', 'polinapetrova',
  'byllu', 'shushulka', 'areal', 'obui', 'viona', 'shopzone',
  'kompass', 'lory', 'nadiapetrova', 'complexbg', 'sisibg', 'gstorefashion',
  'hugsy', 'affect', 'outstore',
  'andrews', 'mikena', 'tergan', 'misskapriz', 'vilishop', 'brute',
  'ivstyle', 'ilonfashion', 'maximod', 'natalileather', 'stylezone', 'streetwearbg',
  'sportmag', 'zoyafashion', 'hellokids', 'carnivalkids', 'extravagance', 'gabina',
  'unibrands', 'xcess', 'allshoes', 'gentlemanstore', 'jioro', 'andipandi',
  'rachbaby', 'jaco', 'sportrespect', 'tochici', 'thestore', 'izamama',
  'didis', 'udobniobuvki', 'zebra', 'bgbrands',
  'tofi', 'punto', 'hippokiddo', 'anabelkids', 'doniceta', 'kolini',
  'moliv', 'badu', 'karinarousse', 'lesfe', 'm0derno', 'modabulgaria',
  'modenoutlet', 'snowflakes', 'sportvision', 'stemanelli', 'verano', 'anjelini',
  'morani', 'prettywoman', 'yunverkiose', 'deadly', 'shalove', 'patriciarado',
  'donnacasa', 'biobaby', 'donasedood', 'christian', 'kimystyle', 'mitron',
  'plik', 'atelier7', 'luxybg', 'inobags',
  'armada', 'bapa', 'batashop', 'bianki', 'bileya', 'blissintimates',
  'bobdog', 'brafinity', 'brandroom', 'carducci', 'chickitta', 'closebg',
  'criss', 'diel', 'diverso', 'djofra', 'duende', 'ellenmore',
  'artelie', 'emozione', 'explosi', 'fabiano', 'fashionzona', 'georgemorrgan',
  'goya', 'gshoes', 'iddi', 'intense', 'irapell', 'ketra',
  'krachun', 'luxylu', 'madamedesire', 'maniac', 'minoar', 'radapola',
  'radis', 'thedresscode', 'zzone', 'posh',
  'allure', 'oldcom', 'onlyyou', 'ponki', 'renibg', 'revibe',
  'rush', 'saltamark', 'studioluxe', 'tendenz', 'unico', 'urbanize',
  'verapelle', 'artyshocks', 'napudreni', 'nadinsleather', 'srychno', 'dogaart',
  'aviv', 'labelclub', 'eversocks', 'galia', 'forever', 'narcis',
  'festivalguru', 'josephinehats', 'olsimple', 'elifashion', 'ezaro', 'gianni',
  'justsbag', 'radossa', 'stilitaliano', 'runners', 'woolcollection', 'aturbanwear',
  'damskobelio', 'monviel', 'bfashion', 'daramulti',
  'bijubg', 'byivan', 'dandeliwood', 'danex', 'detskidrehi', 'narodninosii',
  'egigi', 'enricobellini', 'fashionstylebg', 'fluxstore', 'gladiator', 'invito',
  'luckyhandmade', 'luda', 'malcho', 'marineli', 'onewhite', 'peppis',
  'pochorapi', 'premiumwear', 'redpoint', 'sportshoes7', 'teadore', 'valnata',
  'virroy', 'zani',
  'kukuipipi', 'bgdreshki', 'bgmodazadeteto', 'forbabies', 'nikita', 'boutiqueluxury',
  'escuara', 'mariacentre', 'shopsmile', 'loveswimwearr', 'inamood', 'rspassion',
  'modio', 'lalakids', 'textilebg', 'julia', 'crazykids', 'axil',
  'sportshopbg', 'befashion', 'yanakids', 'denimcity', 'furialeather', 'leks',
  'vintaj',
];

const KNOWN_CODES = new Set(RAW_VALID_CODES.map((code) => code.toLowerCase()));

export const INVALID_CODE_MESSAGE = 'Тази проба е само с покана. Пишете ни на info@martitony.com';
export const NO_TRIES_MESSAGE = 'Пробите свършиха – пишете ни на info@martitony.com за още';
export const DAILY_CAP_MESSAGE =
  'Дневният лимит за генериране в системата е достигнат. Моля, опитайте отново утре.';

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

const memoryLogs: GenerationLogEntry[] = [];

function backend(): UsageBackend {
  return getUsageBackend();
}

export function sanitizeCode(code?: string | null): string {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toLowerCase();
}

export function isKnownAccessCode(code: string): boolean {
  return KNOWN_CODES.has(sanitizeCode(code));
}

function toPublicStatus(balance: Balance) {
  return {
    valid: balance.valid,
    code: balance.code,
    remaining: balance.remaining,
    totalAllowed: balance.totalAllowed,
    used: balance.used,
    dailyRemaining: balance.dailyRemaining,
    dailyLimitReached: balance.dailyLimitReached,
  };
}

export async function checkAccessCode(rawCode?: string | null) {
  const code = sanitizeCode(rawCode);
  if (!code) {
    return {
      valid: false,
      code: '',
      remaining: 0,
      totalAllowed: 0,
      used: 0,
      dailyRemaining: 0,
      dailyLimitReached: false,
    };
  }
  const balance = await backend().check(code, isKnownAccessCode(code));
  const status = toPublicStatus(balance);
  if (!status.valid) return status;
  const sizeChart = await backend().getSizeChart(code);
  if (!sizeChart) return status;
  return { ...status, sizeChart };
}

export async function getCodeSizeChart(rawCode?: string | null): Promise<SizeChart | null> {
  const code = sanitizeCode(rawCode);
  if (!code || !isKnownAccessCode(code)) return null;
  return backend().getSizeChart(code);
}

export async function saveCodeSizeChart(rawCode: string, chart: SizeChart | null): Promise<{ code: string; sizeChart: SizeChart | null }> {
  const code = sanitizeCode(rawCode);
  if (!code || !isKnownAccessCode(code)) {
    throw new UsageStoreError('Unknown access code');
  }
  const stored = chart ? parseSizeChart(chart) : null;
  if (chart && !stored) {
    throw new UsageStoreError('Invalid size chart');
  }
  await backend().setSizeChart(code, stored);
  return { code, sizeChart: stored };
}

export interface ReservationDecision {
  allowed: boolean;
  reason?: string;
  statusCode: number;
  errorCode: string;
  remaining: number;
  totalAllowed: number;
  used: number;
  dailyRemaining: number;
  dailyLimitReached: boolean;
  reservationId?: string;
}

/**
 * Atomically holds one try. Call releaseReservation if the upstream request fails,
 * or commit via finalizeTaskResult only after the image succeeds.
 */
export async function reserveGeneration(rawCode?: string | null): Promise<ReservationDecision> {
  const code = sanitizeCode(rawCode);
  if (!code) {
    return {
      allowed: false,
      reason: INVALID_CODE_MESSAGE,
      statusCode: 403,
      errorCode: 'ACCESS_DENIED',
      remaining: 0,
      totalAllowed: 0,
      used: 0,
      dailyRemaining: 0,
      dailyLimitReached: false,
    };
  }

  const outcome = await backend().reserve(code, isKnownAccessCode(code));
  const base = {
    remaining: outcome.balance.remaining,
    totalAllowed: outcome.balance.totalAllowed,
    used: outcome.balance.used,
    dailyRemaining: outcome.balance.dailyRemaining,
    dailyLimitReached: outcome.balance.dailyLimitReached,
  };

  if (!outcome.ok) {
    if (outcome.reason === 'daily') {
      console.warn(`[Access] Daily cap reached while starting code "${code}"`);
      return {
        allowed: false,
        reason: DAILY_CAP_MESSAGE,
        statusCode: 429,
        errorCode: 'DAILY_CAP_REACHED',
        ...base,
      };
    }
    if (outcome.reason === 'no_tries') {
      console.warn(`[Access] Code "${code}" has no tries left (used ${outcome.balance.used})`);
      return {
        allowed: false,
        reason: NO_TRIES_MESSAGE,
        statusCode: 403,
        errorCode: 'NO_TRIES',
        ...base,
      };
    }
    console.warn(`[Access] Rejected unknown code "${code}"`);
    return {
      allowed: false,
      reason: INVALID_CODE_MESSAGE,
      statusCode: 403,
      errorCode: 'ACCESS_DENIED',
      remaining: 0,
      totalAllowed: 0,
      used: 0,
      dailyRemaining: outcome.balance.dailyRemaining,
      dailyLimitReached: outcome.balance.dailyLimitReached,
    };
  }

  console.log(
    `[Access] Reserved try for "${code}" (${outcome.reservationId}). Remaining after hold: ${outcome.balance.remaining}. Daily slots left: ${outcome.balance.dailyRemaining}`
  );
  return {
    allowed: true,
    statusCode: 200,
    errorCode: 'OK',
    reservationId: outcome.reservationId,
    ...base,
  };
}

export async function releaseReservation(reservationId: string, why = 'upstream failed'): Promise<Balance> {
  const outcome = await backend().releaseReservation(reservationId);
  console.log(
    `[Access] Released hold ${reservationId} for "${outcome.code}" (${why}). Remaining: ${outcome.balance.remaining}. Counted: ${outcome.counted}`
  );
  return outcome.balance;
}

export async function registerPendingTask(
  taskId: string,
  rawCode: string,
  initialData?: Record<string, any>,
  reservationId?: string
): Promise<void> {
  if (!reservationId) {
    console.warn(`[Access] Task ${taskId} was not tied to a reservation; it will not be counted`);
    return;
  }
  const meta: RecentTask = {
    id: taskId,
    createdAt: Date.now(),
    prompt: initialData?.prompt || '',
    modelName: initialData?.modelName || 'Martitony Style Lab',
    version: initialData?.version || '',
    aspectRatio: initialData?.aspectRatio || initialData?.aspect_ratio || '',
    resolution: initialData?.resolution || '',
    modelImageUrl: typeof initialData?.modelImageUrl === 'string' ? initialData.modelImageUrl : '',
    status: 'processing',
    outputUrls: [],
  };
  await backend().attach(reservationId, taskId, meta);
  console.log(`[Access] Task ${taskId} attached to ${reservationId} for code "${sanitizeCode(rawCode)}"`);
}

export async function finalizeTaskResult(
  taskId: string,
  isSuccess: boolean,
  details?: string,
  taskPatch?: Partial<RecentTask>
): Promise<{ decremented: boolean; remaining: number; code: string; dailyRemaining: number; dailyLimitReached: boolean }> {
  const outcome = isSuccess
    ? await backend().commitTask(taskId, {
        ...taskPatch,
        status: 'succeeded',
        completedAt: taskPatch?.completedAt || Date.now(),
      })
    : await backend().releaseTask(taskId);

  const time = new Date().toISOString();
  const entry: GenerationLogEntry = {
    code: outcome.code,
    time,
    status: isSuccess ? 'success' : 'fail',
    taskId,
    details: details || (isSuccess ? 'Successful generation' : 'Generation failed'),
  };
  memoryLogs.push(entry);
  if (memoryLogs.length > 200) memoryLogs.shift();

  if (isSuccess && outcome.counted) {
    console.log(
      `[Access SUCCESS] Code "${outcome.code}" task ${taskId}. Remaining: ${outcome.balance.remaining}. Used: ${outcome.balance.used}/${outcome.balance.totalAllowed}. Daily remaining: ${outcome.balance.dailyRemaining}`
    );
  } else if (!isSuccess) {
    console.log(
      `[Access FAIL] Code "${outcome.code}" task ${taskId}. Try was not consumed. Remaining: ${outcome.balance.remaining}. ${details || ''}`
    );
  } else {
    console.log(`[Access] Task ${taskId} already finalized. Remaining: ${outcome.balance.remaining}`);
  }

  return {
    decremented: outcome.counted,
    remaining: outcome.balance.remaining,
    code: outcome.code,
    dailyRemaining: outcome.balance.dailyRemaining,
    dailyLimitReached: outcome.balance.dailyLimitReached,
  };
}

export async function saveTaskSuccess(taskId: string, details: any): Promise<void> {
  // Counting happens in finalizeTaskResult. This refreshes stored gallery fields
  // when the success payload arrives in a second step (output URLs).
  if (!details) return;
  await backend().commitTask(taskId, {
    outputUrls: Array.isArray(details.outputUrls) ? details.outputUrls : [],
    predictTime: details.predictTime,
    totalTime: details.totalTime,
    completedAt: details.completedAt || Date.now(),
    status: 'succeeded',
  });
}

export async function getTasksForCode(rawCode: string): Promise<any[]> {
  const code = sanitizeCode(rawCode);
  if (!code) return [];
  const tasks = await backend().tasks(code);
  return tasks.map((task) => ({
    id: task.id,
    prompt: task.prompt || '',
    modelName: task.modelName || 'Martitony Style Lab Lookbook Engine',
    version: task.version || '',
    aspectRatio: task.aspectRatio || '3:4',
    resolution: task.resolution || '2k',
    outputUrls: task.outputUrls || [],
    referenceImages: [],
    status: task.status || 'succeeded',
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    predictTime: task.predictTime,
    totalTime: task.totalTime,
  }));
}

export async function getTaskModelImageUrl(taskId: string): Promise<string> {
  const meta = await backend().metaOf(taskId);
  return typeof meta?.modelImageUrl === 'string' ? meta.modelImageUrl : '';
}

export async function isTaskOwnedByCode(taskId: string, rawCode: string): Promise<boolean> {
  const code = sanitizeCode(rawCode);
  if (!code) return false;
  const owner = await backend().ownerOf(taskId);
  if (!owner) return true;
  return owner === code;
}

export function getGenerationLogs(limit = 100): GenerationLogEntry[] {
  return memoryLogs.slice(-limit).reverse();
}

export async function addCreditsToCode(rawCode: string, additionalCredits: number = 3) {
  const code = sanitizeCode(rawCode);
  if (!code) {
    throw new UsageStoreError('Missing access code');
  }
  const balance = await backend().addCredits(code, additionalCredits);
  console.log(
    `[Access] Added ${additionalCredits} credits to "${code}". Remaining: ${balance.remaining} (used ${balance.used} / allowed ${balance.totalAllowed})`
  );
  return {
    code,
    totalAllowed: balance.totalAllowed,
    used: balance.used,
    remaining: balance.remaining,
  };
}

export async function resetCodeUsage(rawCode: string) {
  const code = sanitizeCode(rawCode);
  if (!code) {
    throw new UsageStoreError('Missing access code');
  }
  if (!isKnownAccessCode(code)) {
    const existing = await backend().check(code, false);
    if (!existing.valid) {
      throw new UsageStoreError('Unknown access code');
    }
  }
  const balance = await backend().reset(code);
  console.log(`[Access] Reset code "${code}". Remaining: ${balance.remaining}`);
  return {
    code,
    totalAllowed: balance.totalAllowed,
    used: balance.used,
    remaining: balance.remaining,
  };
}

export { UsageStoreError };
