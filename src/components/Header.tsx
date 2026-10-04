import React from 'react';

interface HeaderProps {
  activeTab: 'generate' | 'gallery';
  setActiveTab: (tab: 'generate' | 'gallery') => void;
  isSimulating?: boolean;
  historyCount: number;
  onOpenSettings?: () => void;
  onOpenAdmin?: () => void;
  hasValidCode?: boolean;
  accessCode?: string;
  remainingGenerations?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  historyCount,
  onOpenAdmin,
  hasValidCode,
  remainingGenerations = 0,
}) => {
  return (
    <header className="border-b border-neutral-200 bg-white/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Simple Brand Text Logo */}
        <div className="flex items-center gap-3">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('generate');
            }}
            className="flex flex-col group select-none"
          >
            <span className="text-base sm:text-lg font-semibold tracking-[-0.02em] text-neutral-900 group-hover:text-emerald-700 transition-colors uppercase">
              Martitony Style Lab
            </span>
          </a>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'generate'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            Студио
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <span>Галерия</span>
            {historyCount > 0 && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded ${
                  activeTab === 'gallery'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                {historyCount}
              </span>
            )}
          </button>

          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 cursor-pointer"
            >
              Админ
            </button>
          )}
        </nav>

        {/* Code badge in plain text, no dot */}
        <div className="flex items-center gap-3">
          {hasValidCode ? (
            <span className="text-xs text-neutral-600">
              Остават {remainingGenerations} {remainingGenerations === 1 ? 'проба' : 'проби'}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">
              Само с покана
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
