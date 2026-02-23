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
import { SearchableSelect, type SelectOption } from '../SearchableSelect';
import { KeyboardHint, SHORTCUTS } from '../KeyboardHint';

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
 * Create an empty transaction line with defaults from a previous line.
 */
function createEmptyLineWithDefaults(
  lastLine?: TransactionLineFormData
): TransactionLineFormData {
  if (!lastLine) return createEmptyLine();
  return {
    ...createEmptyLine(),
    categoryId: lastLine.categoryId || '',
    isIncome: lastLine.isIncome,
    source: lastLine.source,
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

  const lineTotals = useMemo(() => {
    const totals = { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 };
    formData.lines.forEach((line) => {
      if (line.source === 'CASH' && line.isIncome) totals.cashIn += line.amount;
      if (line.source === 'CASH' && !line.isIncome) totals.cashOut += line.amount;
      if (line.source === 'BANK' && line.isIncome) totals.bankIn += line.amount;
      if (line.source === 'BANK' && !line.isIncome) totals.bankOut += line.amount;
    });
    return totals;
  }, [formData.lines]);

  const headerTotals = useMemo(
    () => ({
      cashIn: formData.cashIn ?? 0,
      cashOut: formData.cashOut ?? 0,
      bankIn: formData.bankIn ?? 0,
      bankOut: formData.bankOut ?? 0,
    }),
    [formData.cashIn, formData.cashOut, formData.bankIn, formData.bankOut]
  );

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

  // Convert members to SelectOption format for searchable dropdown
  const memberOptions: SelectOption[] = useMemo(
    () =>
      activeMembers.map((member) => ({
        value: member.internalId,
        label: `${member.firstName} ${member.lastName}`.trim(),
        sublabel: member.membershipId ? `#${member.membershipId}` : 'Prøvemedlem',
      })),
    [activeMembers]
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
      lines: [...prev.lines, createEmptyLineWithDefaults(prev.lines.at(-1))],
    }));
  }

  function handleDuplicateLastLine() {
    setFormData((prev) => {
      if (prev.lines.length === 0) {
        return { ...prev, lines: [createEmptyLine()] };
      }
      const lastLine = prev.lines[prev.lines.length - 1];
      const duplicatedLine: TransactionLineFormData = {
        ...lastLine,
        id: crypto.randomUUID(),
      };
      return { ...prev, lines: [...prev.lines, duplicatedLine] };
    });
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
  const epsilon = 0.001;
  const lineMismatches = {
    cashIn: Math.abs(lineTotals.cashIn - headerTotals.cashIn) > epsilon,
    cashOut: Math.abs(lineTotals.cashOut - headerTotals.cashOut) > epsilon,
    bankIn: Math.abs(lineTotals.bankIn - headerTotals.bankIn) > epsilon,
    bankOut: Math.abs(lineTotals.bankOut - headerTotals.bankOut) > epsilon,
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 w-[65%] max-w-4xl bg-white shadow-xl flex flex-col transform transition-transform duration-200 ease-out">
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
              {shouldShowError('lines') && errors.lines && (
                <p className="text-sm text-red-500 mb-2">{errors.lines}</p>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700">
                    Posteringslinjer <span className="text-red-500">*</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Linjer: {formData.lines.length}</span>
                    <button
                      type="button"
                      onClick={handleDuplicateLastLine}
                      className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
                    >
                      Duplikér seneste
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tilføj linje
                    </button>
                  </div>
                </div>

                <div className="h-80 overflow-y-auto p-3 space-y-2">
                  <div className="hidden md:grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wide text-gray-400 px-2">
                    <span className="col-span-1">#</span>
                    <span className="col-span-2">Kategori</span>
                    <span className="col-span-2">Beløb</span>
                    <span className="col-span-1">Type</span>
                    <span className="col-span-1">Kilde</span>
                    <span className="col-span-2">Medlem</span>
                    <span className="col-span-2">Beskrivelse</span>
                    <span className="col-span-1"></span>
                  </div>
                  {formData.lines.map((line, index) => {
                    const lineError = errors.lineErrors?.[index];

                    return (
                      <div
                        key={line.id ?? index}
                        className="bg-white rounded-lg p-2 border border-gray-200 hover:border-gray-300 transition-colors"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2 items-start">
                          {/* Line Number */}
                          <div className="hidden md:flex md:col-span-1 w-5 h-5 bg-gray-200 rounded-full items-center justify-center text-[10px] font-medium text-gray-600 mt-1">
                            {index + 1}
                          </div>

                          {/* Category */}
                          <div className="md:col-span-2">
                            <label className="sr-only">Kategori</label>
                            <select
                              value={line.categoryId}
                              onChange={(e) =>
                                handleLineChange(index, 'categoryId', e.target.value)
                              }
                              className={`w-full h-8 px-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white ${
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
                          <div className="md:col-span-2">
                            <label className="sr-only">Beløb</label>
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
                                className={`w-full h-8 px-2 pr-7 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white ${
                                  touched && lineError?.amount
                                    ? 'border-red-500'
                                    : 'border-gray-300'
                                }`}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">
                                kr
                              </span>
                            </div>
                            {touched && lineError?.amount && (
                              <p className="text-xs text-red-500 mt-1">
                                {lineError.amount}
                              </p>
                            )}
                          </div>

                          {/* Type */}
                          <div className="md:col-span-1">
                            <label className="sr-only">Type</label>
                            <select
                              value={line.isIncome ? 'INCOME' : 'EXPENSE'}
                              onChange={(e) =>
                                handleLineChange(index, 'isIncome', e.target.value === 'INCOME')
                              }
                              className={`w-full h-8 px-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm ${
                                line.isIncome
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : 'border-red-200 bg-red-50 text-red-700'
                              }`}
                            >
                              <option value="INCOME">Indtægt</option>
                              <option value="EXPENSE">Udgift</option>
                            </select>
                          </div>

                          {/* Source */}
                          <div className="md:col-span-1">
                            <label className="sr-only">Kilde</label>
                            <select
                              value={line.source}
                              onChange={(e) =>
                                handleLineChange(index, 'source', e.target.value as 'CASH' | 'BANK')
                              }
                              className={`w-full h-8 px-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm ${
                                line.source === 'CASH'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-blue-200 bg-blue-50 text-blue-700'
                              }`}
                            >
                              <option value="CASH">Kasse</option>
                              <option value="BANK">Bank</option>
                            </select>
                          </div>

                          {/* Member */}
                          <div className="md:col-span-2">
                            <label className="sr-only">Medlem</label>
                            <SearchableSelect
                              options={memberOptions}
                              value={line.memberId}
                              onChange={(value) => handleLineChange(index, 'memberId', value)}
                              placeholder="Søg medlem..."
                              emptyOption="Ingen medlem"
                            />
                          </div>

                          {/* Line Description */}
                          <div className="md:col-span-2">
                            <label className="sr-only">Linjebeskrivelse</label>
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
                              placeholder="Beskrivelse..."
                              className="w-full h-8 px-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                            />
                          </div>

                          {/* Remove Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(index)}
                            disabled={formData.lines.length <= 1}
                            className={`md:col-span-1 h-8 w-8 flex items-center justify-center rounded-md transition-colors ${
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

                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-gray-50 border-t border-gray-200">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <span className={lineMismatches.cashIn ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      Kasse ind: {formatAmount(lineTotals.cashIn)} / {formatAmount(headerTotals.cashIn)}
                    </span>
                    <span className={lineMismatches.cashOut ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      Kasse ud: {formatAmount(lineTotals.cashOut)} / {formatAmount(headerTotals.cashOut)}
                    </span>
                    <span className={lineMismatches.bankIn ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      Bank ind: {formatAmount(lineTotals.bankIn)} / {formatAmount(headerTotals.bankIn)}
                    </span>
                    <span className={lineMismatches.bankOut ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      Bank ud: {formatAmount(lineTotals.bankOut)} / {formatAmount(headerTotals.bankOut)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tilføj linje
                  </button>
                </div>
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
            <KeyboardHint keys={SHORTCUTS.CLOSE} />
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {isEditMode ? 'Gem ændringer' : 'Opret transaktion'}
            <KeyboardHint keys={SHORTCUTS.SAVE} />
          </button>
        </div>
      </div>
    </div>
  );
}
