import React, { useState, useEffect } from 'react';
import {
  FileText,
  Lock,
  ArrowLeft,
  RefreshCw,
  Search,
  ExternalLink,
  Download,
  Building2,
  Calendar,
  User,
  Mail,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  Tag,
  Hash,
} from 'lucide-react';

export interface AdminSubmission {
  id: string;
  refNumber: string;
  companyName: string;
  uic: string;
  website: string;
  contactName: string;
  role: string;
  email: string;
  needs: string[];
  motivation?: string;
  consentAccepted: boolean;
  accessCode?: string;
  timestamp: string;
  createdAt: string;
  pdfUrl: string;
  lastImageUrl?: string;
}

interface AdminDashboardProps {
  onBackToStudio: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToStudio }) => {
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem('msl_admin_token') || null;
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [codeInput, setCodeInput] = useState('test');
  const [codeNotice, setCodeNotice] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Невалидна администраторска парола');
      }

      setToken(data.token);
      sessionStorage.setItem('msl_admin_token', data.token);
      setPassword('');
      loadSubmissions(data.token);
    } catch (err: any) {
      setLoginError(err.message || 'Грешка при вход');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    sessionStorage.removeItem('msl_admin_token');
    setSubmissions([]);
  };

  const loadSubmissions = async (adminToken: string) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/submissions', {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401 || res.status === 403) {
          handleLogout();
          throw new Error('Сесията изтече. Моля, влезте отново.');
        }
        throw new Error(data.error || 'Неуспешно зареждане на писмата');
      }

      setSubmissions(data.submissions || []);
    } catch (err: any) {
      setFetchError(err.message || 'Грешка при извличане на данните');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCode = async (path: string, body: Record<string, unknown>, adminToken: string) => {
    setCodeBusy(true);
    setCodeError(null);
    setCodeNotice(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Операцията не успя.');
      }
      setCodeNotice(
        `Код ${data.code}: остават ${data.remaining} проби (използвани ${data.used} от ${data.totalAllowed}).`
      );
    } catch (err: any) {
      setCodeError(err.message || 'Грешка при промяна на кода.');
    } finally {
      setCodeBusy(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadSubmissions(token);
    }
  }, []);

  const filtered = submissions.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.companyName?.toLowerCase().includes(q) ||
      s.uic?.toLowerCase().includes(q) ||
      s.contactName?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.refNumber?.toLowerCase().includes(q) ||
      s.website?.toLowerCase().includes(q) ||
      s.accessCode?.toLowerCase().includes(q)
    );
  });

  // Render Login Screen if not authenticated
  if (!token) {
    return (
      <div className="min-h-screen bg-[#FBFBFA] flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-8 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={onBackToStudio}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Към студиото</span>
            </button>
            <span className="text-[10px] tracking-widest text-neutral-400 uppercase">
              Martitony Style Lab
            </span>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Вход за администратори</h2>
              <p className="text-xs text-neutral-500">Писма за намерение (LOI Submissions)</p>
            </div>
          </div>

          {loginError && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Администраторска парола
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Въведете парола..."
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-emerald-600 transition-colors pr-10 shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || !password.trim()}
              className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Проверка...</span>
                </>
              ) : (
                <span>Влез в таблото</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Admin Dashboard
  return (
    <div className="min-h-screen bg-[#FBFBFA] text-neutral-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToStudio}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white hover:bg-neutral-50 border border-neutral-200 text-xs font-medium text-neutral-700 hover:text-neutral-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Към студиото</span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight leading-none flex items-center gap-2">
                <span>Писма за намерение (LOI)</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {submissions.length} общо
                </span>
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadSubmissions(token)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 transition-colors cursor-pointer"
            title="Презареди списъка"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">Обнови</span>
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Изход</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <section className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-neutral-900">Проби по код</h2>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Всеки код има 3 успешни генерации. Неуспешните не се броят. Кодът <span className="font-semibold text-neutral-700">test</span> е за проверка и също е ограничен до 3 — „Нулирай пробите“ го връща в началото.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Код, напр. test"
              className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              disabled={codeBusy || !codeInput.trim()}
              onClick={() => token && updateCode('/api/admin/codes/reset', { code: codeInput.trim() }, token)}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 disabled:opacity-50 cursor-pointer"
            >
              Нулирай пробите
            </button>
            <button
              type="button"
              disabled={codeBusy || !codeInput.trim()}
              onClick={() => token && updateCode('/api/admin/codes/add-credits', { code: codeInput.trim(), credits: 3 }, token)}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
            >
              Добави 3 проби
            </button>
          </div>
          {codeNotice && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{codeNotice}</p>
          )}
          {codeError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{codeError}</p>
          )}
        </section>

        {/* Search & Statistics Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-neutral-200 rounded-xl p-3.5 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Търси по фирма, ЕИК, лице за контакт, имейл..."
              className="w-full pl-9 pr-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-4 text-xs text-neutral-500 px-1">
            <span>
              Показани: <strong className="text-neutral-900">{filtered.length}</strong> от {submissions.length}
            </span>
          </div>
        </div>

        {fetchError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{fetchError}</span>
            </div>
            <button
              onClick={() => loadSubmissions(token)}
              className="px-2.5 py-1 bg-white hover:bg-rose-100 border border-rose-200 rounded text-xs font-semibold text-rose-800 transition-colors"
            >
              Опитай отново
            </button>
          </div>
        )}

        {/* Submissions List */}
        {isLoading && submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <p className="text-sm">Зареждане на писмата за намерение от базата...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400 mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-neutral-800">
              {searchQuery ? 'Няма намерени съвпадения' : 'Все още няма подадени писма за намерение'}
            </h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              {searchQuery
                ? 'Опитайте да потърсите с друг термин (име на фирма, ЕИК или имейл).'
                : 'Когато клиент или партньор попълни формата за писмо за подкрепа, записите ще се покажат тук.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((item) => (
              <div
                key={item.id || item.refNumber}
                className="bg-white border border-neutral-200 hover:border-neutral-300 rounded-xl p-4 sm:p-5 transition-all shadow-xs space-y-4"
              >
                {/* Header Row: Ref Number, Date & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                      {item.refNumber}
                    </span>
                    <span className="text-xs text-neutral-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{item.timestamp}</span>
                    </span>
                    {item.accessCode && (
                      <span className="text-[11px] text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 flex items-center gap-1">
                        <Hash className="w-3 h-3 text-neutral-400" />
                        <span>Код: {item.accessCode}</span>
                      </span>
                    )}
                  </div>

                  {/* PDF Download Button */}
                  <a
                    href={item.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Свали PDF</span>
                  </a>
                </div>

                {/* Grid Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  {/* Company & UIC */}
                  <div className="space-y-1">
                    <span className="text-neutral-500 font-medium">Фирма & ЕИК</span>
                    <div className="font-semibold text-neutral-900 text-sm flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{item.companyName}</span>
                    </div>
                    <div className="text-neutral-500">
                      ЕИК: <span className="text-neutral-700 font-medium">{item.uic}</span>
                    </div>
                    {item.website && (
                      <a
                        href={item.website.startsWith('http') ? item.website : `https://${item.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                      >
                        <span>{item.website}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Signatory / Contact */}
                  <div className="space-y-1">
                    <span className="text-neutral-500 font-medium">Лице за контакт</span>
                    <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span>{item.contactName}</span>
                    </div>
                    <div className="text-neutral-500">{item.role}</div>
                    <a
                      href={`mailto:${item.email}`}
                      className="inline-flex items-center gap-1 text-neutral-600 hover:text-emerald-700"
                    >
                      <Mail className="w-3 h-3 text-neutral-400" />
                      <span>{item.email}</span>
                    </a>
                  </div>

                  {/* Identified Needs */}
                  <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                    <span className="text-neutral-500 font-medium">Потребности</span>
                    {item.needs && item.needs.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {item.needs.map((need, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-50 text-[11px] text-neutral-700 border border-neutral-200"
                          >
                            <span className="text-emerald-600 font-bold">✓</span>
                            <span>{need}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-neutral-400 italic">Няма маркирани потребности</div>
                    )}
                  </div>
                </div>

                {/* Motivation / Notes (if present) */}
                {item.motivation && item.motivation.trim().length > 0 && (
                  <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs space-y-1">
                    <span className="text-neutral-500 font-medium block">Защо ни е интересно:</span>
                    <p className="text-neutral-700 italic leading-relaxed whitespace-pre-wrap">
                      „{item.motivation.trim()}“
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
