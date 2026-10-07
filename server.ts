import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  checkAccessCode,
  reserveGeneration,
  releaseReservation,
  registerPendingTask,
  finalizeTaskResult,
  getGenerationLogs,
  sanitizeCode,
  saveTaskSuccess,
  getTasksForCode,
  getTaskModelImageUrl,
  isTaskOwnedByCode,
  addCreditsToCode,
  resetCodeUsage,
  getSizeChartForCode,
  saveSizeChartForCode,
  UsageStoreError,
} from './access_control.js';
import { processSupportLetter, loadSubmissionPdf, getAllSubmissions } from './support_letter_service.js';
import {
  classifyUpstreamFailure,
  logUpstreamFailure,
  FAILURE_PUBLIC_MESSAGE,
  STORAGE_PUBLIC_MESSAGE,
  UNCONFIGURED_PUBLIC_MESSAGE,
} from './generation_errors.js';
import { applyExtraInstructions } from './extra_instructions.js';
import { IMAGE_TOO_LARGE_MESSAGE, isPublicHttpUrl, requestContainsImageData } from './image_payload.js';
import {
  GARMENT_UNRECOGNIZED_MESSAGE,
  outputMatchesModelPhoto,
  upstreamSignalsUnappliedGarment,
  withGarmentRoles,
} from './garment_check.js';
import { applyFitGuidanceToPrompt } from './fit_guidance.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/**
 * Image-generation credential. Server environment only.
 * Client-supplied tokens are ignored so the key is never required in the browser
 * and cannot be overridden by a page.
 */
export function getServerToken(): string {
  const raw = process.env.VMODEL_API_TOKEN || '';
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Ensure uploads folder exists (use /tmp/uploads on Vercel to avoid EROFS)
const isVercelEnv = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadsDir = isVercelEnv ? '/tmp/uploads' : path.resolve(__dirname, 'public', 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create uploads directory:', e);
}

// Serve uploaded user files
app.use('/uploads', express.static(uploadsDir));

// In-memory store for simulated demo tasks
interface SimulatedTask {
  task_id: string;
  version: string;
  input: Record<string, any>;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: string[];
  error: string | null;
  create_at: number;
  completed_at: number | null;
  total_time: number;
  predict_time: number;
}
const simulatedTasks = new Map<string, SimulatedTask>();

// Helper to determine base URL
function getBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

// Favicon handler to avoid 404 console error
app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.status(204).end();
});

// Access code validation endpoint. Remaining tries always come from the server store.
app.get('/api/auth-code', async (req: Request, res: Response) => {
  try {
    const code = (req.query.k as string) || (req.headers['x-access-code'] as string);
    const result = await checkAccessCode(code);
    return res.json(result);
  } catch (error) {
    console.error('[Access] auth-code failed:', error);
    return res.status(503).json({
      valid: false,
      code: '',
      remaining: 0,
      totalAllowed: 0,
      used: 0,
      dailyRemaining: 0,
      dailyLimitReached: false,
      message: STORAGE_PUBLIC_MESSAGE,
    });
  }
});

// Generation logs endpoint for administration
app.get('/api/generation-logs', (_req: Request, res: Response) => {
  const logs = getGenerationLogs(50);
  return res.json({ logs });
});

// Check configuration
app.get('/api/config', (_req: Request, res: Response) => {
  const token = getServerToken();
  const hasServerToken = Boolean(token);
  res.json({
    hasServerToken,
    defaultVersion: 'cce611c44553ba5f061813d75a1e5f93d8c901047528da275f667ebe7d784565',
    models: [
      {
        id: 'gpt-image-2-5',
        name: 'GPT Image 2.5 (High Realism)',
        version: 'cce611c44553ba5f061813d75a1e5f93d8c901047528da275f667ebe7d784565',
        description: 'Advanced photorealistic generation, supports reference images and multi-aspect resolutions.',
        type: 'text-and-image-to-image',
      },
      {
        id: 'face-swap-pro',
        name: 'Photo Face Swap Pro',
        version: 'd4f292d1ea72ac4e501e6ac7be938ce2a5c50c6852387b1b64dedee01e623029',
        description: 'High-precision portrait facial swapping between source and target images.',
        type: 'image-swap',
      },
      {
        id: 'custom-model',
        name: 'Custom Model',
        version: '',
        description: 'Run any custom 64-character model version with arbitrary JSON inputs.',
        type: 'custom',
      },
    ],
  });
});

