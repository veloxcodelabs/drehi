export type TaskStatus = 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export interface TaskApiResult {
  task_id: string;
  user_id?: number;
  version: string;
  error?: string | null;
  total_time?: number;
  predict_time?: number;
  logs?: string | null;
  output?: string[];
  status: TaskStatus;
  create_at?: number;
  completed_at?: number | null;
  isSimulated?: boolean;
  remaining?: number;
  dailyRemaining?: number;
  dailyLimitReached?: boolean;
  failureCode?: string;
}

export interface AccessCodeStatus {
  valid: boolean;
  code: string;
  remaining: number;
  totalAllowed: number;
  used: number;
  dailyRemaining: number;
  dailyLimitReached: boolean;
  message?: string;
}

export interface GenerationTask {
  id: string;
  prompt: string;
  version: string;
  modelName: string;
  status: TaskStatus;
  outputUrls: string[];
  referenceImages: string[];
  aspectRatio: string;
  resolution: string;
  modelVariant?: string;
  createdAt: number;
  completedAt?: number;
  predictTime?: number;
  totalTime?: number;
  error?: string | null;
  cost?: number;
  isSimulated?: boolean;
}

export interface ModelPreset {
  id: string;
  name: string;
  version: string;
  description: string;
  type: 'text-and-image-to-image' | 'image-swap' | 'custom';
  defaultInput: Record<string, any>;
}

export interface UploadedImage {
  id: string;
  url: string;
  dataUrl?: string;
  previewUrl: string;
  filename: string;
  size?: number;
}

export interface SupportLetterData {
  companyName: string;
  uic: string;
  website: string;
  contactName: string;
  role: string;
  email: string;
  needs: string[];
  motivation?: string;
  consentAccepted: boolean;
  accessCode?: string;
  lastImageUrl?: string;
}

export interface SupportLetterResponse {
  success: boolean;
  id: string;
  refNumber: string;
  pdfDownloadUrl: string;
  message?: string;
}
