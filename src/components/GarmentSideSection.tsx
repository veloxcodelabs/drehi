import React, { useRef, useState } from 'react';
import { UploadCloud, X, Loader2, Plus, Trash2, Check, Shirt } from 'lucide-react';
import { UploadedImage } from '../types';
import { SizeChart, SizeRow, FitType, FIT_TYPE_LABELS } from '../../fit_guidance';
import { uploadImageFile } from '../lib/api';
import { IMAGE_FORMAT_MESSAGE } from '../../image_payload';

interface GarmentSideSectionProps {
  garmentImage: UploadedImage | null;
  onGarmentChange: (img: UploadedImage | null) => void;
  chart: SizeChart;
  onChartChange: (chart: SizeChart) => void;
  chosenSize: string | null;
  onChosenSizeChange: (size: string) => void;
  recommendedSize: string | null;
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
  recommendedSize,
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

  const handleFitTypeChange = (fitType: FitType) => {
    onChartChange({
      ...chart,
      fitType,
      updatedAt: Date.now(),
    });
  };

  const handleRowChange = (index: number, field: keyof SizeRow, value: string) => {
    const nextRows = [...chart.rows];
    const currentRow = { ...nextRows[index] };

    if (field === 'size') {
      currentRow.size = value.toUpperCase();
    } else {
      const num = parseFloat(value);
      currentRow[field] = isNaN(num) ? 0 : num;
    }

    nextRows[index] = currentRow;
    onChartChange({
      ...chart,
      rows: nextRows,
      updatedAt: Date.now(),
    });
  };

  const handleAddRow = () => {
    const existingSizes = chart.rows.map((r) => r.size.toUpperCase());
    let nextName = 'XXL';
    if (existingSizes.includes('XXL')) nextName = '3XL';
    if (existingSizes.includes('3XL')) nextName = '4XL';

    const last = chart.rows[chart.rows.length - 1];
    const newRow: SizeRow = {
      size: nextName,
      bust: last ? last.bust + 6 : 108,
      waist: last ? last.waist + 6 : 90,
      hips: last ? last.hips + 6 : 116,
      length: last?.length ? last.length + 2 : 94,
    };

    onChartChange({
      ...chart,
      rows: [...chart.rows, newRow],
      updatedAt: Date.now(),
    });
  };

  const handleDeleteRow = (index: number) => {
    if (chart.rows.length <= 1) return;
    const deletedSize = chart.rows[index]?.size;
    const nextRows = chart.rows.filter((_, i) => i !== index);
    onChartChange({
      ...chart,
      rows: nextRows,
      updatedAt: Date.now(),
    });

    if (chosenSize && chosenSize.toUpperCase() === deletedSize?.toUpperCase()) {
      onChosenSizeChange(nextRows[0]?.size || '');
    }
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
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 text-neutral-900 animate-spin" />
                  <span className="text-xs text-neutral-500">Качване на снимката...</span>
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

        {/* Panel to the RIGHT of the garment: "Мерки на дрехата" */}
        {garmentImage && (
          <div className="md:col-span-7 rounded-xl border border-neutral-200 bg-white p-4 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900">
                Мерки на дрехата
              </h4>

              {/* Select "Кройка": Прилепнала / Стандартна / Свободна */}
              <div className="flex items-center gap-2">
                <label htmlFor="fit-cut-select" className="text-xs text-neutral-500 shrink-0">
                  Кройка:
                </label>
                <select
                  id="fit-cut-select"
                  value={chart.fitType}
                  onChange={(e) => handleFitTypeChange(e.target.value as FitType)}
                  className="text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2.5 py-1 text-neutral-900 font-medium focus:outline-none focus:border-neutral-900 transition-colors"
                >
                  <option value="slim">Прилепнала (+3 см)</option>
                  <option value="regular">Стандартна (+6 см)</option>
                  <option value="relaxed">Свободна (+10 см)</option>
                </select>
              </div>
            </div>

            {/* Table: Размер | Гърди (см) | Талия (см) | Ханш (см) | Дължина (см) */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-neutral-100 text-[11px] text-neutral-500 uppercase tracking-tight">
                    <th className="pb-2 font-medium">Размер</th>
                    <th className="pb-2 font-medium">Гърди (см)</th>
                    <th className="pb-2 font-medium">Талия (см)</th>
                    <th className="pb-2 font-medium">Ханш (см)</th>
                    <th className="pb-2 font-medium">Дължина (см)</th>
                    <th className="pb-2 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {chart.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.size}
                          onChange={(e) => handleRowChange(idx, 'size', e.target.value)}
                          className="w-14 px-2 py-1 bg-white border border-neutral-200 rounded font-semibold text-neutral-900 text-center uppercase focus:outline-none focus:border-neutral-900"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={40}
                          max={200}
                          value={row.bust || ''}
                          onChange={(e) => handleRowChange(idx, 'bust', e.target.value)}
                          className="w-16 px-2 py-1 bg-white border border-neutral-200 rounded text-neutral-900 text-center focus:outline-none focus:border-neutral-900"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={40}
                          max={200}
                          value={row.waist || ''}
                          onChange={(e) => handleRowChange(idx, 'waist', e.target.value)}
                          className="w-16 px-2 py-1 bg-white border border-neutral-200 rounded text-neutral-900 text-center focus:outline-none focus:border-neutral-900"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={40}
                          max={200}
                          value={row.hips || ''}
                          onChange={(e) => handleRowChange(idx, 'hips', e.target.value)}
                          className="w-16 px-2 py-1 bg-white border border-neutral-200 rounded text-neutral-900 text-center focus:outline-none focus:border-neutral-900"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={30}
                          max={200}
                          value={row.length || ''}
                          onChange={(e) => handleRowChange(idx, 'length', e.target.value)}
                          className="w-16 px-2 py-1 bg-white border border-neutral-200 rounded text-neutral-900 text-center focus:outline-none focus:border-neutral-900"
                        />
                      </td>
                      <td className="py-1.5 text-right pl-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(idx)}
                          disabled={chart.rows.length <= 1}
                          className="p-1 text-neutral-300 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-neutral-300 transition-colors cursor-pointer"
                          title="Изтрий ред"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 py-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Добави размер</span>
              </button>
            </div>

            {/* Size chips built from the filled rows */}
            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-700">Изберете размер за проба:</span>
                {recommendedSize && (
                  <span className="text-[11px] font-semibold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded">
                    Препоръчваме размер {recommendedSize}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {sizeOptions.map((row) => {
                  const isSelected = chosenSize?.toUpperCase() === row.size.toUpperCase();
                  const isRec = recommendedSize?.toUpperCase() === row.size.toUpperCase();

                  return (
                    <button
                      key={row.size}
                      type="button"
                      onClick={() => onChosenSizeChange(row.size)}
                      className={`px-3 py-1.5 text-xs rounded-md transition-all cursor-pointer font-medium ${
                        isSelected
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : isRec
                          ? 'bg-white text-neutral-900 border-2 border-neutral-900 hover:bg-neutral-50'
                          : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {row.size}
                      {isRec && !isSelected && (
                        <span className="ml-1 text-[10px] text-neutral-500">★</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
