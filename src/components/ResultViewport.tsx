import React, { useState } from 'react';
import { Download, Maximize2, X, RefreshCw, Copy, Check, ArrowRight, ArrowRightCircle, Image as ImageIcon } from 'lucide-react';
import { GenerationTask } from '../types';
import { getProxyImageUrl } from '../lib/api';

interface ResultViewportProps {
  currentTask: GenerationTask | null;
  isGenerating: boolean;
  onReusePrompt?: (prompt: string) => void;
  onUseAsReference?: (url: string) => void;
  onRegenerate: () => void;
  onRequestSupportLetter?: (imageUrl?: string) => void;
}

// Exact Before/After pairs (garment photo -> model wearing it)
const BEFORE_AFTER_PAIRS = [
  {
    id: 'pair-blazer',
    title: 'Ленено сако',
    garmentImg: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=600&q=80',
    garmentLabel: 'Снимка на закачалка',
    modelImg: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=600&q=80',
    modelLabel: 'Облечено от студиен модел',
  },
  {
    id: 'pair-dress',
    title: 'Елегантна рокля',
    garmentImg: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
    garmentLabel: 'Снимка на щендер',
    modelImg: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=600&q=80',
    modelLabel: 'Облечена от студиен модел',
  },
  {
    id: 'pair-knit',
    title: 'Плетен пуловер',
    garmentImg: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=600&q=80',
    garmentLabel: 'Снимка на равна повърхност',
    modelImg: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80',
    modelLabel: 'Облечен от студиен модел',
  },
];

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

  const handleCopyUrl = () => {
    if (!primaryOutput) return;
    navigator.clipboard.writeText(primaryOutput);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Empty state: Before/After comparison pairs
  if (!currentTask && !isGenerating) {
    return (
      <div className="h-full min-h-[480px] rounded-xl border border-neutral-200 bg-white flex flex-col justify-between p-5 sm:p-6 shadow-xs">
        <div>
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-900">
              Примери: Преди и След
            </span>
            <span className="text-xs text-neutral-400">
              Дреха → Модел
            </span>
          </div>

          <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
            Вижте как обикновена продуктова снимка на дреха се визуализира реалистично върху студиен модел:
          </p>

          {/* 3 Before/After Pairs */}
          <div className="my-5 space-y-4">
            {BEFORE_AFTER_PAIRS.map((pair) => (
              <div
                key={pair.id}
                className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-900">
                    {pair.title}
                  </span>
                  <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                    <span>Преди</span>
                    <ArrowRight className="w-3 h-3 text-neutral-400" />
                    <span>След</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* Before: Garment photo */}
                  <div className="space-y-1">
                    <div className="aspect-[3/4] rounded-lg overflow-hidden bg-neutral-200 border border-neutral-200 relative group">
                      <img
                        src={pair.garmentImg}
                        alt={pair.garmentLabel}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">
                        Дреха
                      </div>
                    </div>
                    <p className="text-[10px] text-neutral-500 line-clamp-1">
                      {pair.garmentLabel}
                    </p>
                  </div>

                  {/* After: Model wearing it */}
                  <div className="space-y-1">
                    <div className="aspect-[3/4] rounded-lg overflow-hidden bg-neutral-200 border border-neutral-200 relative group">
                      <img
                        src={pair.modelImg}
                        alt={pair.modelLabel}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-medium">
                        Модел
                      </div>
                    </div>
                    <p className="text-[10px] text-neutral-500 line-clamp-1">
                      {pair.modelLabel}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-neutral-100 pt-3 text-xs text-neutral-500 flex items-center justify-between">
          <span>Качете дреха вляво, изберете модел и натиснете <strong>Генерирай</strong>.</span>
        </div>
      </div>
    );
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
              <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                <ImageIcon className="w-8 h-8 text-neutral-400 mb-2" />
                <p className="text-xs text-neutral-700 font-medium">Неуспешно зареждане на прегледа</p>
                <a
                  href={downloadUrl}
                  download
                  className="mt-2 text-xs text-emerald-700 hover:underline"
                >
                  Свали файла директно
                </a>
              </div>
            ) : (
              <img
                src={proxyUrl}
                alt="Martitony Style Lab Визия"
                referrerPolicy="no-referrer"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`max-h-[640px] w-auto max-w-full object-contain transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}

            {/* Quick Action Overlay */}
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
          </>
        ) : (
          <div className="text-center p-8 text-neutral-400 text-xs">Няма върнато изображение</div>
        )}
      </div>

      {/* Action and Info Bar */}
      {currentTask && (
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
              src={proxyUrl}
              alt="Преглед на цял екран"
              referrerPolicy="no-referrer"
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl bg-white"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
