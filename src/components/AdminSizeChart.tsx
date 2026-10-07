import React, { useState } from 'react';
import { Ruler } from 'lucide-react';
import {
  DEFAULT_SIZE_LABELS,
  EASE_CM,
  validateSizeChart,
  type FitType,
  type SizeChart,
} from '../../size_chart';

interface DraftRow {
  id: string;
  label: string;
  bust: string;
  waist: string;
  hips: string;
  length: string;
}

const FIT_OPTIONS: { id: FitType; label: string }[] = [
  { id: 'fitted', label: 'Прилепнала' },
  { id: 'regular', label: 'Стандартна' },
  { id: 'loose', label: 'Свободна' },
];

function adminAuthHeaders(adminToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${adminToken}`,
    'X-Admin-Token': adminToken,
  };
}

function newRow(label = ''): DraftRow {
  return {
    id: `row-${Math.random().toString(36).slice(2, 9)}`,
    label,
    bust: '',
    waist: '',
    hips: '',
    length: '',
  };
}

function emptyRows(): DraftRow[] {
  return DEFAULT_SIZE_LABELS.map((label) => newRow(label));
}

function chartToRows(chart: SizeChart): DraftRow[] {
  return chart.sizes.map((row) => ({
    ...newRow(row.label),
    bust: String(row.bust),
    waist: String(row.waist),
    hips: String(row.hips),
    length: String(row.length),
  }));
}

interface AdminSizeChartProps {
  token: string;
  code: string;
  onUnauthorized: () => void;
}

export const AdminSizeChart: React.FC<AdminSizeChartProps> = ({ token, code, onUnauthorized }) => {
  const [loadedCode, setLoadedCode] = useState<string | null>(null);
  const [hadChart, setHadChart] = useState(false);
  const [fit, setFit] = useState<FitType>('regular');
  const [rows, setRows] = useState<DraftRow[]>(emptyRows());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const load = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/codes/size-chart?code=${encodeURIComponent(trimmed)}`, {
        credentials: 'same-origin',
        headers: adminAuthHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Таблицата не можа да се зареди.');
      }
      const chart = data.sizeChart && typeof data.sizeChart === 'object' ? (data.sizeChart as SizeChart) : null;
      setLoadedCode(String(data.code || trimmed).toLowerCase());
      setHadChart(Boolean(chart));
      if (chart) {
        setFit(chart.fit === 'fitted' || chart.fit === 'loose' ? chart.fit : 'regular');
        setRows(chartToRows(chart));
        setNotice(`Заредена е таблица за код ${data.code}.`);
      } else {
        setFit('regular');
        setRows(emptyRows());
        setNotice(`Код ${data.code} няма таблица. Попълнете редовете и запишете.`);
      }
    } catch (err: any) {
      setError(err.message || 'Грешка при зареждане на таблицата.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (chart: SizeChart | null) => {
    if (!loadedCode) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/codes/size-chart', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...adminAuthHeaders(token),
        },
        body: JSON.stringify({ code: loadedCode, sizeChart: chart }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Таблицата не можа да се запише.');
      }
      setHadChart(Boolean(data.sizeChart));
      if (!data.sizeChart) {
        setFit('regular');
        setRows(emptyRows());
        setNotice(`Таблицата за код ${loadedCode} е изчистена.`);
      } else {
        setNotice(`Таблицата за код ${loadedCode} е записана.`);
      }
    } catch (err: any) {
      setError(err.message || 'Грешка при запис на таблицата.');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const validated = validateSizeChart({
      fit,
      sizes: rows.map((row) => ({
        label: row.label,
        bust: row.bust,
        waist: row.waist,
        hips: row.hips,
        length: row.length,
      })),
    });
    if (!validated.ok) {
      setError(validated.error);
      setNotice(null);
      return;
    }
    void save(validated.chart);
  };

  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <Ruler className="w-4 h-4 text-emerald-700" />
        <h2 className="text-sm font-semibold text-neutral-900">Размерна таблица</h2>
      </div>
      <p className="text-xs text-neutral-500 leading-relaxed">
        По избор, за кода от полето по-горе. Редовете са от най-малкия към най-големия размер. Дължината е от рамото до подгъва.
        Кройката добавя свобода към мерките на клиента: прилепнала {EASE_CM.fitted} см, стандартна {EASE_CM.regular} см, свободна {EASE_CM.loose} см.
      </p>
      <div>
        <button
          type="button"
          disabled={busy || !code.trim()}
          onClick={() => void load()}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 disabled:opacity-50 cursor-pointer"
        >
          Зареди таблица
        </button>
      </div>

      {loadedCode && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-600">
            Таблица за код <span className="font-semibold text-neutral-900">{loadedCode}</span>
            {code.trim().toLowerCase() !== loadedCode ? ' — заредете отново, ако сте сменили кода.' : ''}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {FIT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFit(option.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                  fit === option.id
                    ? 'bg-neutral-900 border-neutral-900 text-white'
                    : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs border-collapse">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="font-medium py-1.5 pr-2">Размер</th>
                  <th className="font-medium py-1.5 pr-2">Бюст (см)</th>
                  <th className="font-medium py-1.5 pr-2">Талия (см)</th>
                  <th className="font-medium py-1.5 pr-2">Ханш (см)</th>
                  <th className="font-medium py-1.5 pr-2">Дължина (см)</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-100">
                    {(['label', 'bust', 'waist', 'hips', 'length'] as const).map((field) => (
                      <td key={field} className="py-1.5 pr-2">
                        <input
                          type="text"
                          inputMode={field === 'label' ? 'text' : 'decimal'}
                          value={row[field]}
                          onChange={(event) => updateRow(row.id, { [field]: event.target.value })}
                          className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-sm text-neutral-900 focus:outline-none focus:border-emerald-600"
                        />
                      </td>
                    ))}
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                        className="text-xs text-neutral-500 hover:text-rose-700 cursor-pointer"
                      >
                        Премахни
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || rows.length >= 12}
              onClick={() => setRows((current) => [...current, newRow()])}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 disabled:opacity-50 cursor-pointer"
            >
              Добави ред
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
            >
              Запази таблицата
            </button>
            {hadChart && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(null)}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 disabled:opacity-50 cursor-pointer"
              >
                Изчисти таблицата
              </button>
            )}
          </div>
        </div>
      )}

      {notice && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>
      )}
      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </section>
  );
};
