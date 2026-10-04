import React, { useRef, useState } from 'react';
import { UploadCloud, X, Loader2, Check, User, Shirt } from 'lucide-react';
import { UploadedImage } from '../types';
import { uploadImageFile } from '../lib/api';
import { IMAGE_FORMAT_MESSAGE } from '../../image_payload';

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

interface ImageUploaderProps {
  garmentImage: UploadedImage | null;
  onGarmentChange: (img: UploadedImage | null) => void;
  modelImage: UploadedImage | null;
  onModelChange: (img: UploadedImage | null) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  garmentImage,
  onGarmentChange,
  modelImage,
  onModelChange,
}) => {
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingGarment, setIsUploadingGarment] = useState(false);
  const [isUploadingModel, setIsUploadingModel] = useState(false);

  const [garmentError, setGarmentError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const handleGarmentFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!isImageFile(file)) {
      setGarmentError(IMAGE_FORMAT_MESSAGE);
      return;
    }

    setGarmentError(null);
    setIsUploadingGarment(true);
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
      setGarmentError(err.message || 'Грешка при качване на снимката');
    } finally {
      setIsUploadingGarment(false);
      if (garmentInputRef.current) garmentInputRef.current.value = '';
    }
  };

  const handleModelFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!isImageFile(file)) {
      setModelError(IMAGE_FORMAT_MESSAGE);
      return;
    }

    setModelError(null);
    setIsUploadingModel(true);
    try {
      const uploaded = await uploadImageFile(file);
      onModelChange({
        id: Math.random().toString(36).substring(2, 9),
        url: uploaded.url,
        previewUrl: uploaded.previewUrl || uploaded.url,
        filename: uploaded.filename,
        size: file.size,
      });
    } catch (err: any) {
      setModelError(err.message || 'Грешка при качване на снимката');
    } finally {
      setIsUploadingModel(false);
      if (modelInputRef.current) modelInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Upload garment photo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <span>1. Качете снимка на дрехата</span>
              {garmentImage && <Check className="w-4 h-4 text-emerald-600" />}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Снимка на закачалка, манекен или равна повърхност
            </p>
          </div>
        </div>

        {garmentError && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-lg">
            {garmentError}
          </p>
        )}

        {garmentImage ? (
          <div className="relative rounded-xl border border-neutral-200 bg-white p-3 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-20 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0">
                <img
                  src={garmentImage.previewUrl || garmentImage.url}
                  alt={garmentImage.filename}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-900 truncate">
                  {garmentImage.filename}
                </p>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  Дрехата е заредена успешно
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onGarmentChange(null)}
              className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              title="Премахни снимката"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => garmentInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-neutral-300 hover:border-neutral-900 bg-white hover:bg-neutral-50/50 p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors shadow-xs"
          >
            <input
              ref={garmentInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => handleGarmentFile(e.target.files)}
            />
            {isUploadingGarment ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 text-neutral-900 animate-spin" />
                <span className="text-xs text-neutral-500">Качване на снимката...</span>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 mb-2">
                  <Shirt className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-neutral-900">
                  Натиснете тук за избор на снимка
                </span>
                <span className="text-[11px] text-neutral-400 mt-0.5">
                  или пуснете файла в полето (JPG, PNG)
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Upload model photo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <span>2. Качете снимка на модел</span>
              {modelImage && <Check className="w-4 h-4 text-emerald-600" />}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Снимка на модел или манекен, върху който да се визуализира дрехата
            </p>
          </div>
        </div>

        {modelError && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-lg">
            {modelError}
          </p>
        )}

        {modelImage ? (
          <div className="relative rounded-xl border border-neutral-200 bg-white p-3 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-20 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0">
                <img
                  src={modelImage.previewUrl || modelImage.url}
                  alt={modelImage.filename}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-900 truncate">
                  {modelImage.filename}
                </p>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  Моделът е зареден успешно
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onModelChange(null)}
              className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              title="Премахни снимката на модела"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => modelInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-neutral-300 hover:border-neutral-900 bg-white hover:bg-neutral-50/50 p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors shadow-xs"
          >
            <input
              ref={modelInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => handleModelFile(e.target.files)}
            />
            {isUploadingModel ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 text-neutral-900 animate-spin" />
                <span className="text-xs text-neutral-500">Качване на снимката...</span>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 mb-2">
                  <User className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-neutral-900">
                  Натиснете тук за избор на снимка на модел
                </span>
                <span className="text-[11px] text-neutral-400 mt-0.5">
                  или пуснете файла в полето (JPG, PNG)
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