// File upload endpoint: accepts base64 dataUrl or binary image
app.post('/api/upload', async (req: Request, res: Response) => {
  try {
    const { dataUrl, filename: originalName } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid dataUrl' });
    }

    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let extension = 'png';
    let buffer: Buffer;

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('jpeg') || mime.includes('jpg')) extension = 'jpg';
      else if (mime.includes('webp')) extension = 'webp';
      else if (mime.includes('gif')) extension = 'gif';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      // Direct base64 string
      buffer = Buffer.from(dataUrl, 'base64');
    }

    const uniqueId = crypto.randomBytes(8).toString('hex');
    const safeBase = originalName
      ? path.basename(originalName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
      : 'upload';
    const filename = `${safeBase}_${Date.now()}_${uniqueId}.${extension}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, buffer);

    const baseUrl = getBaseUrl(req);
    const localUrl = `${baseUrl}/uploads/${filename}`;
    const directCdnUrl = await ensurePublicImageUrl(filePath);

    return res.json({
      url: directCdnUrl || localUrl,
      localUrl,
      filename,
      size: buffer.length,
      mime: `image/${extension}`,
    });
  } catch (error: any) {
    console.error('Error handling upload:', error);
    return res.status(500).json({ error: error.message || 'Failed to save uploaded file' });
  }
});

// Proxy for downloading/viewing generated outputs
app.get('/api/proxy-image', async (req: Request, res: Response) => {
  try {
    let targetUrl = (req.query.url as string) || '';

    // If query string was split on unencoded '&', reconstruct full URL from originalUrl
    if (req.originalUrl && req.originalUrl.includes('url=')) {
      const idx = req.originalUrl.indexOf('url=');
      let rawParam = req.originalUrl.slice(idx + 4);
      // Strip download query parameter if attached at the end or beginning
      if (rawParam.endsWith('&download=true') || rawParam.endsWith('?download=true')) {
        rawParam = rawParam.slice(0, -14);
      } else if (rawParam.startsWith('download=true&')) {
        rawParam = rawParam.slice(14);
      }
      try {
        const decoded = decodeURIComponent(rawParam);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          targetUrl = decoded;
        }
      } catch {
        if (rawParam.startsWith('http://') || rawParam.startsWith('https://')) {
          targetUrl = rawParam;
        }
      }
    }

    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    // Support local files if targetUrl is relative
    if (targetUrl.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), targetUrl);
      if (fs.existsSync(localPath)) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (req.query.download === 'true') {
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(localPath)}"`);
        }
        return res.sendFile(localPath);
      }
    }

    // Validate protocol
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).send('Invalid url protocol');
    }

    const browserHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // Determine if the URL is an internal API endpoint requiring Bearer auth.
    // Presigned S3/GCS/CDN URLs MUST NOT receive an Authorization header (AWS returns 400 Bad Request).
    const token = getServerToken();
    const isSignedOrCdn =
      targetUrl.includes('X-Amz-') ||
      targetUrl.includes('Signature=') ||
      targetUrl.includes('s3.amazonaws.com') ||
      targetUrl.includes('r2.cloudflarestorage.com') ||
      targetUrl.includes('storage.googleapis.com') ||
      targetUrl.includes('replicate.delivery');

    let response: globalThis.Response;

    if (token && !isSignedOrCdn && targetUrl.includes('api.vmodel.ai')) {
      // First try with Auth for internal API domain
      response = await fetch(targetUrl, {
        headers: {
          ...browserHeaders,
          Authorization: `Bearer ${token}`,
        },
        redirect: 'follow',
      });
      if (!response.ok && (response.status === 401 || response.status === 403 || response.status === 400)) {
        // Retry without auth
        response = await fetch(targetUrl, {
          headers: browserHeaders,
          redirect: 'follow',
        });
      }
    } else {
      // Direct standard fetch without leaking Bearer token to CDNs
      response = await fetch(targetUrl, {
        headers: browserHeaders,
        redirect: 'follow',
      });

      // If 401 on external endpoint and token exists, attempt fallback with token
      if (!response.ok && response.status === 401 && token && !isSignedOrCdn) {
        response = await fetch(targetUrl, {
          headers: {
            ...browserHeaders,
            Authorization: `Bearer ${token}`,
          },
          redirect: 'follow',
        });
      }
    }

    if (!response.ok) {
      console.warn(`[Proxy image error] status=${response.status} text=${response.statusText} url=${targetUrl}`);
      return res.status(response.status).send(`Failed to proxy image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (req.query.download === 'true') {
      let filename = 'martitony-style-lab.png';
      try {
        const pathname = new URL(targetUrl).pathname;
        const base = path.basename(pathname);
        if (base && base.includes('.')) filename = base;
      } catch {
        // fallback filename
      }
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error('Proxy image error:', error);
    return res.status(500).send('Failed to fetch image: ' + error.message);
  }
});

const publicUrlCache = new Map<string, string>();

// Bridge local uploads to public CDN so external AI engines (Vmodel/OpenAI) can fetch raw image bytes
async function ensurePublicImageUrl(urlOrPath: string): Promise<string> {
  if (!urlOrPath || typeof urlOrPath !== 'string') return '';

  // If already a direct public web image (not pointing to internal dev or localhost)
  if (
    (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) &&
    !urlOrPath.includes('run.app') &&
    !urlOrPath.includes('localhost') &&
    !urlOrPath.includes('127.0.0.1')
  ) {
    return urlOrPath;
  }

  // Check in-memory cache
  if (publicUrlCache.has(urlOrPath)) {
    return publicUrlCache.get(urlOrPath)!;
  }

  // Find local file on disk
  let filePath: string | null = null;
  const uploadMatch = urlOrPath.match(/\/uploads\/([^/?#]+)/);
  if (uploadMatch) {
    const filename = uploadMatch[1];
    const candidate = path.join(uploadsDir, filename);
    if (fs.existsSync(candidate)) {
      filePath = candidate;
    }
  }

  // Direct file path
  if (!filePath && fs.existsSync(urlOrPath)) {
    filePath = urlOrPath;
  }

  // If it's a data: URL, save it to a temporary file first
  if (!filePath && urlOrPath.startsWith('data:image/')) {
    const matches = urlOrPath.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const ext = matches[1].includes('jpeg') || matches[1].includes('jpg') ? 'jpg' : 'png';
      const tempFilename = `temp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      filePath = path.join(uploadsDir, tempFilename);
      fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
    }
  }

  if (filePath && fs.existsSync(filePath)) {
    console.log(`[Public Image Bridge] Uploading ${path.basename(filePath)} to public CDN for Vmodel...`);
    try {
      const formData = new FormData();
      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mime });
      formData.append('source', blob, path.basename(filePath));
      formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
      formData.append('format', 'json');

      const cdnRes = await fetch('https://freeimage.host/api/1/upload', {
        method: 'POST',
        body: formData,
      });

      if (cdnRes.ok) {
        const cdnData = await cdnRes.json();
        const directUrl = cdnData?.image?.url || cdnData?.image?.display_url;
        if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
          console.log(`[Public Image Bridge Success] Direct CDN URL: ${directUrl}`);
          publicUrlCache.set(urlOrPath, directUrl);
          return directUrl;
        }
      }
    } catch (cdnErr) {
      console.warn('[Public Image Bridge] Primary CDN upload failed, trying fallback...', cdnErr);
    }

    try {
      // Fallback: Catbox litterbox
      const fbFormData = new FormData();
      const fileBuffer = fs.readFileSync(filePath);
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/jpeg' });
      fbFormData.append('reqtype', 'fileupload');
      fbFormData.append('time', '24h');
      fbFormData.append('fileToUpload', blob, path.basename(filePath));

      const fbRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST',
        body: fbFormData,
      });

      if (fbRes.ok) {
        const directUrl = (await fbRes.text()).trim();
        if (directUrl.startsWith('http')) {
          console.log(`[Public Image Bridge Fallback Success] Direct CDN URL: ${directUrl}`);
          publicUrlCache.set(urlOrPath, directUrl);
          return directUrl;
        }
      }
    } catch (fbErr) {
      console.error('[Public Image Bridge Error] All CDNs failed:', fbErr);
    }
  }

  return urlOrPath;
}

