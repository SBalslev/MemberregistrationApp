/**
 * Year Settings Dialog for fiscal year configuration.
 * Allows setting opening balances and closing years.
 */

import { useState, useEffect } from 'react';
import { X, Calendar, Lock, Unlock, Plus, ArrowUpFromLine } from 'lucide-react';
import type { FiscalYear, RunningBalances } from '../../types';

interface YearSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fiscalYear: FiscalYear) => void;
  onCreateYear: (year: number) => void;
  fiscalYear: FiscalYear | null;
  existingYears: number[];
  previousYearClosing?: RunningBalances;
}

export function YearSettingsDialog({
  isOpen,
  onClose,
  onSave,
  onCreateYear,
  fiscalYear,
  existingYears,
  previousYearClosing,
}: YearSettingsDialogProps) {
  const [openingCash, setOpeningCash] = useState(0);
  const [openingBank, setOpeningBank] = useState(0);
  const [isClosed, setIsClosed] = useState(false);
  const [newYear, setNewYear] = useState<number | null>(null);
  const [showCreateYear, setShowCreateYear] = useState(false);

  // Initialize form when dialog opens or fiscal year changes
  useEffect(() => {
    if (fiscalYear) {
      setOpeningCash(fiscalYear.openingCashBalance);
      setOpeningBank(fiscalYear.openingBankBalance);
      setIsClosed(fiscalYear.isClosed);
    }
    setShowCreateYear(false);
    setNewYear(null);
  }, [fiscalYear, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!fiscalYear) return;

    onSave({
      ...fiscalYear,
      openingCashBalance: openingCash,
      openingBankBalance: openingBank,
      isClosed,
      updatedAtUtc: new Date().toISOString(),
    });
    onClose();
  };

  const handleCreateYear = () => {
    if (newYear && !existingYears.includes(newYear)) {
      onCreateYear(newYear);
      setShowCreateYear(false);
      setNewYear(null);
    }
  };

  // Generate suggested years (current year and next year if not existing)
  const currentYear = new Date().getFullYear();
  const suggestedYears = [currentYear, currentYear + 1].filter(
    (y) => !existingYears.includes(y)
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                {fiscalYear ? `Regnskabsår ${fiscalYear.year}` : 'Årsindstillinger'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-6">
            {fiscalYear && (
              <>
                {/* Opening Balances */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-700">Primosaldi</h3>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Kasse (primo)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={openingCash}
                        onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)}
                        disabled={isClosed}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                        DKK
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Bank (primo)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={openingBank}
                        onChange={(e) => setOpeningBank(parseFloat(e.target.value) || 0)}
                        disabled={isClosed}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                        DKK
                      </span>
                    </div>
                  </div>

                  {/* Copy from Previous Year button */}
                  {previousYearClosing && !isClosed && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpeningCash(previousYearClosing.cash);
                        setOpeningBank(previousYearClosing.bank);
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <ArrowUpFromLine className="w-4 h-4" />
                      Kopier fra {fiscalYear.year - 1} (Kasse: {previousYearClosing.cash.toFixed(2)}, Bank: {previousYearClosing.bank.toFixed(2)})
                    </button>
                  )}
                </div>

                {/* Year Status */}
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Status</h3>
                  
                  <button
                    type="button"
                    onClick={() => setIsClosed(!isClosed)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isClosed
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-green-50 border-green-200 text-green-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isClosed ? (
                        <Lock className="w-5 h-5" />
                      ) : (
                        <Unlock className="w-5 h-5" />
                      )}
                      <span className="font-medium">
                        {isClosed ? 'Lukket for redigering' : 'Åben for redigering'}
                      </span>
                    </div>
                    <span className="text-sm">
                      {isClosed ? 'Klik for at åbne' : 'Klik for at lukke'}
                    </span>
                  </button>

                  {isClosed && (
                    <p className="mt-2 text-xs text-gray-500">
                      Et lukket år kan ikke redigeres. Transaktioner kan ikke tilføjes, ændres eller slettes.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Create New Year Section */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Opret nyt regnskabsår</h3>
              
              {showCreateYear ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="2020"
                    max="2099"
                    value={newYear || ''}
                    onChange={(e) => setNewYear(parseInt(e.target.value) || null)}
                    placeholder="Indtast år"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleCreateYear}
                    disabled={!newYear || existingYears.includes(newYear)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Opret
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateYear(false);
                      setNewYear(null);
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Annuller
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {suggestedYears.map((year) => (
                    <button
                      key={year}
                      type="button"
                      onClick={() => onCreateYear(year)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      {year}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCreateYear(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Andet år...
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          {fiscalYear && (
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Gem indstillinger
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
