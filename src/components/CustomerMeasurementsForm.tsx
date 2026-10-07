import React, { useEffect, useMemo } from 'react';
import type { SizeChart, CustomerMeasurements } from '../types';
import { recommendSize, sortSizeRows } from '../../fit_guidance';

interface CustomerMeasurementsFormProps {
  sizeChart: SizeChart;
  measurements: CustomerMeasurements;
  onMeasurementsChange: (next: CustomerMeasurements) => void;
  chosenSize: string | null;
  onChosenSizeChange: (size: string | null) => void;
}

export const CustomerMeasurementsForm: React.FC<CustomerMeasurementsFormProps> = ({
  sizeChart,
  measurements,
  onMeasurementsChange,
  chosenSize,
  onChosenSizeChange,
}) => {
  const sortedRows = useMemo(() => {
    return sortSizeRows(sizeChart.rows || []);
  }, [sizeChart.rows]);

  const recommendation = useMemo(() => {
    return recommendSize(sizeChart, measurements);
  }, [sizeChart, measurements]);

  // If a recommendation is calculated and the user hasn't manually picked a size yet,
  // or if the previous chosen size was automatically selected by an earlier measurement,
  // sync the recommended size.
  useEffect(() => {
    if (recommendation.recommendedSize && !chosenSize) {
      onChosenSizeChange(recommendation.recommendedSize);
    }
  }, [recommendation.recommendedSize, chosenSize, onChosenSizeChange]);

  const handleFieldChange = (field: keyof CustomerMeasurements, val: string) => {
    const num = val.trim() === '' ? undefined : parseFloat(val);
    const safeNum = typeof num === 'number' && !isNaN(num) && num > 0 ? num : undefined;
    const next = { ...measurements, [field]: safeNum };
    onMeasurementsChange(next);

    // Auto-update chosen size to the new recommendation
    const nextRec = recommendSize(sizeChart, next);
    if (nextRec.recommendedSize) {
      onChosenSizeChange(nextRec.recommendedSize);
    }
  };

  if (!sortedRows || sortedRows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-900">
          Вашите мерки <span className="font-normal text-neutral-500">(по избор за препоръка)</span>
        </span>
        {chosenSize && (
          <span className="text-xs text-neutral-600">
            Избран: <strong className="text-neutral-900 font-semibold">{chosenSize}</strong>
          </span>
        )}
      </div>

      {/* 4 Compact Inputs: Height, Bust, Waist, Hips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="block text-[11px] text-neutral-600 mb-1">
            Ръст (см)
          </label>
          <input
            type="number"
            min={100}
            max={230}
            step={1}
            placeholder="напр. 170"
            value={measurements.height ?? ''}
            onChange={(e) => handleFieldChange('height', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] text-neutral-600 mb-1">
            Гърди (см)
          </label>
          <input
            type="number"
            min={50}
            max={180}
            step={1}
            placeholder="напр. 88"
            value={measurements.bust ?? ''}
            onChange={(e) => handleFieldChange('bust', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] text-neutral-600 mb-1">
            Талия (см)
          </label>
          <input
            type="number"
            min={40}
            max={160}
            step={1}
            placeholder="напр. 70"
            value={measurements.waist ?? ''}
            onChange={(e) => handleFieldChange('waist', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] text-neutral-600 mb-1">
            Ханш (см)
          </label>
          <input
            type="number"
            min={50}
            max={180}
            step={1}
            placeholder="напр. 96"
            value={measurements.hips ?? ''}
            onChange={(e) => handleFieldChange('hips', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
          />
        </div>
      </div>

      {/* Bulgarian Recommendation Line */}
      {recommendation.explanationBg && (
        <div className="bg-white border border-neutral-200 rounded-lg px-3 py-2 text-xs text-neutral-800 flex items-center justify-between gap-2">
          <span>{recommendation.explanationBg}</span>
        </div>
      )}

      {/* Manual Size Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-neutral-500 mr-1">Размер:</span>
        {sortedRows.map((row) => {
          const isSelected = chosenSize?.toUpperCase() === row.size.toUpperCase();
          const isRec = recommendation.recommendedSize?.toUpperCase() === row.size.toUpperCase();

          return (
            <button
              key={row.size}
              type="button"
              onClick={() => onChosenSizeChange(row.size)}
              className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-neutral-900 text-white font-semibold'
                  : 'bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-200 font-medium'
              }`}
            >
              {row.size}
              {isRec && !isSelected && (
                <span className="ml-1 text-[10px] text-neutral-400">•</span>
              )}
            </button>
          );
        })}

        {chosenSize && (
          <button
            type="button"
            onClick={() => onChosenSizeChange(null)}
            className="ml-auto text-[11px] text-neutral-400 hover:text-neutral-700 underline cursor-pointer"
          >
            Изчисти
          </button>
        )}
      </div>
    </div>
  );
};