// Test connection endpoint to verify synthesis engine credentials
app.post('/api/test-connection', async (req: Request, res: Response) => {
  try {
    const token = getServerToken();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No server API credentials configured.',
      });
    }

    console.log('[Connection Test] Testing credentials...');

    const response = await fetch('https://api.vmodel.ai/api/tasks/v1/get/connection_check', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json().catch(() => null);

    if (
      response.status === 401 ||
      response.status === 403 ||
      (data && (data.code === 401 || data.code === 403))
    ) {
      return res.status(response.status).json({
        success: false,
        status: response.status,
        message: 'Authentication failed: Invalid or expired API credentials.',
        details: data,
      });
    }

    return res.json({
      success: true,
      status: response.status,
      message: 'Synthesis engine is authenticated and operational.',
    });
  } catch (error: any) {
    console.error('[Connection Test Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to connect to synthesis engine: ' + error.message,
    });
  }
});

// Create task endpoint
app.post('/api/tasks/create', async (req: Request, res: Response) => {
  let reservationId: string | undefined;
  try {
    const { version, simulate, webhook_url } = req.body;
    // Optional shopper note. Empty text leaves the prompt exactly as the client sent it.
    const input = applyExtraInstructions(req.body?.input);
    const token = getServerToken();

    // Image bytes must never ride along in this JSON body. Refuse before a try is reserved.
    if (requestContainsImageData(input)) {
      return res.status(413).json({
        error: IMAGE_TOO_LARGE_MESSAGE,
        code: 'PAYLOAD_TOO_LARGE',
      });
    }

    // Strict access code enforcement. Client tokens are ignored.
    const accessCode = sanitizeCode(
      (req.body.accessCode as string) ||
      (req.query.k as string) ||
      (req.headers['x-access-code'] as string)
    );

    const accessCheck = await reserveGeneration(accessCode);
    if (!accessCheck.allowed || !accessCheck.reservationId) {
      return res.status(accessCheck.statusCode).json({
        error: accessCheck.reason,
        remaining: accessCheck.remaining,
        dailyRemaining: accessCheck.dailyRemaining,
        dailyLimitReached: accessCheck.dailyLimitReached,
        used: accessCheck.used,
        totalAllowed: accessCheck.totalAllowed,
        code: accessCheck.errorCode,
      });
    }

    reservationId = accessCheck.reservationId;
    console.log(`[Task Create Request] Code: "${accessCode}", Version: ${version}, hasToken: ${Boolean(token)}, simulate: ${Boolean(simulate)}`);

    // Run simulation if user explicitly set simulate: true
    if (simulate) {
      console.log('[Task Create] Running in simulation mode because simulate=true');
      const simulatedTaskId = 'sim_' + crypto.randomBytes(8).toString('hex');
      const sampleOutputs = [
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1617791160505-6f00504e3519?auto=format&fit=crop&w=1200&q=80',
      ];
      const selectedOutput = sampleOutputs[Math.floor(Math.random() * sampleOutputs.length)];

      const newTask: SimulatedTask = {
        task_id: simulatedTaskId,
        version: version || 'cce611c44553ba5f061813d75a1e5f93d8c901047528da275f667ebe7d784565',
        input: input || {},
        status: 'starting',
        output: [],
        error: null,
        create_at: Math.floor(Date.now() / 1000),
        completed_at: null,
        total_time: 0,
        predict_time: 0,
      };

      simulatedTasks.set(simulatedTaskId, newTask);
      await registerPendingTask(simulatedTaskId, accessCode, {
        prompt: input?.prompt || 'Simulated Generation',
        modelName: 'GPT Image 2.5 (Simulated)',
        version,
        aspectRatio: input?.aspect_ratio || '1:1',
        resolution: input?.resolution || '2k',
      }, reservationId);

      setTimeout(() => {
        const t = simulatedTasks.get(simulatedTaskId);
        if (t && t.status === 'starting') {
          t.status = 'processing';
        }
      }, 2500);

      setTimeout(() => {
        const t = simulatedTasks.get(simulatedTaskId);
        if (t && (t.status === 'starting' || t.status === 'processing')) {
          t.status = 'succeeded';
          t.completed_at = Math.floor(Date.now() / 1000);
          t.predict_time = 4.2;
          t.total_time = 6.0;
          t.output = [selectedOutput];
          void finalizeTaskResult(simulatedTaskId, true, 'Simulated generation completed', {
            outputUrls: [selectedOutput],
            predictTime: 4.2,
            totalTime: 6.0,
            completedAt: Date.now(),
          }).catch((err) => console.error('[Access] Simulated finalize failed', err));
        }
      }, 6000);

      return res.json({
        code: 200,
        result: {
          task_id: simulatedTaskId,
          task_cost: 10,
          isSimulated: true,
          remaining: accessCheck.remaining,
          dailyRemaining: accessCheck.dailyRemaining,
          dailyLimitReached: accessCheck.dailyLimitReached,
        },
        message: {
          en: 'Task created successfully',
        },
      });
    }

    if (!token) {
      const released = await releaseReservation(reservationId, 'missing VMODEL_API_TOKEN');
      console.error('[Generation] VMODEL_API_TOKEN is not set. Refusing to call the image API.');
      return res.status(503).json({
        error: UNCONFIGURED_PUBLIC_MESSAGE,
        remaining: released.remaining,
        dailyRemaining: released.dailyRemaining,
        dailyLimitReached: released.dailyLimitReached,
        code: 'NOT_CONFIGURED',
      });
    }

    if (!version) {
      const released = await releaseReservation(reservationId, 'missing model version');
      return res.status(400).json({
        error: 'Model version ID is required',
        remaining: released.remaining,
        code: 'BAD_REQUEST',
      });
    }

    // Process input images to ensure valid direct public HTTPS URLs with image MIME types
    const processedInput: any = { ...(input || {}) };

    if (Array.isArray(processedInput.img_urls) && processedInput.img_urls.length > 0) {
      console.log(`[Task Create] Resolving ${processedInput.img_urls.length} reference image(s) to public CDN URLs...`);
      processedInput.img_urls = await Promise.all(
        processedInput.img_urls.map((u: string) => ensurePublicImageUrl(u))
      );
    }

    if (processedInput.swap_image) {
      console.log('[Task Create] Resolving swap_image to public CDN URL...');
      processedInput.swap_image = await ensurePublicImageUrl(processedInput.swap_image);
    }

    if (processedInput.target_image) {
      console.log('[Task Create] Resolving target_image to public CDN URL...');
      processedInput.target_image = await ensurePublicImageUrl(processedInput.target_image);
    }

    const chosenSize = req.body?.chosenSize || input?.chosenSize;
    const customerMeasurements = req.body?.customerMeasurements || input?.customerMeasurements;
    const garmentSizeChart = req.body?.garmentSizeChart || input?.garmentSizeChart;
    if (chosenSize) {
      const chart = garmentSizeChart || (await getSizeChartForCode(accessCode));
      processedInput.prompt = applyFitGuidanceToPrompt(
        processedInput.prompt,
        chart,
        chosenSize,
        customerMeasurements
      );
    }

    const referenceUrls = Array.isArray(processedInput.img_urls)
      ? processedInput.img_urls.filter((url: unknown) => typeof url === 'string' && url)
      : [];
    // This model has no garment/person fields. Name the two images only for a try-on pair.
    if (referenceUrls.length === 2) {
      processedInput.prompt = withGarmentRoles(processedInput.prompt, referenceUrls.length);
    }

    // Real API call to cloud model engine
    const requestPayload: any = {
      version,
      input: processedInput,
    };
    if (webhook_url) {
      requestPayload.webhook_url = webhook_url;
    }

    console.log('[Task Dispatch] POST task create', JSON.stringify({
      version,
      accessCode,
      inputKeys: Object.keys(processedInput || {}),
      hasImgUrls: Array.isArray(processedInput.img_urls) ? processedInput.img_urls.length : 0,
    }));

    const vmodelResponse = await fetch('https://api.vmodel.ai/api/tasks/v1/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    const responseData = await vmodelResponse.json().catch(() => null);

    if (!vmodelResponse.ok || (responseData && responseData.code && responseData.code !== 200)) {
      const classified = classifyUpstreamFailure(vmodelResponse.status, responseData);
      logUpstreamFailure(`create code=${accessCode}`, classified, responseData);
      const released = await releaseReservation(reservationId, classified.kind);
      return res.status(classified.httpStatus).json({
        error: classified.publicMessage,
        remaining: released.remaining,
        dailyRemaining: released.dailyRemaining,
        dailyLimitReached: released.dailyLimitReached,
        used: released.used,
        totalAllowed: released.totalAllowed,
        code: classified.kind === 'quota' ? 'QUOTA_EXCEEDED' : 'GENERATION_FAILED',
      });
    }

    const createdTaskId = responseData?.result?.task_id;
    if (!createdTaskId) {
      const classified = classifyUpstreamFailure(vmodelResponse.status, responseData);
      logUpstreamFailure(`create-missing-task code=${accessCode}`, classified, responseData);
      const released = await releaseReservation(reservationId, 'missing task id');
      return res.status(502).json({
        error: FAILURE_PUBLIC_MESSAGE,
        remaining: released.remaining,
        code: 'GENERATION_FAILED',
      });
    }

    await registerPendingTask(createdTaskId, accessCode, {
      prompt: processedInput.prompt || input?.prompt || '',
      modelName: input?.modelName || 'GPT Image 2.5',
      version,
      aspectRatio: input?.aspect_ratio || '1:1',
      resolution: input?.resolution || '2k',
      modelImageUrl: isPublicHttpUrl(referenceUrls[1]) ? referenceUrls[1] : '',
    }, reservationId);

    if (responseData?.result) {
      responseData.result.remaining = accessCheck.remaining;
      responseData.result.dailyRemaining = accessCheck.dailyRemaining;
      responseData.result.dailyLimitReached = accessCheck.dailyLimitReached;
    }

    return res.json(responseData);
  } catch (error: any) {
    console.error('Error creating task:', error);
    let remaining: number | undefined;
    if (reservationId) {
      try {
        const released = await releaseReservation(reservationId, 'create threw');
        remaining = released.remaining;
      } catch (releaseErr) {
        console.error('[Access] Failed to release hold after create error', releaseErr);
      }
    }
    const storage = error instanceof UsageStoreError;
    return res.status(storage ? 503 : 500).json({
      error: storage ? STORAGE_PUBLIC_MESSAGE : FAILURE_PUBLIC_MESSAGE,
      remaining,
      code: storage ? 'STORAGE_UNAVAILABLE' : 'GENERATION_FAILED',
    });
  }
});

// Get task endpoint
app.get('/api/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const token = getServerToken();

    // Verify task ownership if access code is supplied
    const callerCode = sanitizeCode((req.headers['x-access-code'] as string) || (req.query.code as string) || '');
    if (callerCode && !(await isTaskOwnedByCode(taskId, callerCode))) {
      return res.status(403).json({ error: 'Достъпът е отказан: тази генерация принадлежи на друг код.' });
    }

    // Check simulated tasks
    if (taskId.startsWith('sim_')) {
      const task = simulatedTasks.get(taskId);
      if (!task) {
        return res.status(404).json({ error: 'Simulated task not found' });
      }
      let remaining: number | undefined;
      if (task.status === 'succeeded') {
        const fin = await finalizeTaskResult(taskId, true, 'Simulated generation completed', {
          outputUrls: task.output,
        });
        remaining = fin.remaining;
      } else if (task.status === 'failed' || task.status === 'canceled') {
        const fin = await finalizeTaskResult(taskId, false, task.error || 'Simulated task failed');
        remaining = fin.remaining;
      }
      return res.json({
        code: 200,
        result: {
          ...task,
          ...(typeof remaining === 'number' ? { remaining } : {}),
        },
        message: {},
      });
    }

    if (!token) {
      console.error('[Generation] VMODEL_API_TOKEN is not set while polling a task.');
      return res.status(503).json({ error: UNCONFIGURED_PUBLIC_MESSAGE, code: 'NOT_CONFIGURED' });
    }

    const vmodelResponse = await fetch(`https://api.vmodel.ai/api/tasks/v1/get/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const responseData = await vmodelResponse.json().catch(() => null);

    if (!vmodelResponse.ok || (responseData && responseData.code && responseData.code !== 200)) {
      const classified = classifyUpstreamFailure(vmodelResponse.status, responseData);
      logUpstreamFailure(`poll task=${taskId}`, classified, responseData);
      // A transport/quota error while polling is not a finished image. Keep the hold
      // so a later successful poll can still count, unless the upstream says the task
      // itself no longer exists.
      if (vmodelResponse.status === 404) {
        const fin = await finalizeTaskResult(taskId, false, 'Task not found');
        return res.status(404).json({
          error: FAILURE_PUBLIC_MESSAGE,
          remaining: fin.remaining,
          code: 'GENERATION_FAILED',
        });
      }
      return res.status(classified.httpStatus).json({
        error: classified.publicMessage,
        code: classified.kind === 'quota' ? 'QUOTA_EXCEEDED' : 'GENERATION_FAILED',
      });
    }

    // Count the try only after a successful image. Failures release the hold.
    const taskStatus = responseData?.result?.status;
    if (taskStatus === 'succeeded') {
      const outputUrls = Array.isArray(responseData?.result?.output) ? responseData.result.output : [];
      const outputUrl = typeof outputUrls[0] === 'string' ? outputUrls[0] : '';
      const modelUrl = await getTaskModelImageUrl(taskId);
      const signaled = upstreamSignalsUnappliedGarment(responseData?.result);
      let unchanged: boolean | null = false;
      if (!signaled && outputUrl && modelUrl) {
        unchanged = await outputMatchesModelPhoto(outputUrl, modelUrl, token);
        if (unchanged === null) {
          console.warn(`[Garment check] Could not compare task ${taskId} with the model photo. Counting the result.`);
          unchanged = false;
        }
      }
      if (signaled || unchanged) {
        const why = signaled ? 'upstream reported the garment was not applied' : 'output matched the model photo';
        console.warn(`[Garment check] ${why}; refunding task ${taskId}`);
        const fin = await finalizeTaskResult(taskId, false, why);
        if (responseData?.result) {
          responseData.result.status = 'failed';
          responseData.result.output = [];
          responseData.result.error = GARMENT_UNRECOGNIZED_MESSAGE;
          responseData.result.failureCode = 'GARMENT_NOT_APPLIED';
          responseData.result.remaining = fin.remaining;
          responseData.result.dailyRemaining = fin.dailyRemaining;
          responseData.result.dailyLimitReached = fin.dailyLimitReached;
        }
        return res.json(responseData);
      }

      const fin = await finalizeTaskResult(taskId, true, 'Task completed successfully', {
        outputUrls: responseData?.result?.output || [],
        predictTime: responseData?.result?.predict_time,
        totalTime: responseData?.result?.total_time,
        completedAt: Date.now(),
      });
      await saveTaskSuccess(taskId, {
        outputUrls: responseData?.result?.output || [],
        predictTime: responseData?.result?.predict_time,
        totalTime: responseData?.result?.total_time,
        completedAt: Date.now(),
        status: 'succeeded',
      });
      if (responseData?.result) {
        responseData.result.remaining = fin.remaining;
        responseData.result.dailyRemaining = fin.dailyRemaining;
        responseData.result.dailyLimitReached = fin.dailyLimitReached;
      }
    } else if (taskStatus === 'failed' || taskStatus === 'canceled') {
      const rawError = responseData?.result?.error || responseData;
      const classified = classifyUpstreamFailure(0, rawError);
      logUpstreamFailure(`task-status ${taskStatus} task=${taskId}`, classified, rawError);
      const fin = await finalizeTaskResult(taskId, false, classified.summary);
      if (responseData?.result) {
        responseData.result.error = upstreamSignalsUnappliedGarment(responseData.result)
          ? GARMENT_UNRECOGNIZED_MESSAGE
          : classified.publicMessage;
        responseData.result.remaining = fin.remaining;
        responseData.result.dailyRemaining = fin.dailyRemaining;
        responseData.result.dailyLimitReached = fin.dailyLimitReached;
        responseData.result.failureCode = classified.kind === 'quota' ? 'QUOTA_EXCEEDED' : 'GENERATION_FAILED';
      }
    }

    return res.json(responseData);
  } catch (error: any) {
    console.error('Error getting task:', error);
    const storage = error instanceof UsageStoreError;
    return res.status(storage ? 503 : 500).json({
      error: storage ? STORAGE_PUBLIC_MESSAGE : FAILURE_PUBLIC_MESSAGE,
      code: storage ? 'STORAGE_UNAVAILABLE' : 'GENERATION_FAILED',
    });
  }
});

// User tasks endpoint - strictly isolated by access code
app.get('/api/user-tasks', async (req: Request, res: Response) => {
  try {
    const code = sanitizeCode((req.headers['x-access-code'] as string) || (req.query.code as string) || '');
    if (!code) {
      return res.status(400).json({ error: 'Access code is required' });
    }
    const tasks = await getTasksForCode(code);
    return res.json({ success: true, tasks });
  } catch (error) {
    console.error('[Access] user-tasks failed:', error);
    return res.status(503).json({ error: STORAGE_PUBLIC_MESSAGE });
  }
});

// Submit Support Letter
app.post('/api/support-letter', async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      uic,
      website,
      contactName,
      role,
      email,
      needs,
      motivation,
      consentAccepted,
      accessCode,
      lastImageUrl,
    } = req.body;

    if (!companyName || !String(companyName).trim()) {
      return res.status(400).json({ error: 'Моля, въведете име на фирмата.' });
    }

    const cleanUic = String(uic || '').trim().replace(/\s+/g, '');
    if (!/^\d{9}(\d{4})?$/.test(cleanUic)) {
      return res.status(400).json({ error: 'ЕИК трябва да съдържа точно 9 или 13 цифри.' });
    }

    if (!website || !String(website).trim()) {
      return res.status(400).json({ error: 'Моля, въведете уебсайт на магазина.' });
    }

    if (!contactName || !String(contactName).trim()) {
      return res.status(400).json({ error: 'Моля, въведете Вашето име.' });
    }

    if (!role || !String(role).trim()) {
      return res.status(400).json({ error: 'Моля, посочете Вашата длъжност.' });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Моля, въведете валиден имейл адрес.' });
    }

    if (consentAccepted !== true) {
      return res.status(400).json({
        error: 'Задължително е да потвърдите съгласието за безплатен пилотен проект.',
      });
    }

    const result = await processSupportLetter({
      companyName: String(companyName).trim(),
      uic: cleanUic,
      website: String(website).trim(),
      contactName: String(contactName).trim(),
      role: String(role).trim(),
      email: cleanEmail,
      needs: Array.isArray(needs) ? needs.map((n: any) => String(n)) : [],
      motivation: motivation ? String(motivation).trim() : '',
      consentAccepted: true,
      accessCode: accessCode ? String(accessCode).trim() : undefined,
      lastImageUrl: lastImageUrl ? String(lastImageUrl) : undefined,
    });

    return res.json(result);
  } catch (error: any) {
    console.error('Error processing support letter:', error);
    return res.status(500).json({
      error: error.message || 'Възникна грешка при обработка на писмото за подкрепа.',
    });
  }
});

// Download Generated PDF. Admin only. Rebuilt from the saved submission when the file is gone.
app.get('/api/support-letter/:id/pdf', async (req: Request, res: Response) => {
  try {
    if (!verifyAdmin(req)) {
      return res.status(401).send('Unauthorized');
    }
    const { id } = req.params;
    const item = await loadSubmissionPdf(id);
    if (!item) {
      return res.status(404).send('PDF document not found');
    }

    const safeAsciiName = `Letter_of_Intent_${id}.pdf`;
    const encodedName = encodeURIComponent(item.fileName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`
    );
    return res.send(item.buffer);
  } catch (error: any) {
    console.error('Error sending PDF file:', error);
    return res.status(500).send('Error delivering PDF document');
  }
});

