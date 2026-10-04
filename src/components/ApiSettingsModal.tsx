import React, { useState } from 'react';
import { Sliders, X, Cpu, Check, ShieldCheck } from 'lucide-react';
import { getStoredSimulateMode, setStoredSimulateMode } from '../lib/api';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasServerToken: boolean;
  onSettingsSaved: () => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [simulateMode, setSimulateMode] = useState(getStoredSimulateMode());
  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setStoredSimulateMode(simulateMode);
    setSavedNotice(true);
    onSettingsSaved();
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-6 shadow-xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Studio Settings</h3>
              <p className="text-xs text-neutral-500">Execution options & engine status</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 p-1 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Engine Status */}
        <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-950">Synthesis Engine Connected</p>
            <p className="text-emerald-700 text-[11px] mt-0.5">The backend generation service is active and ready.</p>
          </div>
        </div>

        {/* Simulation Mode Toggle */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900">
                <Cpu className="w-3.5 h-3.5 text-neutral-600" />
                <span>Demo Simulation Mode</span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                When enabled, tasks simulate lookbook synthesis without live cloud calls.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSimulateMode(!simulateMode)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                simulateMode ? 'bg-emerald-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                  simulateMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-md transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {savedNotice ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
