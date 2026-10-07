import React, { useRef, useState } from 'react';
import { UploadCloud, X, Loader2, Check, User } from 'lucide-react';
import { UploadedImage, CustomerMeasurements } from '../types';
import { uploadImageFile } from '../lib/api';
import { IMAGE_FORMAT_MESSAGE } from '../../image_payload';

interface PersonSideSectionProps {
  personImage: UploadedImage | null;
  onPersonChange: (img: UploadedImage | null) => void;
  measurements: CustomerMeasurements;
  onMeasurementsChange: (next: CustomerMeasurements) => void;
  showEmptyHint?: boolean;
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

export const PersonSideSection: React.FC<PersonSideSectionProps> = ({
  personImage,
  onPersonChange,
  measurements,
  onMeasurementsChange,
  showEmptyHint = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      onPersonChange({
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

  const handleFieldChange = (field: keyof CustomerMeasurements, val: string) => {
    const raw = val.trim();
    if (raw === '') {
      onMeasurementsChange({ ...measurements, [field]: undefined });
      return;
    }
    const num = parseFloat(raw);
    const safe = !isNaN(num) ? num : undefined;
    onMeasurementsChange({ ...measurements, [field]: safe });
  };

  const isFieldMissing = (val?: number) => {
    return typeof val !== 'number' || isNaN(val) || val < 50 || val > 250;
  };

  const hasAnyEmpty =
    isFieldMissing(measurements.height) ||
    isFieldMissing(measurements.bust) ||
    isFieldMissing(measurements.waist) ||
    isFieldMissing(measurements.hips);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <span>2. Ваша снимка</span>
            {personImage && <Check className="w-4 h-4 text-neutral-900" />}
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Снимка в цял ръст или фигура на изчистен фон
          </p>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
          {errorMsg}
        </p>
      )}

      {/* Grid: Photo on Left, Panel to the Right (below on mobile) */}
      <div className={`grid grid-cols-1 ${personImage ? 'md:grid-cols-12 gap-5' : 'gap-4'} items-start`}>
        {/* Photo Area */}
        <div className={personImage ? 'md:col-span-5' : 'w-full'}>
          {personImage ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 space-y-3">
              <div className="relative aspect-3/4 rounded-lg overflow-hidden bg-white border border-neutral-200">
                <img
                  src={personImage.previewUrl || personImage.url}
                  alt={personImage.filename}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-medium text-neutral-800 truncate max-w-[180px]">
                  {personImage.filename}
                </span>
                <button
                  type="button"
                  onClick={() => onPersonChange(null)}
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
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 text-neutral-900 animate-spin" />
                  <span className="text-xs text-neutral-500">Качване на снимката...</span>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-800 mb-2.5">
                    <User className="w-5 h-5" />
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

        {/* Panel to the RIGHT of the photo: "Вашите мерки" */}
        {personImage && (
          <div className="md:col-span-7 rounded-xl border border-neutral-200 bg-white p-4 space-y-4 shadow-xs">
            <div className="border-b border-neutral-100 pb-3 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900">
                Вашите мерки
              </h4>
              <span className="text-[11px] text-neutral-400">
                50 – 250 см
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Ръст (см) <span className="text-neutral-400">*</span>
                </label>
                <input
                  type="number"
                  min={50}
                  max={250}
                  step={1}
                  placeholder="напр. 170"
                  value={measurements.height ?? ''}
                  onChange={(e) => handleFieldChange('height', e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors ${
                    showEmptyHint && isFieldMissing(measurements.height)
                      ? 'border-rose-300 bg-rose-50/20'
                      : 'border-neutral-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Гърди (см) <span className="text-neutral-400">*</span>
                </label>
                <input
                  type="number"
                  min={50}
                  max={250}
                  step={1}
                  placeholder="напр. 88"
                  value={measurements.bust ?? ''}
                  onChange={(e) => handleFieldChange('bust', e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors ${
                    showEmptyHint && isFieldMissing(measurements.bust)
                      ? 'border-rose-300 bg-rose-50/20'
                      : 'border-neutral-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Талия (см) <span className="text-neutral-400">*</span>
                </label>
                <input
                  type="number"
                  min={50}
                  max={250}
                  step={1}
                  placeholder="напр. 70"
                  value={measurements.waist ?? ''}
                  onChange={(e) => handleFieldChange('waist', e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors ${
                    showEmptyHint && isFieldMissing(measurements.waist)
                      ? 'border-rose-300 bg-rose-50/20'
                      : 'border-neutral-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Ханш (см) <span className="text-neutral-400">*</span>
                </label>
                <input
                  type="number"
                  min={50}
                  max={250}
                  step={1}
                  placeholder="напр. 96"
                  value={measurements.hips ?? ''}
                  onChange={(e) => handleFieldChange('hips', e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-neutral-900 focus:outline-none focus:border-neutral-900 transition-colors ${
                    showEmptyHint && isFieldMissing(measurements.hips)
                      ? 'border-rose-300 bg-rose-50/20'
                      : 'border-neutral-200'
                  }`}
                />
              </div>
            </div>

            {/* Hint if empty or invalid */}
            {hasAnyEmpty && (
              <p className="text-[11px] text-neutral-500 pt-1">
                Полетата са задължителни преди генериране (стойности между 50 и 250 см).
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