// Admin Authentication Helpers
function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin';
}

function generateAdminToken(password: string): string {
  return crypto.createHmac('sha256', password).update('msl-loi-admin-auth-salt').digest('hex');
}

const ADMIN_COOKIE = 'msl_admin';

function headerText(req: Request, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

function readCookie(req: Request, name: string): string {
  const header = headerText(req, 'cookie');
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function tokensMatch(presented: string, valid: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(valid);
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Session token from the header the admin page sends, or the login cookie. Never from the URL. */
function presentedAdminToken(req: Request): string {
  const authorization = headerText(req, 'authorization');
  if (/^bearer\s+/i.test(authorization)) return authorization.replace(/^bearer\s+/i, '').trim();
  const headerToken = headerText(req, 'x-admin-token').trim();
  if (headerToken) return headerToken;
  return readCookie(req, ADMIN_COOKIE);
}

function adminCookie(token: string, maxAgeSeconds: number): string {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function verifyAdmin(req: Request): boolean {
  const adminPass = getAdminPassword();
  const validToken = generateAdminToken(adminPass);
  if (tokensMatch(presentedAdminToken(req), validToken)) return true;

  const passwordHeader = headerText(req, 'x-admin-password');
  return Boolean(passwordHeader) && passwordHeader === adminPass;
}

// POST /api/admin/login - Authenticate with ADMIN_PASSWORD
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { password } = req.body || {};
  const expectedPassword = getAdminPassword();

  if (!password || String(password) !== expectedPassword) {
    return res.status(401).json({ error: 'Невалидна администраторска парола.' });
  }

  const token = generateAdminToken(expectedPassword);
  res.setHeader('Set-Cookie', adminCookie(token, 60 * 60 * 12));
  return res.json({ success: true, token });
});

app.post('/api/admin/logout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', adminCookie('', 0));
  return res.json({ success: true });
});

