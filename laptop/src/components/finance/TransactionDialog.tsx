/**
 * Transaction Dialog Component.
 * Modal dialog for creating and editing financial transactions.
 *
 * @see [prd.md] - Financial Transactions Management
 */

import { useState, useRef, useMemo } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import type { Member } from '../../types/entities';
import type {
  PostingCategory,
  TransactionFormData,
  TransactionLineFormData,
  PendingFeePaymentWithMember,
} from '../../types/finance';
import { PAYMENT_METHOD_LABELS } from '../../types/finance';
import { useDialogKeyboard } from '../../hooks';

// ===== Props Interface =====

export interface TransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TransactionFormData, consolidatePaymentIds?: string[]) => void;
  categories: PostingCategory[];
  members: Member[];
  initialData?: TransactionFormData;
  fiscalYear: number;
  pendingPayments?: PendingFeePaymentWithMember[];
}

// ===== Validation Errors Interface =====

interface ValidationErrors {
  date?: string;
  description?: string;
  amounts?: string;
  lines?: string;
  lineErrors?: Record<number, { categoryId?: string; amount?: string }>;
  lineBalance?: string;
}

// ===== Helper Functions =====

/**
 * Create an empty transaction line with a new UUID.
 */
function createEmptyLine(): TransactionLineFormData {
  return {
    id: crypto.randomUUID(),
    categoryId: '',
    amount: 0,
    isIncome: true,
    source: 'CASH',
    memberId: null,
    lineDescription: null,
  };
}

/**
 * Create empty form data for a new transaction.
 */
function createEmptyFormData(): TransactionFormData {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().split('T')[0],
    description: '',
    cashIn: null,
    cashOut: null,
    bankIn: null,
    bankOut: null,
    notes: null,
    lines: [createEmptyLine()],
  };
}

/**
 * Validate the transaction form data.
 */
