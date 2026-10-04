import React, { useState } from 'react';
import { Mail, ArrowRight, ShieldAlert, KeyRound } from 'lucide-react';

interface InviteAccessGateProps {
  currentCodeInput?: string;
  errorMessage?: string | null;
  onCodeSubmit: (code: string) => void;
  isLoading?: boolean;
}

export const InviteAccessGate: React.FC<InviteAccessGateProps> = ({
  currentCodeInput = '',
  errorMessage,
  onCodeSubmit,
  isLoading = false,
}) => {
  const [inputVal, setInputVal] = useState(currentCodeInput);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      onCodeSubmit(inputVal.trim());
    }
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-4 sm:px-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 sm:p-10 shadow-xs text-center space-y-6">
        {/* Clean Icon */}
        <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 mx-auto">
          <KeyRound className="w-6 h-6" />
        </div>

        {/* Required Message */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-800 font-medium">
            <span>Достъп с покана</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight leading-snug">
            Тази проба е само с покана. Пишете ни на{' '}
            <a
              href="mailto:info@martitony.com"
              className="text-emerald-700 hover:text-emerald-800 underline underline-offset-4 transition-colors"
            >
              info@martitony.com
            </a>
          </h2>

          <p className="text-sm text-neutral-500 max-w-md mx-auto leading-relaxed">
            За да генерирате модни визуализации в Martitony Style Lab, е необходим активен код за достъп през URL адреса (?k=КОД) или въведен по-долу.
          </p>
        </div>

        {/* Error notification if tried code was invalid */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center justify-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Code Entry Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
            <input
              type="text"
              placeholder="Въведете Вашия код..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="flex-1 bg-white border border-neutral-300 focus:border-emerald-600 rounded-lg px-4 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors shadow-xs"
            />
            <button
              type="submit"
              disabled={isLoading || !inputVal.trim()}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 text-white disabled:text-neutral-400 font-medium text-sm transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <span>{isLoading ? 'Проверка...' : 'Вход'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Email Contact CTA */}
        <div className="pt-4 border-t border-neutral-100">
          <a
            href="mailto:info@martitony.com?subject=Запитване%20за%20код%20за%20достъп%20към%20Martitony%20Style%20Lab"
            className="inline-flex items-center gap-2 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 px-4 py-2 rounded-lg border border-neutral-200 transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-emerald-600" />
            <span>Пишете ни на info@martitony.com</span>
          </a>
        </div>
      </div>
    </div>
  );
};