// GET /api/admin/verify - Verify session token
app.get('/api/admin/verify', (req: Request, res: Response) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Сесията е изтекла или е невалидна.' });
  }
  return res.json({ success: true });
});

// GET /api/admin/submissions - List all submissions newest first
app.get('/api/admin/submissions', async (req: Request, res: Response) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Неоторизиран достъп. Моля, въведете парола.' });
  }

  try {
    const submissions = await getAllSubmissions();
    return res.json({ success: true, submissions });
  } catch (error: any) {
    console.error('Error fetching submissions for admin:', error);
    return res.status(500).json({ error: 'Грешка при зареждане на списъка.' });
  }
});

// POST /api/admin/codes/add-credits - Add credits to a code
app.post('/api/admin/codes/add-credits', async (req: Request, res: Response) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Неоторизиран достъп.' });
  }

  const { code, credits = 3 } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Моля, въведете валиден код.' });
  }

  try {
    const result = await addCreditsToCode(code, Number(credits) || 3);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[Access] add-credits failed:', error);
    return res.status(500).json({ error: error.message || 'Грешка при добавяне на проби.' });
  }
});

// POST /api/admin/codes/reset - Return a code to its full allowance (used = 0).
// The practice code "test" is reset the same way and is still capped at 3.
app.post('/api/admin/codes/reset', async (req: Request, res: Response) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Неоторизиран достъп.' });
  }

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Моля, въведете валиден код.' });
  }

  try {
    const result = await resetCodeUsage(code);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[Access] reset failed:', error);
    const unknown = /unknown access code/i.test(String(error.message));
    return res.status(unknown ? 404 : 500).json({
      error: unknown ? 'Непознат код.' : 'Грешка при нулиране на кода.',
    });
  }
});

