import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  Mail,
} from 'lucide-react';
import { GenerationTask, UploadedImage, AccessCodeStatus } from './types';
import {
  getStoredSimulateMode,
  getStoredHistory,
  saveStoredHistory,
  fetchUserTasks,
  clearLegacyGlobalHistory,
  createTask,
  getTask,
  validateAccessCode,
  ApiRequestError,
} from './lib/api';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { ModelParameters } from './components/ModelParameters';
import { TaskViewer } from './components/TaskViewer';
import { ResultViewport } from './components/ResultViewport';
import { GalleryHistory } from './components/GalleryHistory';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { InviteAccessGate } from './components/InviteAccessGate';
import { SupportLetterModal } from './components/SupportLetterModal';
import { AdminDashboard } from './components/AdminDashboard';

const DEFAULT_GPT_VERSION = 'cce611c44553ba5f061813d75a1e5f93d8c901047528da275f667ebe7d784565';

function extractCodeFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const searchParams = new URLSearchParams(window.location.search);
  const k = searchParams.get('k');
  if (k) return k.trim();
  if (window.location.hash.includes('k=')) {
    const hashPart = window.location.hash.split('?')[1] || '';
    const hashParams = new URLSearchParams(hashPart);
    const hk = hashParams.get('k');
    if (hk) return hk.trim();
  }
  return '';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
  const [hasServerToken, setHasServerToken] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supportLetterOpen, setSupportLetterOpen] = useState(false);
  const [supportLetterImage, setSupportLetterImage] = useState<string | undefined>(undefined);

  // Simple routing for /admin
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Access Code & Limit State
  const [accessStatus, setAccessStatus] = useState<AccessCodeStatus>({
    valid: false,
    code: '',
    remaining: 0,
    totalAllowed: 0,
    used: 0,
    dailyRemaining: 300,
    dailyLimitReached: false,
  });
  const [isValidatingCode, setIsValidatingCode] = useState(true);
  const [codeErrorMessage, setCodeErrorMessage] = useState<string | null>(null);

  // Boutique 3-step workflow state
  const [garmentImage, setGarmentImage] = useState<UploadedImage | null>(null);
  const [modelImage, setModelImage] = useState<UploadedImage | null>(null);

  // Settings: default 3:4 aspect ratio (fashion standard), 2K resolution
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState('2k');
  const [extraInstructions, setExtraInstructions] = useState('');

  // Execution & Task State
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationTask[]>([]);

  // Polling ref
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load history strictly scoped to the active access code
  const loadCodeHistory = async (validCode: string) => {
    if (!validCode) {
      setHistory([]);
      setCurrentTask(null);
      return;
    }

    const localTasks = getStoredHistory(validCode);
    setHistory(localTasks);
    if (localTasks.length > 0) {
      setCurrentTask(localTasks[0]);
    } else {
      setCurrentTask(null);
    }

    try {
      const serverTasks = await fetchUserTasks(validCode);
      const mergedMap = new Map<string, GenerationTask>();
      for (const t of localTasks) {
        mergedMap.set(t.id, t);
      }
      for (const t of serverTasks) {
        mergedMap.set(t.id, t);
      }
      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      setHistory(merged);
      saveStoredHistory(validCode, merged);
      if (merged.length > 0) {
        setCurrentTask((prev) => prev || merged[0]);
      }
    } catch (e) {
      console.warn('Could not load remote tasks:', e);
    }
  };

  // Load initial settings and verify access code from URL
  useEffect(() => {
    clearLegacyGlobalHistory();
    const sim = getStoredSimulateMode();
    setIsSimulating(sim);

    // Initial check of ?k=CODE
    const urlCode = extractCodeFromUrl();
    if (urlCode) {
      validateAccessCode(urlCode).then((status) => {
        setAccessStatus(status);
        setIsValidatingCode(false);
        if (status.valid) {
          loadCodeHistory(status.code);
        } else {
          setCodeErrorMessage(status.message || 'Невалиден код за достъп. Пишете ни на info@martitony.com');
          setHistory([]);
          setCurrentTask(null);
        }
      });
    } else {
      setIsValidatingCode(false);
      setHistory([]);
      setCurrentTask(null);
    }

    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        setHasServerToken(Boolean(data.hasServerToken));
      })
      .catch((err) => {
        console.warn('Config load notice:', err);
      });
  }, []);

  const handleApplyCode = async (code: string) => {
    setIsValidatingCode(true);
    setCodeErrorMessage(null);
    const result = await validateAccessCode(code);
    setAccessStatus(result);
    setIsValidatingCode(false);

    if (result.valid) {
      // Sync URL parameter ?k=CODE
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('k', result.code);
      window.history.replaceState({}, '', newUrl.toString());
      setGeneralError(null);
      await loadCodeHistory(result.code);
    } else {
      setCodeErrorMessage(result.message || 'Невалиден код за достъп. Пишете ни на info@martitony.com');
      setHistory([]);
      setCurrentTask(null);
    }
  };

  const refreshSettingsState = () => {
    const sim = getStoredSimulateMode();
    setIsSimulating(sim);
  };

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, []);

  const applyServerBalance = (partial: {
    remaining?: number;
    dailyRemaining?: number;
    dailyLimitReached?: boolean;
    used?: number;
    totalAllowed?: number;
  }) => {
    setAccessStatus((prev) => ({
      ...prev,
      ...(typeof partial.remaining === 'number' ? { remaining: partial.remaining } : {}),
      ...(typeof partial.dailyRemaining === 'number' ? { dailyRemaining: partial.dailyRemaining } : {}),
      ...(typeof partial.dailyLimitReached === 'boolean' ? { dailyLimitReached: partial.dailyLimitReached } : {}),
      ...(typeof partial.used === 'number' ? { used: partial.used } : {}),
      ...(typeof partial.totalAllowed === 'number' ? { totalAllowed: partial.totalAllowed } : {}),
    }));
  };

  // Poll task status until complete or failed. Remaining tries are copied from the server payload.
  const startPolling = (taskId: string, initialTask: GenerationTask, code: string) => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);

    const poll = async () => {
      try {
        const result = await getTask(taskId, code);

        if (!result) return;

        if (typeof result.remaining === 'number') {
          applyServerBalance({
            remaining: result.remaining,
            dailyRemaining: result.dailyRemaining,
            dailyLimitReached: result.dailyLimitReached,
          });
        }

        const isFinished = result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled';

        const updatedTask: GenerationTask = {
          ...initialTask,
          status: result.status,
          outputUrls: result.output || [],
          error: result.error || null,
          predictTime: result.predict_time,
          totalTime: result.total_time,
          completedAt: result.completed_at ? result.completed_at * 1000 : undefined,
        };

        setCurrentTask(updatedTask);

        if (isFinished) {
          if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
          setIsGenerating(false);

          if (code) {
            validateAccessCode(code).then((st) => {
              if (st.valid) setAccessStatus(st);
            });
          }

          if (result.status !== 'succeeded' && result.error) {
            setGeneralError(result.error);
          }

          if (result.status === 'succeeded') {

            // Update history scoped to active code
            setHistory((prev) => {
              const filtered = prev.filter((t) => t.id !== updatedTask.id);
              const updated = [updatedTask, ...filtered];
              if (code) {
                saveStoredHistory(code, updated);
              }
              return updated;
            });
          }
        }
      } catch (err: any) {
        console.warn('Polling notice:', err);
        if (err instanceof ApiRequestError) {
          if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
          setIsGenerating(false);
          setGeneralError(err.message);
          if (typeof err.remaining === 'number') {
            applyServerBalance({ remaining: err.remaining });
          } else if (code) {
            validateAccessCode(code).then((st) => {
              if (st.valid) setAccessStatus(st);
            });
          }
        }
      }
    };

    // First check after 1.5s, then every 2s
    pollingTimerRef.current = setInterval(poll, 2000);
    setTimeout(poll, 1500);
  };

  const handleGenerate = async () => {
    setGeneralError(null);

    if (!accessStatus.valid) {
      setGeneralError('Тази проба е само с покана. Пишете ни на info@martitony.com');
      return;
    }

    if (accessStatus.remaining <= 0) {
      setSupportLetterImage(currentTask?.outputUrls?.[0]);
      setSupportLetterOpen(true);
      return;
    }

    if (accessStatus.dailyLimitReached) {
      setGeneralError('Дневният лимит за генериране в системата е достигнат. Моля, опитайте отново утре.');
      return;
    }

    // Validation: Require garment image
    if (!garmentImage) {
      setGeneralError('Моля, качете първо снимка на дрехата (Стъпка 1).');
      return;
    }

    // Validation: Require model image
    if (!modelImage) {
      setGeneralError('Моля, качете снимка на модел (Стъпка 2).');
      return;
    }

    setIsGenerating(true);
    setCurrentTask(null);

    // Automatic boutique fashion prompt tailored for high-end lookbook
    const autoPrompt = `High-end fashion editorial lookbook photography of the exact uploaded garment worn by the model. Immaculate studio lighting, soft shadows, sharp textile drape, authentic fabric textures, luxury apparel catalogue photo. Neutral clean backdrop.`;

    const requestPayloadInput = {
      prompt: autoPrompt,
      extra_instructions: extraInstructions,
      // Order is the garment, then the person. The image API has no separate fields.
      img_urls: [garmentImage.url, modelImage.url],
      aspect_ratio: aspectRatio,
      resolution: resolution,
    };

    try {
      const res = await createTask({
        version: DEFAULT_GPT_VERSION,
        input: requestPayloadInput,
        simulate: isSimulating,
        accessCode: accessStatus.code,
      });

      const newTask: GenerationTask = {
        id: res.taskId,
        prompt: 'Студийна визия: ' + garmentImage.filename,
        version: DEFAULT_GPT_VERSION,
        modelName: 'Martitony Style Lab Lookbook Engine',
        modelVariant: 'studio-standard',
        status: 'starting',
        outputUrls: [],
        referenceImages: [garmentImage.url, modelImage.url],
        aspectRatio,
        resolution,
        createdAt: Date.now(),
        cost: res.cost || 10,
        isSimulated: res.isSimulated,
      };

      setCurrentTask(newTask);
      if (typeof res.remaining === 'number') {
        applyServerBalance({
          remaining: res.remaining,
          dailyRemaining: res.dailyRemaining,
          dailyLimitReached: res.dailyLimitReached,
        });
      }
      startPolling(res.taskId, newTask, accessStatus.code);
    } catch (err: any) {
      console.warn('Generation task error:', err);
      setIsGenerating(false);
      if (err instanceof ApiRequestError) {
        if (typeof err.remaining === 'number') {
          applyServerBalance({
            remaining: err.remaining,
            dailyRemaining: err.dailyRemaining,
            dailyLimitReached: err.dailyLimitReached,
            used: err.used,
            totalAllowed: err.totalAllowed,
          });
        }
        setGeneralError(err.message);
        if (err.code === 'NO_TRIES') {
          setSupportLetterImage(currentTask?.outputUrls?.[0]);
          setSupportLetterOpen(true);
        }
        return;
      }
      setGeneralError(err.message || 'Възникна грешка при стартиране на генерацията.');
    }
  };

  const handleDeleteHistoryTask = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      if (accessStatus.code) {
        saveStoredHistory(accessStatus.code, updated);
      }
      return updated;
    });
    if (currentTask?.id === id) {
      setCurrentTask(null);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    if (accessStatus.code) {
      saveStoredHistory(accessStatus.code, []);
    }
    setCurrentTask(null);
  };

  // Route to Admin if path is /admin
  if (currentPath.startsWith('/admin')) {
    return <AdminDashboard onBackToStudio={() => navigateTo('/')} />;
  }

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-neutral-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Bar Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        historyCount={history.length}
        onOpenAdmin={() => navigateTo('/admin')}
        hasValidCode={accessStatus.valid}
        accessCode={accessStatus.code}
        remainingGenerations={accessStatus.remaining}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Tab 1: Studio Generator */}
        {activeTab === 'generate' && (
          <div className="space-y-6">
            {!accessStatus.valid ? (
              <InviteAccessGate
                currentCodeInput={extractCodeFromUrl()}
                errorMessage={codeErrorMessage}
                onCodeSubmit={handleApplyCode}
                isLoading={isValidatingCode}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: 3-Step Simplified Boutique Flow */}
                <div className="lg:col-span-6 space-y-5">
                  {/* General Error Notice */}
                  {generalError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-3 shadow-xs">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="font-semibold text-rose-900">Информация</p>
                        <p className="leading-relaxed">{generalError}</p>
                      </div>
                    </div>
                  )}

                  {/* 3-Step Container */}
                  <div className="p-5 sm:p-6 rounded-2xl border border-neutral-200 bg-white shadow-xs space-y-6">
                    {/* Step 1 & Step 2 */}
                    <ImageUploader
                      garmentImage={garmentImage}
                      onGarmentChange={setGarmentImage}
                      modelImage={modelImage}
                      onModelChange={setModelImage}
                    />

                    <div className="space-y-1.5">
                      <label htmlFor="extra-instructions" className="block text-sm font-semibold text-neutral-900">
                        Допълнителни инструкции (по избор)
                      </label>
                      <textarea
                        id="extra-instructions"
                        rows={2}
                        maxLength={300}
                        value={extraInstructions}
                        onChange={(e) => setExtraInstructions(e.target.value)}
                        placeholder="напр. дрехата да е по-дълга, светъл фон"
                        className="w-full bg-white border border-neutral-200 focus:border-neutral-900 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors resize-none leading-relaxed shadow-xs"
                      />
                    </div>

                    {/* Small "Настройки" link for Aspect Ratio & Resolution */}
                    <ModelParameters
                      aspectRatio={aspectRatio}
                      onAspectRatioChange={setAspectRatio}
                      resolution={resolution}
                      onResolutionChange={setResolution}
                    />

                    {/* Step 3: Big Black Generate Button */}
                    <div className="space-y-3 pt-2">
                      {accessStatus.remaining <= 0 ? (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSupportLetterImage(currentTask?.outputUrls?.[0]);
                              setSupportLetterOpen(true);
                            }}
                            className="w-full py-4 px-6 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-[0.99] cursor-pointer"
                          >
                            <span>Искам това за моя уебшоп</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            type="button"
                            disabled={isGenerating || accessStatus.remaining <= 0}
                            onClick={handleGenerate}
                            className={`w-full py-4 px-6 rounded-xl font-bold text-base flex items-center justify-center gap-2.5 transition-all shadow-sm cursor-pointer ${
                              isGenerating
                                ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
                                : 'bg-neutral-950 hover:bg-neutral-800 text-white active:scale-[0.99]'
                            }`}
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin text-white" />
                                <span>Генериране на визията...</span>
                              </>
                            ) : (
                              <>
                                <span>Генерирай</span>
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>

                          {/* Code badge in plain text, no dot */}
                          <div className="text-center pt-1">
                            <span className="text-xs text-neutral-500">
                              Остават {accessStatus.remaining} {accessStatus.remaining === 1 ? 'проба' : 'проби'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Viewport & Result */}
                <div className="lg:col-span-6 space-y-4 lg:sticky lg:top-24">
                  {/* Active Task Status Card */}
                  {currentTask && (
                    <TaskViewer
                      taskId={currentTask.id}
                      status={currentTask.status}
                      error={currentTask.error}
                      isSimulated={currentTask.isSimulated}
                      onRetry={handleGenerate}
                    />
                  )}

                  {/* Viewport: generated artwork */}
                  <div className="min-h-[500px]">
                    <ResultViewport
                      currentTask={currentTask}
                      isGenerating={isGenerating}
                      onRegenerate={handleGenerate}
                      onRequestSupportLetter={(img) => {
                        setSupportLetterImage(img || currentTask?.outputUrls?.[0]);
                        setSupportLetterOpen(true);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Gallery History */}
        {activeTab === 'gallery' && (
          <GalleryHistory
            tasks={history}
            onSelectTask={(task) => {
              setCurrentTask(task);
              setActiveTab('generate');
            }}
            onDeleteTask={handleDeleteHistoryTask}
            onClearAll={handleClearHistory}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-900 uppercase tracking-tight">
              Martitony Style Lab
            </span>
            <span aria-hidden="true">·</span>
            <span>Дигитално студио за модна фотография за бутици и брандове</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="mailto:info@martitony.com"
              className="hover:text-emerald-700 transition-colors flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-neutral-400" />
              <span>info@martitony.com</span>
            </a>
            <button
              onClick={() => navigateTo('/admin')}
              className="hover:text-emerald-700 transition-colors cursor-pointer"
            >
              Администрация
            </button>
          </div>
        </div>
      </footer>

      {/* Support Letter Modal */}
      <SupportLetterModal
        isOpen={supportLetterOpen}
        onClose={() => setSupportLetterOpen(false)}
        accessCode={accessStatus.code}
        lastImageUrl={supportLetterImage || currentTask?.outputUrls?.[0]}
      />
    </div>
  );
}
