/**
 * Consolidate Fee Payments Dialog.
 * Allows selecting pending fee payments and consolidating them into a single transaction.
 */

import { useState, useMemo } from 'react';
import { X, Check, FileStack, Trash2, Calendar } from 'lucide-react';
import type { PendingFeePaymentWithMember, PostingCategory } from '../../types';
import { PAYMENT_METHOD_LABELS } from '../../types';

interface ConsolidateFeePaymentsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConsolidate: (paymentIds: string[], description: string, date: string, categoryId: string) => void;
  onDelete?: (paymentId: string) => void | Promise<void>;
  onMarkPaidExternally?: (paymentId: string, paidInYear: number) => void | Promise<void>;
  pendingPayments: PendingFeePaymentWithMember[];
  categories: PostingCategory[];
  year: number;
}

/**
 * Format amount as Danish currency.
 */
function formatAmount(amount: number): string {
  return amount.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' kr';
}

/**
 * Format date as Danish format.
 */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

export function ConsolidateFeePaymentsDialog({
  isOpen,
  onClose,
  onConsolidate,
  onDelete,
  onMarkPaidExternally,
  pendingPayments,
  categories,
  year,
}: ConsolidateFeePaymentsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState(`Kontingent ${year}`);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState('');

  // State for "mark paid externally" mini-dialog
  const [externalPaymentId, setExternalPaymentId] = useState<string | null>(null);
  const [externalYear, setExternalYear] = useState<number>(year - 1);

  // Find the member fee category as default
  const feesCategory = categories.find(c => c.id === 'cat-kontingent');

  // Generate year options (current year and 5 years back)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let i = 0; i <= 5; i++) {
      years.push(year - i);
    }
    return years;
  }, [year]);

  const sortedPendingPayments = useMemo(
    () => [...pendingPayments].sort((a, b) => a.memberName.localeCompare(b.memberName, 'da')),
    [pendingPayments]
  );

  // Reset form when dialog opens
  useState(() => {
    if (isOpen) {
      setSelectedIds(new Set(pendingPayments.map(p => p.id)));
      setDescription(`Kontingent ${year}`);
      setDate(new Date().toISOString().split('T')[0]);
      setCategoryId(feesCategory?.id ?? categories[0]?.id ?? '');
      setExternalPaymentId(null);
      setExternalYear(year - 1);
    }
  });

  // Calculate totals
  const totals = useMemo(() => {
    const selected = pendingPayments.filter(p => selectedIds.has(p.id));
    const cash = selected.filter(p => p.paymentMethod === 'CASH').reduce((sum, p) => sum + p.amount, 0);
    const bank = selected.filter(p => p.paymentMethod === 'BANK').reduce((sum, p) => sum + p.amount, 0);
    return { cash, bank, total: cash + bank, count: selected.length };
  }, [pendingPayments, selectedIds]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === pendingPayments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingPayments.map(p => p.id)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0 || !categoryId) return;

    onConsolidate(Array.from(selectedIds), description, date, categoryId);
    onClose();
  };

  // Open the "mark paid externally" mini-dialog
  const handleOpenExternalDialog = (paymentId: string) => {
    setExternalPaymentId(paymentId);
    setExternalYear(year - 1);
  };

  // Confirm marking as paid externally
  const handleConfirmExternal = () => {
    if (externalPaymentId && onMarkPaidExternally) {
      onMarkPaidExternally(externalPaymentId, externalYear);
      setExternalPaymentId(null);
    }
  };

  // Get the payment being marked as external (for display)
  const externalPayment = externalPaymentId
    ? pendingPayments.find(p => p.id === externalPaymentId)
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileStack className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Konsolider kontingentbetalinger
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
          <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
            {/* Transaction Details */}
            <div className="p-4 border-b border-gray-200 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beskrivelse
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transaktionsdato
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategori
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Vælg kategori...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pending Payments List */}
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Afventende betalinger ({pendingPayments.length})
                </h3>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {selectedIds.size === pendingPayments.length ? 'Fravælg alle' : 'Vælg alle'}
                </button>
              </div>

              {pendingPayments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Ingen afventende betalinger at konsolidere</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedPendingPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        selectedIds.has(payment.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <label className="flex items-center gap-3 flex-1 cursor-pointer">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                          selectedIds.has(payment.id)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-300'
                        }`}>
                          {selectedIds.has(payment.id) && <Check className="w-3 h-3" />}
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(payment.id)}
                          onChange={() => handleToggle(payment.id)}
                          className="sr-only"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {payment.memberName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatDate(payment.paymentDate)} · {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                            {payment.notes && ` · ${payment.notes}`}
                          </p>
                        </div>
                        <div className={`font-medium ${
                          payment.paymentMethod === 'CASH' ? 'text-green-600' : 'text-blue-600'
                        }`}>
                          {formatAmount(payment.amount)}
                        </div>
                      </label>
                      <div className="flex items-center gap-1">
                        {onMarkPaidExternally && (
                          <button
                            type="button"
                            onClick={() => handleOpenExternalDialog(payment.id)}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                            title="Marker som betalt i andet år"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(payment.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Slet betaling"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary and Actions */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{totals.count}</span> betalinger valgt
                </div>
                <div className="flex gap-4 text-sm">
                  {totals.cash > 0 && (
                    <span className="text-green-600">
                      Kontant: <span className="font-medium">{formatAmount(totals.cash)}</span>
                    </span>
                  )}
                  {totals.bank > 0 && (
                    <span className="text-blue-600">
                      Bank: <span className="font-medium">{formatAmount(totals.bank)}</span>
                    </span>
                  )}
                  <span className="font-medium text-gray-900">
                    Total: {formatAmount(totals.total)}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Annuller
                </button>
                <button
                  type="submit"
                  disabled={selectedIds.size === 0 || !categoryId}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Opret transaktion
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Mini-dialog for marking payment as paid in different year */}
      {externalPaymentId && externalPayment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setExternalPaymentId(null)}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Marker som betalt i andet år
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">{externalPayment.memberName}</span>
              {' - '}
              {formatAmount(externalPayment.amount)}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Betalingen vil blive markeret som betalt, men vil ikke oprette en transaktion i {year}.
              Brug dette når betalingen allerede er bogført i et tidligere år.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Betalt i år
              </label>
              <select
                value={externalYear}
                onChange={(e) => setExternalYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setExternalPaymentId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={handleConfirmExternal}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
              >
                Bekræft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
