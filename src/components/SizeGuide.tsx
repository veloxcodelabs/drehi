import React, { useEffect, useRef, useState } from 'react';
import { interpretMeasurements, recommendSize, type SizeChart } from '../../size_chart';

export interface FitRequestPayload {
  size: string;
  height: number;
  bust: number;
  waist: number;
  hips: number;
}

interface SizeGuideProps {
  chart: SizeChart;
  onChange: (request: FitRequestPayload | null) => void;
}

const FIELDS = [
  { key: 'height', label: 'Ръст (см)' },
  { key: 'bust', label: 'Бюст (см)' },
  { key: 'waist', label: 'Талия (см)' },
  { key: 'hips', label: 'Ханш (см)' },
] as const;

export const SizeGuide: React.FC<SizeGuideProps> = ({ chart, onChange }) => {
  const [height, setHeight] = useState('');
  const [bust, setBust] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [manualLabel, setManualLabel] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const values = { height, bust, waist, hips };
  const reading = interpretMeasurements(values);
  const measurementKey = `${height}|${bust}|${waist}|${hips}`;
  const recommendation = reading.status === 'ok' ? recommendSize(chart, reading.body) : null;
  const chosen =
    recommendation && manualKey === measurementKey && manualLabel && chart.sizes.some((row) => row.label === manualLabel)
      ? manualLabel
      : recommendation?.sizeLabel || null;

  const request: FitRequestPayload | null =
    reading.status === 'ok' && chosen ? { size: chosen, ...reading.body } : null;
  const signature = request
    ? `${request.size}|${request.height}|${request.bust}|${request.waist}|${request.hips}`
    : '';

  useEffect(() => {
    onChangeRef.current(request);
  }, [signature]);

  useEffect(() => {
    return () => onChangeRef.current(null);
  }, []);

  const setters = {
    height: setHeight,
    bust: setBust,
    waist: setWaist,
    hips: setHips,
  };

  return (
    <div className="space-y-3 border-b border-neutral-100 pb-5">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">Мерки за размер (по избор)</h3>
        <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
          Ако ги въведете, ще ги сравним с таблицата на бутика и ще препоръчаме размер.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="block space-y-1">
            <span className="text-[11px] font-medium text-neutral-600">{field.label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={values[field.key]}
              onChange={(event) => setters[field.key](event.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900"
            />
          </label>
        ))}
      </div>

      {reading.status === 'invalid' && (
        <p className="text-xs text-rose-700">Въведете мерките в сантиметри.</p>
      )}
      {reading.status === 'incomplete' && (
        <p className="text-xs text-neutral-500">Попълнете и четирите мерки, за да препоръчаме размер.</p>
      )}

      {recommendation && recommendation.message && (
        <div className="space-y-2.5">
          <p className="text-sm text-neutral-800 leading-relaxed">{recommendation.message}</p>
          <div className="flex flex-wrap gap-1.5">
            {chart.sizes.map((row) => {
              const selected = chosen === row.label;
              return (
                <button
                  key={row.label}
                  type="button"
                  onClick={() => {
                    setManualLabel(row.label);
                    setManualKey(measurementKey);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    selected
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                  }`}
                >
                  {row.label}
                </button>
              );
            })}
          </div>
          {chosen && recommendation.sizeLabel && chosen !== recommendation.sizeLabel && (
            <p className="text-xs text-neutral-600">Ще генерираме размер {chosen}.</p>
          )}
        </div>
      )}
    </div>
  );
};
