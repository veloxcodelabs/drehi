import React, { useRef, useState } from 'react';
import { Loader2, Plus, Check, Shirt } from 'lucide-react';
import { UploadedImage } from '../types';
import { SizeChart, SizeRow } from '../../fit_guidance';
import { uploadImageFile } from '../lib/api';
import { IMAGE_FORMAT_MESSAGE } from '../../image_payload';

interface GarmentSideSectionProps {
  garmentImage: UploadedImage | null;
  onGarmentChange: (img: UploadedImage | null) => void;
  chart: SizeChart;
  onChartChange: (chart: SizeChart) => void;
  chosenSize: string | null;
  onChosenSizeChange: (size: string) => void;
  recommendedSize?: string | null;
  isLoadingGarment?: boolean;
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

export const GarmentSideSection: React.FC<GarmentSideSectionProps> = ({
  garmentImage,
  onGarmentChange,
  chart,
  onChartChange,
  chosenSize,
  onChosenSizeChange,
  isLoadingGarment,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAddSize, setShowAddSize] = useState(false);
  const [newSizeInput, setNewSizeInput] = useState('');

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!isImageFile(file)) {
      setErrorMsg(IMAGE_FORMAT_MESSAGE);
      return;
    }

    setErrorMsg(null);
    setIsUploading(true);
    try {
      const uploaded = await uploadImageFile(file);
      onGarmentChange({
        id: Math.random().toString(36).substring(2, 9),
        url: uploaded.url,
        previewUrl: uploaded.previewUrl || uploaded.url,
        filename: uploaded.filename,
        size: file.size,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Грешка при качване на снимката');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddCustomSize = (sizeName: string) => {
    const trimmed = sizeName.trim().toUpperCase();
    if (!trimmed) return;
    const exists = chart.rows.some((r) => r.size.toUpperCase() === trimmed);
    if (!exists) {
      const newRow: SizeRow = {
        size: trimmed,
        bust: 0,
        waist: 0,
        hips: 0,
      };
      onChartChange({
        ...chart,
        rows: [...chart.rows, newRow],
        updatedAt: Date.now(),
      });
    }
    onChosenSizeChange(trimmed);
  };

  // Distinct list of non-empty sizes for chips
  const sizeOptions = chart.rows.filter((r) => r.size.trim().length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <span>1. Снимка на дрехата</span>
            {garmentImage && <Check className="w-4 h-4 text-neutral-900" />}
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Снимка на закачалка, манекен или равна повърхност
          </p>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
          {errorMsg}
        </p>
      )}

      {/* Grid: Photo on Left, Panel to the Right (below on mobile) */}
      <div className={`grid grid-cols-1 ${garmentImage ? 'md:grid-cols-12 gap-5' : 'gap-4'} items-start`}>
        {/* Photo Area */}
        <div className={garmentImage ? 'md:col-span-5' : 'w-full'}>
          {garmentImage ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 space-y-3">
              <div className="relative aspect-3/4 rounded-lg overflow-hidden bg-white border border-neutral-200">
                <img
                  src={garmentImage.previewUrl || garmentImage.url}
                  alt={garmentImage.filename}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-medium text-neutral-800 truncate max-w-[180px]">
                  {garmentImage.filename}
                </span>
                <button
                  type="button"
                  onClick={() => onGarmentChange(null)}
                  className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
                >
                  Смени снимката
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-neutral-300 hover:border-neutral-900 bg-white hover:bg-neutral-50/50 p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              {isUploading || isLoadingGarment ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 text-neutral-900 animate-spin" />
                  <span className="text-xs text-neutral-500">
                    {isLoadingGarment ? 'Зареждане на снимката от магазина...' : 'Качване на снимката...'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-800 mb-2.5">
                    <Shirt className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-neutral-900">
                    Натиснете за избор на снимка
                  </span>
                  <span className="text-[11px] text-neutral-400 mt-0.5">
                    JPG, PNG или WEBP
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Panel to the RIGHT of the garment: Size Selection */}
        {garmentImage && (
          <div className="md:col-span-7 rounded-xl border border-neutral-200 bg-white p-4 space-y-4 shadow-xs">
            <div className="border-b border-neutral-100 pb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900">
                Изберете размер за проба
              </h4>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {sizeOptions.map((row) => {
                  const isSelected = chosenSize?.toUpperCase() === row.size.toUpperCase();

                  return (
                    <button
                      key={row.size}
                      type="button"
                      onClick={() => onChosenSizeChange(row.size)}
                      className={`px-3.5 py-2 text-xs rounded-lg transition-all cursor-pointer font-medium ${
                        isSelected
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {row.size}
                    </button>
                  );
                })}

                {showAddSize ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddCustomSize(newSizeInput);
                      setNewSizeInput('');
                      setShowAddSize(false);
                    }}
                    className="inline-flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      autoFocus
                      placeholder="размер"
                      value={newSizeInput}
                      onChange={(e) => setNewSizeInput(e.target.value)}
                      className="w-18 px-2 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg text-center uppercase focus:outline-none focus:border-neutral-900"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1.5 text-xs bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 cursor-pointer font-medium"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddSize(false);
                        setNewSizeInput('');
                      }}
                      className="px-1.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddSize(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-2 text-xs rounded-lg border border-dashed border-neutral-300 text-neutral-500 hover:text-neutral-900 hover:border-neutral-400 transition-colors cursor-pointer"
                    title="Добави друг размер"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добави</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
