import React, { useState, useEffect } from 'react';
import { Download, Maximize2, X, RefreshCw, Copy, Check, ArrowRight, ArrowRightCircle, Image as ImageIcon } from 'lucide-react';
import { GenerationTask } from '../types';
import { getProxyImageUrl } from '../lib/api';
import { isTaskOutputExpired } from '../lib/tryonStorage';

interface ResultViewportProps {
  currentTask: GenerationTask | null;
  isGenerating: boolean;
  onReusePrompt?: (prompt: string) => void;
  onUseAsReference?: (url: string) => void;
  onRegenerate: () => void;
  onRequestSupportLetter?: (imageUrl?: string) => void;
}

export const ResultViewport: React.FC<ResultViewportProps> = ({
  currentTask,
  isGenerating,
  onRegenerate,
  onRequestSupportLetter,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const primaryOutput = currentTask?.outputUrls?.[0];
  const proxyUrl = primaryOutput ? getProxyImageUrl(primaryOutput) : '';
  const downloadUrl = primaryOutput ? getProxyImageUrl(primaryOutput, true) : '';

  const [displaySrc, setDisplaySrc] = useState<string>('');
  const [hasTriedFallback, setHasTriedFallback] = useState(false);

  // Reset image state whenever the displayed output changes
  useEffect(() => {
    setImageLoaded(false);
    setHasTriedFallback(false);
    if (currentTask && isTaskOutputExpired(currentTask)) {
      setImageError(true);
      setDisplaySrc('');
      return;
    }
    setImageError(false);
    if (primaryOutput) {
      setDisplaySrc(proxyUrl || primaryOutput);
    } else {
      setDisplaySrc('');
    }
  }, [primaryOutput, proxyUrl, currentTask]);

  const handleImageError = () => {
    if (isTaskOutputExpired(currentTask)) {
      setImageError(true);
      return;
    }
    // If proxy failed, automatically attempt direct URL as fallback before giving up
    if (!hasTriedFallback && primaryOutput && displaySrc !== primaryOutput) {
      setHasTriedFallback(true);
      setDisplaySrc(primaryOutput);
      return;
    }
    setImageError(true);
  };

  const handleCopyUrl = () => {
    if (!primaryOutput) return;
    navigator.clipboard.writeText(primaryOutput);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (!currentTask && !isGenerating) {
    return null;
  }

  // A rejected try-on keeps the error in the status card. Don't present it as a finished lookbook.
  if (currentTask && !isGenerating && currentTask.status !== 'succeeded') {
    return null;
  }

  // Active generating state
  if (isGenerating && (!currentTask || currentTask.status !== 'succeeded')) {
    return (
      <div className="h-full min-h-[480px] rounded-xl border border-neutral-200 bg-white flex flex-col items-center justify-center p-8 text-center shadow-xs">
        <div className="relative mb-5 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-neutral-900 border-t-transparent animate-spin" />
        </div>
        <h3 className="text-base font-semibold text-neutral-900">
          Създаване на модната визия...
        </h3>
        <p className="text-xs text-neutral-500 max-w-xs mt-1.5 leading-relaxed">
          Системата адаптира дрехата към модела, генерира реалистично падане на материята и студийна светлина.
        </p>

        <div className="mt-6 flex items-center gap-2 text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Обработка на изображението</span>
        </div>
      </div>
    );
  }

  // Result state
  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Primary Image Viewport */}
      <div className="relative rounded-xl border border-neutral-200 bg-neutral-100 overflow-hidden group shadow-xs flex-1 flex items-center justify-center min-h-[420px]">
        {primaryOutput ? (
          <>
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {imageError ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500 space-y-3">
                <ImageIcon className="w-8 h-8 text-neutral-400" />
                <div>
                  <p className="text-xs text-neutral-800 font-semibold">Прегледът от тази сесия е изтекъл</p>
                  <p className="text-[11px] text-neutral-400 mt-1 max-w-xs leading-relaxed">
                    Временните изображения от сесията се съхраняват ограничено време. Можете да генерирате нова визия веднага.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onRegenerate}
                    className="px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
                  >
                    Генерирай отново
                  </button>
                </div>
              </div>
            ) : (
              <img
                src={displaySrc || proxyUrl}
                alt="Martitony Style Lab Визия"
                referrerPolicy="no-referrer"
                onLoad={() => setImageLoaded(true)}
                onError={handleImageError}
                className={`max-h-[640px] w-auto max-w-full object-contain transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}

            {/* Quick Action Overlay */}
            {!imageError && imageLoaded && (
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur-md p-1 rounded-lg border border-neutral-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                  title="Цял екран"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <a
                  href={downloadUrl}
                  download="martitony-style-lab.png"
                  className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                  title="Свали изображението"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                  title="Копирай линк"
                >
                  {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center p-8 text-neutral-400 text-xs">Няма върнато изображение</div>
        )}
      </div>

      {/* Note directly under generated result image */}
      {primaryOutput && !imageError && (
        <p className="text-center text-[12px] sm:text-[13px] text-neutral-500 leading-normal px-2">
          Визуализация с AI – ориентировъчна. За точен размер вижте таблицата с мерки.
        </p>
      )}

      {/* Action and Info Bar */}
      {currentTask && !imageError && (
        <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-neutral-800">
              Готова студийна визия
            </span>

            <a
              href={downloadUrl}
              download="martitony-style-lab.png"
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Свали снимката</span>
            </a>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-neutral-100 text-xs">
            <button
              type="button"
              onClick={onRegenerate}
              className="text-neutral-500 hover:text-neutral-900 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Генерирай нов вариант</span>
            </button>
          </div>

          {/* Primary CTA: "Искам това за моя уебшоп" */}
          <div className="pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => onRequestSupportLetter?.(primaryOutput)}
              className="w-full py-3 px-5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <span>Искам това за моя уебшоп</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Plain note under the result */}
          <p className="text-center text-[12px] sm:text-[13px] text-neutral-500 pt-1 leading-relaxed">
            Визуализация с AI – ориентировъчна. За точен размер вижте таблицата с мерки.
          </p>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxOpen && primaryOutput && (
        <div
          className="fixed inset-0 z-50 bg-neutral-900/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-6xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-10 right-0 p-1.5 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={displaySrc || primaryOutput || proxyUrl}
              alt="Преглед на цял екран"
              referrerPolicy="no-referrer"
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl bg-white"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-center text-[12px] sm:text-[13px] text-neutral-300 mt-2 px-4">
              Визуализация с AI – ориентировъчна. За точен размер вижте таблицата с мерки.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
