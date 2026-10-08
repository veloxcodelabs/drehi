import React, { useState } from 'react';
import { Search, Trash2, ArrowUpRight, Download, Image as ImageIcon, Clock } from 'lucide-react';
import { GenerationTask } from '../types';
import { getProxyImageUrl } from '../lib/api';
import { isTaskOutputExpired } from '../lib/tryonStorage';

interface GalleryHistoryProps {
  tasks: GenerationTask[];
  onSelectTask: (task: GenerationTask) => void;
  onDeleteTask: (id: string) => void;
  onClearAll: () => void;
  onReusePrompt?: (prompt: string) => void;
  onImportTask?: (taskId: string) => Promise<{ success: boolean; error?: string }>;
}

export const GalleryHistory: React.FC<GalleryHistoryProps> = ({
  tasks,
  onSelectTask,
  onDeleteTask,
  onClearAll,
}) => {
  const [search, setSearch] = useState('');

  const filteredTasks = tasks.filter((t) =>
    (t.prompt || '').toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Галерия на визиите</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Всички генерирани модни снимки за Вашия бутик.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Търси..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border border-neutral-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 shadow-xs w-44 sm:w-56"
            />
          </div>

          {tasks.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="px-3 py-1.5 text-xs text-neutral-600 hover:text-rose-600 bg-white border border-neutral-200 hover:border-neutral-300 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Изчисти</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid or Empty */}
      {filteredTasks.length === 0 ? (
        <div className="py-16 text-center rounded-xl border border-neutral-200 bg-white shadow-xs">
          <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400 mx-auto mb-3">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-800">Все още няма запазени визии</h3>
          <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto">
            {search ? 'Няма съвпадения за това търсене.' : 'Качете дреха в секция Студио и генерирайте първата си модна снимка.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTasks.map((task) => {
            const output = task.outputUrls?.[0];
            const proxy = output ? getProxyImageUrl(output) : '';
            const downloadUrl = output ? getProxyImageUrl(output, true) : '';

            return (
              <div
                key={task.id}
                className="group relative rounded-xl border border-neutral-200 bg-white overflow-hidden flex flex-col hover:border-neutral-300 transition-all shadow-xs hover:shadow-md"
              >
                {/* Image Container */}
                <div
                  className="aspect-[3/4] relative bg-neutral-100 overflow-hidden cursor-pointer"
                  onClick={() => onSelectTask(task)}
                >
                  {output && !isTaskOutputExpired(task) ? (
                    <img
                      src={proxy || output}
                      alt="Модна визия"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : output && isTaskOutputExpired(task) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-neutral-100 text-neutral-400 text-xs">
                      <Clock className="w-6 h-6 mb-1 text-neutral-300" />
                      <span className="font-medium text-neutral-600">Прегледът е изтекъл</span>
                      <span className="text-[10px] text-neutral-400 mt-0.5">Временната сесия е архивирана</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
                      Няма налично изображение
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-neutral-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTask(task);
                      }}
                      className="p-2 bg-white/95 text-neutral-800 rounded-lg hover:bg-white transition-colors shadow-xs cursor-pointer"
                      title="Преглед в студиото"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                    {output && !isTaskOutputExpired(task) && (
                      <a
                        href={downloadUrl}
                        download="martitony-style-lab.png"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 bg-white/95 text-neutral-800 rounded-lg hover:bg-white transition-colors shadow-xs cursor-pointer"
                        title="Свали изображението"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTask(task.id);
                      }}
                      className="p-2 bg-white/95 text-rose-600 rounded-lg hover:bg-white transition-colors shadow-xs cursor-pointer"
                      title="Изтрий"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* AI disclaimer directly under every generated result image */}
                {output && !isTaskOutputExpired(task) && (
                  <div className="px-3 py-2 bg-neutral-50/80 border-t border-neutral-100">
                    <p className="text-[12px] text-neutral-500 text-center leading-snug">
                      Визуализация с AI – ориентировъчна. За точен размер вижте таблицата с мерки.
                    </p>
                  </div>
                )}

                {/* Details Footer */}
                <div className="p-3 flex items-center justify-between text-xs text-neutral-500 border-t border-neutral-100">
                  <span className="font-medium text-neutral-800">
                    {task.aspectRatio || '3:4'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectTask(task)}
                    className="text-emerald-700 hover:text-emerald-800 font-medium cursor-pointer"
                  >
                    Отвори
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
