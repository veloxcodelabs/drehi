import React, { useState } from 'react';
import { Sliders, ChevronDown, ChevronUp, Check } from 'lucide-react';

interface ModelParametersProps {
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  resolution: string;
  onResolutionChange: (res: string) => void;
}

const ASPECT_RATIOS = [
  { id: '3:4', label: '3:4 (Моден стандарт)', iconClass: 'w-3 h-4' },
  { id: '1:1', label: '1:1 (Квадрат)', iconClass: 'w-4 h-4' },
  { id: '9:16', label: '9:16 (Стори)', iconClass: 'w-3 h-5' },
  { id: '4:3', label: '4:3 (Каталог)', iconClass: 'w-4 h-3' },
];

const RESOLUTIONS = [
  { id: '2k', label: '2K Висока резолюция (по подразбиране)' },
  { id: '4k', label: '4K Ултра детайл' },
  { id: '1k', label: '1K Бърз преглед' },
];

export const ModelParameters: React.FC<ModelParametersProps> = ({
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="pt-1">
      {/* Small "Настройки" toggle link */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer select-none py-1"
      >
        <Sliders className="w-3.5 h-3.5 text-neutral-400" />
        <span className="font-medium">Настройки</span>
        <span className="text-[11px] text-neutral-400">
          ({aspectRatio}, {resolution.toUpperCase()})
        </span>
        {isOpen ? (
          <ChevronUp className="w-3 h-3 text-neutral-400" />
        ) : (
          <ChevronDown className="w-3 h-3 text-neutral-400" />
        )}
      </button>

      {/* Collapsed options */}
      {isOpen && (
        <div className="mt-2.5 p-4 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-4 text-xs transition-all">
          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <label className="font-semibold text-neutral-800 block">
              Формат на кадъра
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onAspectRatioChange(r.id)}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    aspectRatio === r.id
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  <div className={`border border-current rounded-xs shrink-0 ${r.iconClass}`} />
                  <span>{r.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-1.5">
            <label className="font-semibold text-neutral-800 block">
              Качество и резолюция
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {RESOLUTIONS.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => onResolutionChange(res.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer text-left ${
                    resolution === res.id
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-semibold'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  <span>{res.label}</span>
                  {resolution === res.id && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
