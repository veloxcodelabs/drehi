import React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { TaskStatus } from '../types';

interface TaskViewerProps {
  taskId: string;
  status: TaskStatus;
  elapsedSeconds: number;
  totalTime?: number;
  predictTime?: number;
  error?: string | null;
  isSimulated?: boolean;
  onRetry?: () => void;
}

export const TaskViewer: React.FC<TaskViewerProps> = ({
  status,
  elapsedSeconds,
  error,
  onRetry,
}) => {
  const getStatusDetails = () => {
    switch (status) {
      case 'starting':
        return {
          label: 'Подготовка на студиото',
          description: 'Инициализиране на модела и осветлението...',
          color: 'text-neutral-700',
          bg: 'bg-white border-neutral-200',
          icon: <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />,
        };
      case 'processing':
        return {
          label: 'Генериране на визията',
          description: 'Адаптиране на дрехата върху модела и студийна обработка...',
          color: 'text-emerald-800',
          bg: 'bg-emerald-50/60 border-emerald-200',
          icon: <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />,
        };
      case 'succeeded':
        return {
          label: 'Визията е готова',
          description: 'Снимката е генерирана успешно и е налична в пълен размер.',
          color: 'text-emerald-800',
          bg: 'bg-emerald-50 border-emerald-200',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
        };
      case 'failed':
        return {
          label: 'Неуспешна обработка',
          description: error || 'Възникна грешка при генерирането. Моля, опитайте отново.',
          color: 'text-rose-700',
          bg: 'bg-rose-50 border-rose-200',
          icon: <XCircle className="w-4 h-4 text-rose-600" />,
        };
      case 'canceled':
        return {
          label: 'Прекъсната задача',
          description: 'Задачата беше отменена.',
          color: 'text-neutral-600',
          bg: 'bg-neutral-50 border-neutral-200',
          icon: <AlertTriangle className="w-4 h-4 text-neutral-500" />,
        };
    }
  };

  const details = getStatusDetails();

  return (
    <div className={`p-4 rounded-xl border ${details.bg} transition-all space-y-2.5 shadow-xs`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {details.icon}
          <span className={`text-xs font-semibold ${details.color}`}>{details.label}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          <span>{elapsedSeconds} сек.</span>
        </div>
      </div>

      <p className="text-xs text-neutral-600 leading-relaxed">{details.description}</p>

      {/* Progress bar during generation */}
      {(status === 'starting' || status === 'processing') && (
        <div className="w-full bg-neutral-200 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              status === 'starting'
                ? 'w-1/3 bg-neutral-400 animate-pulse'
                : 'w-4/5 bg-emerald-500 animate-pulse'
            }`}
          />
        </div>
      )}

      {status === 'failed' && onRetry && (
        <div className="pt-1 flex items-center justify-end">
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Опитай отново
          </button>
        </div>
      )}
    </div>
  );
};