function validateForm(data: TransactionFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  // Date required
  if (!data.date) {
    errors.date = 'Dato er påkrævet';
  }

  // Description required (min 3 chars)
  if (!data.description || data.description.trim().length < 3) {
    errors.description = 'Beskrivelse skal være mindst 3 tegn';
  }

  // At least one cash/bank amount must be filled
  const hasAmount =
    (data.cashIn !== null && data.cashIn > 0) ||
    (data.cashOut !== null && data.cashOut > 0) ||
    (data.bankIn !== null && data.bankIn > 0) ||
    (data.bankOut !== null && data.bankOut > 0);

  if (!hasAmount) {
    errors.amounts = 'Mindst ét beløb (kasse eller bank) er påkrævet';
  }

  // At least one line required
  if (!data.lines || data.lines.length === 0) {
    errors.lines = 'Mindst én posteringslinje er påkrævet';
  }

  // Validate each line
  const lineErrors: Record<number, { categoryId?: string; amount?: string }> = {};
  data.lines?.forEach((line, index) => {
    const lineError: { categoryId?: string; amount?: string } = {};

    if (!line.categoryId) {
      lineError.categoryId = 'Kategori er påkrævet';
    }

    if (line.amount <= 0) {
      lineError.amount = 'Beløb skal være større end 0';
    }

    if (Object.keys(lineError).length > 0) {
      lineErrors[index] = lineError;
    }
  });

  if (Object.keys(lineErrors).length > 0) {
    errors.lineErrors = lineErrors;
  }

  // Validate that line totals match header totals for all four combinations
  const cashIn = data.cashIn ?? 0;
  const cashOut = data.cashOut ?? 0;
  const bankIn = data.bankIn ?? 0;
  const bankOut = data.bankOut ?? 0;

  const lineCashIncome = data.lines
    ?.filter((line) => line.isIncome && line.source === 'CASH')
    .reduce((sum, line) => sum + line.amount, 0) ?? 0;
  const lineCashExpense = data.lines
    ?.filter((line) => !line.isIncome && line.source === 'CASH')
    .reduce((sum, line) => sum + line.amount, 0) ?? 0;
  const lineBankIncome = data.lines
    ?.filter((line) => line.isIncome && line.source === 'BANK')
    .reduce((sum, line) => sum + line.amount, 0) ?? 0;
  const lineBankExpense = data.lines
    ?.filter((line) => !line.isIncome && line.source === 'BANK')
    .reduce((sum, line) => sum + line.amount, 0) ?? 0;

  // Use small epsilon for floating point comparison
  const epsilon = 0.001;
  const parts: string[] = [];

  if (Math.abs(lineCashIncome - cashIn) > epsilon) {
    parts.push(`Kasse ind: ${lineCashIncome.toFixed(2)} ≠ ${cashIn.toFixed(2)} kr`);
  }
  if (Math.abs(lineCashExpense - cashOut) > epsilon) {
    parts.push(`Kasse ud: ${lineCashExpense.toFixed(2)} ≠ ${cashOut.toFixed(2)} kr`);
  }
  if (Math.abs(lineBankIncome - bankIn) > epsilon) {
    parts.push(`Bank ind: ${lineBankIncome.toFixed(2)} ≠ ${bankIn.toFixed(2)} kr`);
  }
  if (Math.abs(lineBankExpense - bankOut) > epsilon) {
    parts.push(`Bank ud: ${lineBankExpense.toFixed(2)} ≠ ${bankOut.toFixed(2)} kr`);
  }

  if (parts.length > 0) {
    errors.lineBalance = parts.join('. ');
  }

  return errors;
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
 * Format date as Danish format (dd-mm-yyyy).
 */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

// ===== Component =====

export function TransactionDialog({
  isOpen,
  onClose,
  onSave,
  categories,
  members,
  initialData,
  fiscalYear,
  pendingPayments = [],
}: TransactionDialogProps) {
  // Form state
  const [formData, setFormData] = useState<TransactionFormData>(
    initialData ?? createEmptyFormData()
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState(false);
  // Track which individual fields have been touched for inline validation
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  // Track previous isOpen to detect dialog opening
  const [wasOpen, setWasOpen] = useState(false);

  // Pending payments import state
  const [importSectionExpanded, setImportSectionExpanded] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [importedPaymentIds, setImportedPaymentIds] = useState<Set<string>>(new Set());

  // Ref to form for programmatic submit
  const formRef = useRef<HTMLFormElement>(null);

  // Keyboard shortcuts: Escape to close, Ctrl+S to save
  useDialogKeyboard(isOpen, onClose, () => {
    formRef.current?.requestSubmit();
  });

  // Filter out already imported payments from the available list
  const availablePayments = useMemo(() =>
    pendingPayments
      .filter(p => !importedPaymentIds.has(p.id))
      .sort((a, b) => a.memberName.localeCompare(b.memberName, 'da')),
    [pendingPayments, importedPaymentIds]
  );

  // Reset form when dialog opens
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setFormData(initialData ?? createEmptyFormData());
    setErrors({});
    setTouched(false);
    setTouchedFields(new Set());
    setImportSectionExpanded(false);
    setSelectedPaymentIds(new Set());
    setImportedPaymentIds(new Set());
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  // ===== Event Handlers =====

  // Mark a field as touched (for inline validation on blur)
  function markFieldTouched(field: string) {
    setTouchedFields((prev) => new Set(prev).add(field));
  }

  // Check if a field should show its error
  function shouldShowError(field: string): boolean {
    return touched || touchedFields.has(field);
  }

  function handleFieldChange<K extends keyof TransactionFormData>(
    field: K,
    value: TransactionFormData[K]
  ) {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    // Validate on change for immediate feedback
    setErrors(validateForm(newFormData));
  }

  // Sync description to first line on blur (when leaving the field)
  function handleDescriptionBlur() {
    if (initialData?.id) return; // Don't sync when editing existing transaction

    setFormData((prev) => {
      if (prev.lines.length === 0) return prev;

      const currentLineDesc = prev.lines[0].lineDescription;
      // Only sync if line description is empty (user hasn't manually set it)
      if (!currentLineDesc) {
        const newLines = [...prev.lines];
        newLines[0] = { ...newLines[0], lineDescription: prev.description || null };
        return { ...prev, lines: newLines };
      }
      return prev;
    });
  }

  function handleNumberChange(
    field: 'cashIn' | 'cashOut' | 'bankIn' | 'bankOut',
    value: string
  ) {
    const numValue = value === '' ? null : parseFloat(value);
    const newFormData = { ...formData, [field]: numValue };
    setFormData(newFormData);
    // Validate on change for immediate feedback
    setErrors(validateForm(newFormData));
  }

  // Sync amount to first line on blur (when leaving the field)
  function handleAmountBlur(field: 'cashIn' | 'cashOut' | 'bankIn' | 'bankOut') {
    markFieldTouched('amounts');
    if (initialData?.id) return; // Don't sync when editing existing transaction

    setFormData((prev) => {
      if (prev.lines.length === 0) return prev;

      const currentLineAmount = prev.lines[0].amount;
      // Only sync if line amount is still 0 (user hasn't manually set it)
      if (currentLineAmount !== 0) return prev;

      const amount = prev[field] ?? 0;
      if (amount > 0) {
        const isIncome = field === 'cashIn' || field === 'bankIn';
        const source = field === 'cashIn' || field === 'cashOut' ? 'CASH' : 'BANK';
        const newLines = [...prev.lines];
        newLines[0] = { ...newLines[0], amount, isIncome, source };
        return { ...prev, lines: newLines };
      }

      return prev;
    });
  }

  function handleLineChange<K extends keyof TransactionLineFormData>(
    index: number,
    field: K,
    value: TransactionLineFormData[K]
  ) {
    setFormData((prev) => {
      const newLines = [...prev.lines];
      newLines[index] = { ...newLines[index], [field]: value };
      return { ...prev, lines: newLines };
    });
  }

  function handleAddLine() {
    setFormData((prev) => ({
      ...prev,
      lines: [...prev.lines, createEmptyLine()],
    }));
  }

  function handleRemoveLine(index: number) {
    if (formData.lines.length <= 1) {
      return; // Keep at least one line
    }
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  }

  // Toggle selection of a pending payment
  function handleTogglePayment(id: string) {
    setSelectedPaymentIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  // Select/deselect all available payments
  function handleSelectAllPayments() {
    if (selectedPaymentIds.size === availablePayments.length) {
      setSelectedPaymentIds(new Set());
    } else {
      setSelectedPaymentIds(new Set(availablePayments.map(p => p.id)));
    }
  }

  // Import selected payments as transaction lines
  function handleImportPayments() {
    const paymentsToImport = availablePayments.filter(p => selectedPaymentIds.has(p.id));
    if (paymentsToImport.length === 0) return;

    // Create new lines from selected payments
    const newLines: TransactionLineFormData[] = paymentsToImport.map(payment => ({
      id: crypto.randomUUID(),
      categoryId: 'cat-kontingent',
      amount: payment.amount,
      isIncome: true,
      source: payment.paymentMethod,
      memberId: payment.memberId,
      lineDescription: payment.memberName + (payment.notes ? ` - ${payment.notes}` : ''),
    }));

    // Calculate new header totals from imported payments
    let addCashIn = 0;
    let addBankIn = 0;
    paymentsToImport.forEach(p => {
      if (p.paymentMethod === 'CASH') {
        addCashIn += p.amount;
      } else {
        addBankIn += p.amount;
      }
    });

    // Filter out empty lines (default empty line) if we're importing
    const existingLines = formData.lines.filter(
      line => line.categoryId || line.amount > 0 || line.memberId || line.lineDescription
    );

    // Update form data
    const newFormData: TransactionFormData = {
      ...formData,
      cashIn: (formData.cashIn ?? 0) + addCashIn || null,
      bankIn: (formData.bankIn ?? 0) + addBankIn || null,
      lines: existingLines.length > 0 ? [...existingLines, ...newLines] : newLines,
    };
    setFormData(newFormData);
    setErrors(validateForm(newFormData));

    // Track imported payment IDs for consolidation on save
    setImportedPaymentIds(prev => {
      const newSet = new Set(prev);
      paymentsToImport.forEach(p => newSet.add(p.id));
      return newSet;
    });

    // Clear selection
    setSelectedPaymentIds(new Set());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);

    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      // Pass imported payment IDs for consolidation
      const consolidateIds = importedPaymentIds.size > 0 ? Array.from(importedPaymentIds) : undefined;
      onSave(formData, consolidateIds);
    }
  }

  // ===== Render =====

  const isEditMode = !!initialData?.id;
  const activeCategories = categories.filter((c) => c.isActive);
  const activeMembers = useMemo(
    () =>
      members
        .filter((m) => m.status === 'ACTIVE')
        .sort((a, b) => {
          const firstNameCompare = (a.firstName || '').localeCompare(b.firstName || '', 'da');
          if (firstNameCompare !== 0) return firstNameCompare;
          return (a.lastName || '').localeCompare(b.lastName || '', 'da');
        }),
    [members]
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isEditMode ? 'Rediger transaktion' : 'Ny transaktion'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">Regnskabsår {fiscalYear}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Luk dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Basic Fields */}
            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dato <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  onBlur={() => markFieldTouched('date')}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    shouldShowError('date') && errors.date ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {shouldShowError('date') && errors.date && (
                  <p className="text-sm text-red-500 mt-1">{errors.date}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beskrivelse <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  onBlur={() => { markFieldTouched('description'); handleDescriptionBlur(); }}
                  placeholder="F.eks. Kontingent, Patronkøb..."
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    shouldShowError('description') && errors.description ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {shouldShowError('description') && errors.description && (
                  <p className="text-sm text-red-500 mt-1">{errors.description}</p>
                )}
              </div>
            </div>

            {/* Cash/Bank Amounts */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Beløb <span className="text-red-500">*</span>
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Cash In */}
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    Kasse ind
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cashIn ?? ''}
                      onChange={(e) => handleNumberChange('cashIn', e.target.value)}
                      onBlur={() => handleAmountBlur('cashIn')}
                      placeholder="0,00"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      kr
                    </span>
                  </div>
                </div>

                {/* Cash Out */}
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    Kasse ud
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cashOut ?? ''}
                      onChange={(e) => handleNumberChange('cashOut', e.target.value)}
                      onBlur={() => handleAmountBlur('cashOut')}
                      placeholder="0,00"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      kr
                    </span>
                  </div>
                </div>

                {/* Bank In */}
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    Bank ind
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.bankIn ?? ''}
                      onChange={(e) => handleNumberChange('bankIn', e.target.value)}
                      onBlur={() => handleAmountBlur('bankIn')}
                      placeholder="0,00"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      kr
                    </span>
                  </div>
                </div>

                {/* Bank Out */}
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    Bank ud
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.bankOut ?? ''}
                      onChange={(e) => handleNumberChange('bankOut', e.target.value)}
                      onBlur={() => handleAmountBlur('bankOut')}
                      placeholder="0,00"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      kr
                    </span>
                  </div>
                </div>
              </div>
              {shouldShowError('amounts') && errors.amounts && (
                <p className="text-sm text-red-500 mt-2">{errors.amounts}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Noter
              </label>
              <textarea
                value={formData.notes ?? ''}
                onChange={(e) =>
                  handleFieldChange('notes', e.target.value || null)
                }
                placeholder="Eventuelle bemærkninger..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </div>

            {/* Transaction Lines */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Posteringslinjer <span className="text-red-500">*</span>
                </h3>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Tilføj linje
                </button>
              </div>

              {shouldShowError('lines') && errors.lines && (
                <p className="text-sm text-red-500 mb-2">{errors.lines}</p>
              )}

              <div className="space-y-3">
                {formData.lines.map((line, index) => {
                  const lineError = errors.lineErrors?.[index];

                  return (
                    <div
                      key={line.id ?? index}
                      className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                    >
                      <div className="flex items-start gap-3">
                        {/* Line Number */}
                        <div className="flex-shrink-0 w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                          {index + 1}
                        </div>

                        {/* Line Fields */}
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          {/* Category */}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Kategori
                            </label>
                            <select
                              value={line.categoryId}
                              onChange={(e) =>
                                handleLineChange(index, 'categoryId', e.target.value)
                              }
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm ${
                                touched && lineError?.categoryId
                                  ? 'border-red-500'
                                  : 'border-gray-300'
                              }`}
                            >
                              <option value="">Vælg kategori...</option>
                              {activeCategories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                            {touched && lineError?.categoryId && (
                              <p className="text-xs text-red-500 mt-1">
                                {lineError.categoryId}
                              </p>
                            )}
                          </div>

                          {/* Amount */}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Beløb
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.amount || ''}
                                onChange={(e) =>
                                  handleLineChange(
                                    index,
                                    'amount',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                placeholder="0,00"
                                className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm ${
                                  touched && lineError?.amount
                                    ? 'border-red-500'
                                    : 'border-gray-300'
                                }`}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                                kr
                              </span>
                            </div>
                            {touched && lineError?.amount && (
                              <p className="text-xs text-red-500 mt-1">
                                {lineError.amount}
                              </p>
                            )}
                          </div>

                          {/* Income/Expense Toggle */}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Type
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleLineChange(index, 'isIncome', true)
                                }
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  line.isIncome
                                    ? 'bg-green-100 text-green-700 border-2 border-green-500'
                                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                                }`}
                              >
                                Indtægt
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleLineChange(index, 'isIncome', false)
                                }
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  !line.isIncome
                                    ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                                }`}
                              >
                                Udgift
                              </button>
                            </div>
                          </div>

                          {/* Cash/Bank Toggle */}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Kilde
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleLineChange(index, 'source', 'CASH')
                                }
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  line.source === 'CASH'
                                    ? 'bg-amber-100 text-amber-700 border-2 border-amber-500'
                                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                                }`}
                              >
                                Kasse
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleLineChange(index, 'source', 'BANK')
                                }
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  line.source === 'BANK'
                                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                                }`}
                              >
                                Bank
                              </button>
                            </div>
                          </div>

                          {/* Member */}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Medlem (valgfri)
                            </label>
                            <select
                              value={line.memberId ?? ''}
                              onChange={(e) =>
                                handleLineChange(
                                  index,
                                  'memberId',
                                  e.target.value || null
                                )
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                            >
                              <option value="">Ingen medlem</option>
                              {activeMembers.map((member) => (
                                <option
                                  key={member.internalId}
                                  value={member.internalId}
                                >
                                  {member.firstName} {member.lastName}
                                  {member.membershipId ? ` (${member.membershipId})` : ' (Prøvemedlem)'}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Line Description */}
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">
                              Linjebeskrivelse (valgfri)
                            </label>
                            <input
                              type="text"
                              value={line.lineDescription ?? ''}
                              onChange={(e) =>
                                handleLineChange(
                                  index,
                                  'lineDescription',
                                  e.target.value || null
                                )
                              }
                              placeholder="Yderligere detaljer..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                            />
                          </div>
                        </div>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(index)}
                          disabled={formData.lines.length <= 1}
                          className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                            formData.lines.length <= 1
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={
                            formData.lines.length <= 1
                              ? 'Mindst én linje er påkrævet'
                              : 'Fjern linje'
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {shouldShowError('lineBalance') && errors.lineBalance && (
                <p className="text-sm text-red-500 mt-3">{errors.lineBalance}</p>
              )}
            </div>

            {/* Import from Pending Payments - Only show when creating new transactions */}
            {!isEditMode && availablePayments.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Collapsible Header */}
                <button
                  type="button"
                  onClick={() => setImportSectionExpanded(!importSectionExpanded)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {importSectionExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="text-sm font-medium text-gray-700">
                      Importer fra afventende betalinger
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                      {availablePayments.length}
                    </span>
                  </div>
                  {importedPaymentIds.size > 0 && (
                    <span className="text-xs text-green-600">
                      {importedPaymentIds.size} importeret
                    </span>
                  )}
                </button>

                {/* Expanded Content */}
                {importSectionExpanded && (
                  <div className="p-3 border-t border-gray-200 space-y-3">
                    {/* Select All */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        {selectedPaymentIds.size} valgt
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllPayments}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        {selectedPaymentIds.size === availablePayments.length ? 'Fravælg alle' : 'Vælg alle'}
                      </button>
                    </div>

                    {/* Payment List */}
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {availablePayments.map((payment) => (
                        <label
                          key={payment.id}
                          className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                            selectedPaymentIds.has(payment.id)
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                            selectedPaymentIds.has(payment.id)
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-gray-300'
                          }`}>
                            {selectedPaymentIds.has(payment.id) && <Check className="w-3 h-3" />}
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedPaymentIds.has(payment.id)}
                            onChange={() => handleTogglePayment(payment.id)}
                            className="sr-only"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {payment.memberName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDate(payment.paymentDate)} · {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                              {payment.notes && ` · ${payment.notes}`}
                            </p>
                          </div>
                          <div className={`text-sm font-medium flex-shrink-0 ${
                            payment.paymentMethod === 'CASH' ? 'text-green-600' : 'text-blue-600'
                          }`}>
                            {formatAmount(payment.amount)}
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Import Button */}
                    <button
                      type="button"
                      onClick={handleImportPayments}
                      disabled={selectedPaymentIds.size === 0}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Importer valgte ({selectedPaymentIds.size})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Annuller
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {isEditMode ? 'Gem ændringer' : 'Opret transaktion'}
          </button>
        </div>
      </div>
    </div>
  );
}