// GET /api/admin/codes/status?code=test
app.get('/api/admin/codes/status', async (req: Request, res: Response) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Неоторизиран достъп.' });
  }
  const code = String(req.query.code || '');
  if (!code.trim()) {
    return res.status(400).json({ error: 'Моля, въведете код.' });
  }
  try {
    const result = await checkAccessCode(code);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Access] status failed:', error);
    return res.status(503).json({ error: STORAGE_PUBLIC_MESSAGE });
  }
});

// GET /api/size-chart?k=code
app.get('/api/size-chart', async (req: Request, res: Response) => {
  try {
    const code = sanitizeCode((req.query.k as string) || (req.headers['x-access-code'] as string));
    if (!code) {
      return res.status(400).json({ error: 'Missing access code', sizeChart: null });
    }
    const sizeChart = await getSizeChartForCode(code);
    return res.json({ success: true, code, sizeChart });
  } catch (error: any) {
    console.error('[Access] size-chart failed:', error);
    return res.status(500).json({ error: 'Failed to load size chart' });
  }
});

// GET /api/admin/size-chart?code=...
app.get('/api/admin/size-chart', async (req: Request, res: Response) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Неоторизиран достъп.' });
  }
  const code = sanitizeCode(req.query.code as string);
  if (!code) {
    return res.status(400).json({ error: 'Моля, въведете код.' });
  }
  try {
    const sizeChart = await getSizeChartForCode(code);
    return res.json({ success: true, code, sizeChart });
  } catch (error: any) {
    console.error('[Admin] get size chart failed:', error);
    return res.status(500).json({ error: error.message || 'Грешка при зареждане на таблицата с размери.' });
  }
});

// POST /api/admin/size-chart
app.post('/api/admin/size-chart', async (req: Request, res: Response) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Неоторизиран достъп.' });
  }
  const { code: rawCode, sizeChart } = req.body || {};
  const code = sanitizeCode(rawCode);
  if (!code) {
    return res.status(400).json({ error: 'Моля, въведете валиден код.' });
  }
  try {
    const saved = await saveSizeChartForCode(code, sizeChart);
    return res.json({ success: true, code, sizeChart: saved });
  } catch (error: any) {
    console.error('[Admin] save size chart failed:', error);
    return res.status(500).json({ error: error.message || 'Грешка при запазване на таблицата с размери.' });
  }
});




async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VModel Studio server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL && process.env.DISABLE_SERVER_AUTOSTART !== '1') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
