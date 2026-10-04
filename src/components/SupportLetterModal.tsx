import React, { useState, useId } from 'react';
import {
  X,
  FileText,
  Building2,
  Globe,
  User,
  Briefcase,
  Mail,
  CheckCircle2,
  Download,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { SupportLetterData, SupportLetterResponse } from '../types';
import { submitSupportLetter } from '../lib/api';

interface SupportLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessCode?: string;
  lastImageUrl?: string;
}

const NEED_OPTIONS = [
  'Клиентите не могат да си представят как дрехата ще им стои',
  'Връщания заради размер, кройка или разлика спрямо снимката',
  'Много цветове и размери на един модел',
  'По-висока конверсия в онлайн магазина',
];

export const SupportLetterModal: React.FC<SupportLetterModalProps> = ({
  isOpen,
  onClose,
  accessCode,
  lastImageUrl,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [uic, setUic] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>([]);
  const [motivation, setMotivation] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SupportLetterResponse | null>(null);

  const consentCheckboxId = useId();

  if (!isOpen) return null;

  // Validation
  const cleanUic = uic.trim().replace(/\s+/g, '');
  const isUicValid = /^\d{9}(\d{4})?$/.test(cleanUic);
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isFormValid =
    companyName.trim().length > 0 &&
    isUicValid &&
    website.trim().length > 0 &&
    contactName.trim().length > 0 &&
    role.trim().length > 0 &&
    isEmailValid &&
    consentAccepted;

  const toggleNeed = (need: string) => {
    setSelectedNeeds((prev) =>
      prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload: SupportLetterData = {
        companyName: companyName.trim(),
        uic: cleanUic,
        website: website.trim(),
        contactName: contactName.trim(),
        role: role.trim(),
        email: email.trim().toLowerCase(),
        needs: selectedNeeds,
        motivation: motivation.trim() || undefined,
        consentAccepted: true,
        accessCode: accessCode || undefined,
        lastImageUrl: lastImageUrl || undefined,
      };

      const response = await submitSupportLetter(payload);
      setResult(response);
    } catch (err: any) {
      setSubmitError(err.message || 'Възникна грешка при изпращането. Моля, опитайте отново.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setResult(null);
    setSubmitError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 tracking-tight">
                Писмо за подкрепа (необвързващо)
              </h3>
              <p className="text-[11px] text-neutral-500">
                За безплатен пилотен проект за дигитална модна проба (1–3 месеца, 10–20 модела)
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors cursor-pointer"
            title="Затвори"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {result ? (
            /* Thank You Screen */
            <div className="text-center py-6 space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <h4 className="text-lg font-bold text-neutral-900">
                  Благодарим! Ще се свържем с Вас до 2 работни дни.
                </h4>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Вашето писмо за подкрепа е регистрирано успешно. Копие от двуезичния официален PDF документ (BG/EN) беше изпратено на Вашия имейл (<strong>{email}</strong>) и към екипа на Style Lab.
                </p>
              </div>

              {/* Reference Badge */}
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg max-w-sm mx-auto flex items-center justify-between">
                <span className="text-neutral-500 text-xs">Референтен номер:</span>
                <span className="font-bold text-emerald-800 text-xs">
                  {result.refNumber}
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <a
                  href={result.pdfDownloadUrl}
                  download={`Letter-of-Intent-${result.refNumber}.pdf`}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Свали PDF</span>
                </a>
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Затвори
                </button>
              </div>
            </div>
          ) : (
            /* Submission Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Info Banner */}
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 flex items-start gap-2.5 text-neutral-700 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  Този формуляр генерира официално <strong>двуезично писмо за подкрепа (BG / EN)</strong>. То е напълно <strong>необвързващо</strong> – не създава никакви финансови или правни задължения за покупка.
                </span>
              </div>

              {/* Company & Legal Info */}
              <div className="space-y-3">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  Данни за магазина и компанията
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Фирма <span className="text-emerald-700">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="напр. Стил БГ ООД"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full bg-white border border-neutral-300 focus:border-emerald-600 rounded-md px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors shadow-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      ЕИК <span className="text-emerald-700">*</span>{' '}
                      <span className="text-[10px] text-neutral-400 font-normal">
                        (9 или 13 цифри)
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="123456789"
                      value={uic}
                      onChange={(e) => setUic(e.target.value)}
                      className={`w-full bg-white border rounded-md px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors shadow-xs ${
                        uic && !isUicValid
                          ? 'border-rose-400 focus:border-rose-600'
                          : 'border-neutral-300 focus:border-emerald-600'
                      }`}
                    />
                    {uic && !isUicValid && (
                      <p className="text-[10px] text-rose-600 mt-1">
                        ЕИК трябва да съдържа точно 9 или 13 цифри.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Уебсайт <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="https://myshop.bg или myshop.bg"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full bg-white border border-neutral-300 focus:border-emerald-600 rounded-md px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors shadow-xs"
                  />
                </div>
              </div>

              {/* Contact Person */}
              <div className="space-y-3 pt-1">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  Лице за контакт
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Вашето име <span className="text-emerald-700">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Иван Иванов"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full bg-white border border-neutral-300 focus:border-emerald-600 rounded-md px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Длъжност <span className="text-emerald-700">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Управител / Е-commerce мениджър"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full bg-white border border-neutral-300 focus:border-emerald-600 rounded-md px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors shadow-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Имейл <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="contact@myshop.bg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full bg-white border rounded-md px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors shadow-xs ${
                      email && !isEmailValid
                        ? 'border-rose-400 focus:border-rose-600'
                        : 'border-neutral-300 focus:border-emerald-600'
                    }`}
                  />
                  {email && !isEmailValid && (
                    <p className="text-[10px] text-rose-600 mt-1">
                      Моля, въведете коректен формат на имейл адрес.
                    </p>
                  )}
                </div>
              </div>

              {/* Needs Checkboxes */}
              <div className="space-y-2 pt-1">
                <label className="block text-neutral-700 font-medium">
                  Кои потребности са актуални за Вас?{' '}
                  <span className="text-neutral-400 font-normal">(по избор)</span>
                </label>
                <div className="space-y-2">
                  {NEED_OPTIONS.map((need) => {
                    const isChecked = selectedNeeds.includes(need);
                    return (
                      <button
                        type="button"
                        key={need}
                        onClick={() => toggleNeed(need)}
                        className={`w-full text-left px-3.5 py-2.5 rounded-lg border flex items-center gap-2.5 transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                            : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-neutral-300 bg-white'
                          }`}
                        >
                          {isChecked && <span className="text-[10px] font-bold">✓</span>}
                        </div>
                        <span className="text-xs">{need}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Motivation */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-neutral-700 font-medium">
                  Защо Ви е интересно{' '}
                  <span className="text-neutral-400 font-normal">(по избор)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Споделете накратко какви резултати или впечатления очаквате от виртуалната проба..."
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  className="w-full bg-white border border-neutral-300 focus:border-emerald-600 rounded-md px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-colors resize-none leading-relaxed shadow-xs"
                />
              </div>

              {/* Required Consent Checkbox */}
              <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200">
                <label
                  htmlFor={consentCheckboxId}
                  className="flex items-start gap-2.5 cursor-pointer select-none"
                >
                  <input
                    id={consentCheckboxId}
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-neutral-700 leading-relaxed">
                    <strong>Потвърждавам</strong>, че подкрепям безплатен пилот на дигиталната модна проба в нашия уебшоп и съгласен/на съм това писмо да бъде използвано като доказателство за интерес в кандидатури за финансиране (напр. EIT Culture & Creativity). Писмото е необвързващо – не създава задължения за покупка или плащане. <span className="text-emerald-700 font-bold">*</span>
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!isFormValid || submitting}
                  className="w-full py-3 px-6 rounded-lg font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 text-white disabled:text-neutral-400 shadow-xs disabled:shadow-none cursor-pointer disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Генериране на PDF и изпращане...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>Изпрати</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
