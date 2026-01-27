/**
 * Finance management page.
 * Displays financial transactions and balances.
 * 
 * @see [prd.md] - Financial Transactions Management
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Wallet, Plus, Download, ChevronDown, Settings, Printer, BarChart3 } from 'lucide-react';
import { TransactionTable, TransactionDialog, YearSettingsDialog, CategoryTotals, MemberFeeStatusTable, MemberHistoryDialog, TransactionFilterBar, applyTransactionFilters, DEFAULT_FILTERS, PrintView, FinanceCharts, QuickFeePaymentDialog, ConsolidateFeePaymentsDialog } from '../components/finance';
import type { TransactionFilters } from '../components/finance';
import { ConfirmDialog } from '../components';
import {
  getTransactionsWithLinesByYear,
  getCategories,
  getRunningBalances,
  getFiscalYears,
  createTransaction,
  updateTransaction,
  deleteTransaction as deleteTransactionDb,
  getFiscalYear,
  createFiscalYear,
  updateFiscalYear,
  getFeeRatesForYear,
  setFeeRate,
  getClosingBalances,
  getPendingFeePayments,
  createPendingFeePayment,
  consolidatePendingFeePayments,
  deletePendingFeePayment,
} from '../database';
import { onlineSyncService } from '../database/onlineSyncService';
import { getAllMembers } from '../database/memberRepository';
import { exportKassebog } from '../utils';
import { MEMBER_TYPE_LABELS } from '../types';
import type {
  TransactionWithLines,
  TransactionDisplayRow,
  PostingCategory,
  TransactionFormData,
  FiscalYear,
  FeeRate,
  MemberType,
  PendingFeePaymentWithMember,
  PaymentMethod,
} from '../types';
import type { Member } from '../types/entities';

export function FinancePage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  // Track previous year to detect changes
  const [loadedYear, setLoadedYear] = useState<number | null>(null);
  
  // Initialize state with lazy loaders
  const [transactions, setTransactions] = useState<TransactionWithLines[]>(() => 
    getTransactionsWithLinesByYear(currentYear)
  );
  const [categories, setCategories] = useState<PostingCategory[]>(getCategories);
  const [members, setMembers] = useState<Member[]>(getAllMembers);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>(getFiscalYears);
  const [balances, setBalances] = useState(() => getRunningBalances(currentYear));
  const [feeRates, setFeeRates] = useState<FeeRate[]>(() => getFeeRatesForYear(currentYear));
  const [pendingPayments, setPendingPayments] = useState<PendingFeePaymentWithMember[]>(() => 
    getPendingFeePayments(currentYear)
  );
  const [feeRateDrafts, setFeeRateDrafts] = useState<Record<MemberType, string>>(() => {
    const initialRates = getFeeRatesForYear(currentYear);
    return {
      ADULT: String(initialRates.find((r) => r.memberType === 'ADULT')?.feeAmount ?? ''),
      CHILD: String(initialRates.find((r) => r.memberType === 'CHILD')?.feeAmount ?? ''),
      CHILD_PLUS: String(initialRates.find((r) => r.memberType === 'CHILD_PLUS')?.feeAmount ?? ''),
      HONORARY: String(initialRates.find((r) => r.memberType === 'HONORARY')?.feeAmount ?? '0'),
    };
  });
  const [feeRateError, setFeeRateError] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionFormData | undefined>(undefined);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isYearSettingsOpen, setIsYearSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'categories' | 'fees' | 'charts'>('transactions');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const printRef = useRef<HTMLDivElement>(null);
  
  const [isQuickPaymentOpen, setIsQuickPaymentOpen] = useState(false);
  const [isConsolidateOpen, setIsConsolidateOpen] = useState(false);
  const [quickPaymentMemberId, setQuickPaymentMemberId] = useState<string | undefined>(undefined);

  // Print handler
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    setFeeRateDrafts({
      ADULT: String(feeRates.find((r) => r.memberType === 'ADULT')?.feeAmount ?? ''),
      CHILD: String(feeRates.find((r) => r.memberType === 'CHILD')?.feeAmount ?? ''),
      CHILD_PLUS: String(feeRates.find((r) => r.memberType === 'CHILD_PLUS')?.feeAmount ?? ''),
      HONORARY: String(feeRates.find((r) => r.memberType === 'HONORARY')?.feeAmount ?? '0'),
    });
  }, [feeRates]);

  // Reload data when year changes (after initial render)
  if (loadedYear !== null && loadedYear !== selectedYear) {
    setLoadedYear(selectedYear);
    setTransactions(getTransactionsWithLinesByYear(selectedYear));
    setBalances(getRunningBalances(selectedYear));
    setCategories(getCategories());
    setMembers(getAllMembers());
    setFiscalYears(getFiscalYears());
    setFeeRates(getFeeRatesForYear(selectedYear));
    setPendingPayments(getPendingFeePayments(selectedYear));
    
    // Ensure fiscal year exists
    const fy = getFiscalYear(selectedYear);
    if (!fy) {
      const now = new Date().toISOString();
      createFiscalYear({
        year: selectedYear,
        openingCashBalance: 0,
        openingBankBalance: 0,
        isClosed: false,
        createdAtUtc: now,
        updatedAtUtc: now,
      });
      setFiscalYears(getFiscalYears());
    }
  }
  
  // Mark as loaded after first render
  if (loadedYear === null) {
    setLoadedYear(selectedYear);
  }

  // Load data function for refresh after mutations
  const loadData = useCallback(() => {
    setTransactions(getTransactionsWithLinesByYear(selectedYear));
    setBalances(getRunningBalances(selectedYear));
    setCategories(getCategories());
    setMembers(getAllMembers());
    setFiscalYears(getFiscalYears());
    setFeeRates(getFeeRatesForYear(selectedYear));
    setPendingPayments(getPendingFeePayments(selectedYear));
  }, [selectedYear]);

  const selectedFiscalYear = useMemo(() => getFiscalYear(selectedYear), [selectedYear, fiscalYears]);

  const handleFeeRateChange = (memberType: MemberType, value: string) => {
    setFeeRateDrafts((prev) => ({
      ...prev,
      [memberType]: value,
    }));
  };

  const handleSaveFeeRates = () => {
    setFeeRateError(null);
    if (selectedFiscalYear?.isClosed) {
      setFeeRateError('Regnskabsåret er lukket og kan ikke redigeres.');
      return;
    }

    const parsedRates: { memberType: MemberType; amount: number }[] = [
      { memberType: 'ADULT', amount: parseFloat(feeRateDrafts.ADULT) },
      { memberType: 'CHILD', amount: parseFloat(feeRateDrafts.CHILD) },
      { memberType: 'CHILD_PLUS', amount: parseFloat(feeRateDrafts.CHILD_PLUS) },
      { memberType: 'HONORARY', amount: 0 }, // Honorary members always have 0 fee
    ];

    if (parsedRates.some((rate) => Number.isNaN(rate.amount) || rate.amount < 0)) {
      setFeeRateError('Alle satser skal være tal, og de må ikke være negative.');
      return;
    }

    parsedRates.forEach((rate) => setFeeRate(selectedYear, rate.memberType, rate.amount));
    setFeeRates(getFeeRatesForYear(selectedYear));
  };

  // Calculate display rows with running balances
  const displayRows: TransactionDisplayRow[] = useMemo(() => {
    const fiscalYear = getFiscalYear(selectedYear);
    const openingCash = fiscalYear?.openingCashBalance ?? 0;
    const openingBank = fiscalYear?.openingBankBalance ?? 0;

    // Use reduce to calculate running balances without mutation
    const result: TransactionDisplayRow[] = [];
    let runningCash = openingCash;
    let runningBank = openingBank;
    
    for (const txn of transactions) {
      runningCash += (txn.cashIn ?? 0) - (txn.cashOut ?? 0);
      runningBank += (txn.bankIn ?? 0) - (txn.bankOut ?? 0);
      result.push({
        ...txn,
        runningCashBalance: runningCash,
        runningBankBalance: runningBank,
      });
    }
    
    return result;
  }, [transactions, selectedYear]);

  // Apply filters to display rows
  const filteredDisplayRows = useMemo(() => {
    return applyTransactionFilters(displayRows, filters);
  }, [displayRows, filters]);

  // Available years (from fiscal years or generate defaults)
  const years = useMemo(() => {
    const fyYears = fiscalYears.map(fy => fy.year);
    const defaultYears = Array.from({ length: 6 }, (_, i) => currentYear - i);
    const allYears = [...new Set([...fyYears, ...defaultYears])];
    return allYears.sort((a, b) => b - a);
  }, [fiscalYears, currentYear]);

  // Handle save transaction
  const handleSaveTransaction = (formData: TransactionFormData) => {
    const now = new Date().toISOString();
    
    if (formData.id && editingTransaction?.id) {
      // Update existing
      updateTransaction(
        {
          id: formData.id,
          fiscalYear: selectedYear,
          sequenceNumber: 0, // Will be preserved
          date: formData.date,
          description: formData.description,
          cashIn: formData.cashIn,
          cashOut: formData.cashOut,
          bankIn: formData.bankIn,
          bankOut: formData.bankOut,
          notes: formData.notes,
          isDeleted: false,
          createdAtUtc: now,
          updatedAtUtc: now,
        },
        formData.lines.map(line => ({
          id: line.id || crypto.randomUUID(),
          transactionId: formData.id!,
          categoryId: line.categoryId,
          amount: line.amount,
          isIncome: line.isIncome,
          source: line.source,
          memberId: line.memberId,
          lineDescription: line.lineDescription,
        }))
      );
    } else {
      // Create new
      const id = crypto.randomUUID();
      createTransaction(
        {
          id,
          fiscalYear: selectedYear,
          date: formData.date,
          description: formData.description,
          cashIn: formData.cashIn,
          cashOut: formData.cashOut,
          bankIn: formData.bankIn,
          bankOut: formData.bankOut,
          notes: formData.notes,
          isDeleted: false,
          createdAtUtc: now,
          updatedAtUtc: now,
        },
        formData.lines.map(line => ({
          id: line.id || crypto.randomUUID(),
          categoryId: line.categoryId,
          amount: line.amount,
          isIncome: line.isIncome,
          source: line.source,
          memberId: line.memberId,
          lineDescription: line.lineDescription,
        }))
      );
    }

    setIsDialogOpen(false);
    setEditingTransaction(undefined);
    loadData();
  };

  // Handle edit
  const handleEdit = (id: string) => {
    const txn = transactions.find(t => t.id === id);
    if (!txn) return;
    
    setEditingTransaction({
      id: txn.id,
      date: txn.date,
      description: txn.description,
      cashIn: txn.cashIn,
      cashOut: txn.cashOut,
      bankIn: txn.bankIn,
      bankOut: txn.bankOut,
      notes: txn.notes,
      lines: txn.lines.map(line => ({
        id: line.id,
        categoryId: line.categoryId,
        amount: line.amount,
        isIncome: line.isIncome,
        source: line.source,
        memberId: line.memberId,
        lineDescription: line.lineDescription,
      })),
    });
    setIsDialogOpen(true);
  };

  // Handle delete
  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteTransactionDb(deleteConfirmId);
      setDeleteConfirmId(null);
      loadData();
    }
  };

  // Handle export
  const handleExport = () => {
    const fiscalYear = getFiscalYear(selectedYear);
    if (!fiscalYear) {
      alert('Ingen data at eksportere for dette år');
      return;
    }
    exportKassebog({
      fiscalYear,
      transactions,
      categories,
    });
  };

  // Handle quick fee payment
  const handleQuickPayment = (payment: {
    memberId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    notes: string | null;
  }) => {
    const now = new Date().toISOString();
    createPendingFeePayment({
      id: crypto.randomUUID(),
      fiscalYear: selectedYear,
      memberId: payment.memberId,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      notes: payment.notes,
      createdAtUtc: now,
      updatedAtUtc: now,
    });
    setIsQuickPaymentOpen(false);
    setQuickPaymentMemberId(undefined);
    loadData();
  };

  // Handle consolidate fee payments
  const handleConsolidate = (
    paymentIds: string[],
    description: string,
    date: string,
    categoryId: string
  ) => {
    consolidatePendingFeePayments(selectedYear, paymentIds, description, date, categoryId);
    setIsConsolidateOpen(false);
    loadData();
  };

  // Handle delete pending payment
  const handleDeletePendingPayment = async (paymentId: string) => {
    deletePendingFeePayment(paymentId);
    // Also push delete to online database
    await onlineSyncService.pushPendingFeePaymentDelete(paymentId);
    loadData();
  };

  // Open quick payment with optional preselected member
  const openQuickPayment = (memberId?: string) => {
    setQuickPaymentMemberId(memberId);
    setIsQuickPaymentOpen(true);
  };

  // Handle year settings
  const handleSaveYearSettings = (fiscalYear: FiscalYear) => {
    updateFiscalYear(fiscalYear);
    loadData();
  };

  const handleCreateYear = (year: number) => {
    const now = new Date().toISOString();
    // Use previous year's closing balances as opening balances
    const previousYear = year - 1;
    const previousClosing = getClosingBalances(previousYear);
    
    createFiscalYear({
      year,
      openingCashBalance: previousClosing.cash,
      openingBankBalance: previousClosing.bank,
      isClosed: false,
      createdAtUtc: now,
      updatedAtUtc: now,
    });
    setSelectedYear(year);
    loadData();
  };

  // Get current fiscal year for settings dialog
  const currentFiscalYear = fiscalYears.find(fy => fy.year === selectedYear) || null;
  const existingYearNumbers = fiscalYears.map(fy => fy.year);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-gray-200 bg-white no-print">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Økonomi {selectedYear}</h1>
            <p className="text-gray-600 mt-1 text-sm md:text-base">Kassebog og økonomistyring</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {/* Year Selector */}
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-3 md:px-4 py-2 pr-8 md:pr-10 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Year Settings Button */}
            <button
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setIsYearSettingsOpen(true)}
              title="Årsindstillinger"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Print Button */}
            <button
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={handlePrint}
              title="Udskriv"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Export Button */}
            <button
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={handleExport}
              title="Eksporter til Excel"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Eksporter til Excel</span>
            </button>

            {/* Add Transaction Button */}
            <button
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              onClick={() => {
                setEditingTransaction(undefined);
                setIsDialogOpen(true);
              }}
              title="Ny transaktion"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Ny transaktion</span>
            </button>
          </div>
        </div>

        {/* Balance Summary Bar */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-blue-50 rounded-lg p-3 md:p-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Wallet className="w-4 md:w-5 h-4 md:h-5" />
              <span className="text-sm font-medium">Kontant</span>
            </div>
            <p className="mt-1 text-xl md:text-2xl font-bold text-blue-900">
              {balances.cash.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
            </p>
          </div>

          <div className="bg-green-50 rounded-lg p-3 md:p-4">
            <div className="flex items-center gap-2 text-green-700">
              <Wallet className="w-4 md:w-5 h-4 md:h-5" />
              <span className="text-sm font-medium">Bank</span>
            </div>
            <p className="mt-1 text-xl md:text-2xl font-bold text-green-900">
              {balances.bank.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 md:p-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Wallet className="w-4 md:w-5 h-4 md:h-5" />
              <span className="text-sm font-medium">Total</span>
            </div>
            <p className="mt-1 text-xl md:text-2xl font-bold text-gray-900">
              {(balances.cash + balances.bank).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 md:px-6 pt-4 bg-white border-b border-gray-200 no-print">
        <nav className="flex gap-2 md:gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'transactions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Transaktioner
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'categories'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Kategorioversigt
          </button>
          <button
            onClick={() => setActiveTab('fees')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'fees'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Kontingent
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'charts'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Oversigt
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6 no-print">
        {activeTab === 'transactions' && (
          <div>
            <TransactionFilterBar
              categories={categories}
              filters={filters}
              onFiltersChange={setFilters}
            />
            <TransactionTable
              transactions={filteredDisplayRows}
              categories={categories}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        )}
        {activeTab === 'categories' && (
          <CategoryTotals
            transactions={transactions}
            categories={categories}
          />
        )}
        {activeTab === 'fees' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Kontingentsatser for {selectedYear}</h3>
                {selectedFiscalYear?.isClosed && (
                  <span className="text-xs text-red-600">Lukket år</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {MEMBER_TYPE_LABELS.ADULT}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={feeRateDrafts.ADULT}
                      onChange={(e) => handleFeeRateChange('ADULT', e.target.value)}
                      disabled={selectedFiscalYear?.isClosed}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      DKK
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {MEMBER_TYPE_LABELS.CHILD}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={feeRateDrafts.CHILD}
                      onChange={(e) => handleFeeRateChange('CHILD', e.target.value)}
                      disabled={selectedFiscalYear?.isClosed}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      DKK
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {MEMBER_TYPE_LABELS.CHILD_PLUS}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={feeRateDrafts.CHILD_PLUS}
                      onChange={(e) => handleFeeRateChange('CHILD_PLUS', e.target.value)}
                      disabled={selectedFiscalYear?.isClosed}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      DKK
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {MEMBER_TYPE_LABELS.HONORARY}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value="0"
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      DKK
                    </span>
                  </div>
                </div>
              </div>
              {feeRateError && (
                <p className="mt-2 text-sm text-red-600">{feeRateError}</p>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleSaveFeeRates}
                  disabled={selectedFiscalYear?.isClosed}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Gem satser
                </button>
              </div>
            </div>
            {/* Action buttons for pending payments */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {pendingPayments.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm">
                    <span className="font-medium">{pendingPayments.length}</span>
                    <span>afventende betalinger</span>
                    <span className="font-medium">
                      ({pendingPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })})
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openQuickPayment()}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Registrer betaling
                </button>
                <button
                  onClick={() => setIsConsolidateOpen(true)}
                  disabled={pendingPayments.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Konsolider betalinger
                </button>
              </div>
            </div>
            <MemberFeeStatusTable
              members={members}
              transactions={transactions}
              feeRates={feeRates}
              year={selectedYear}
              pendingPayments={pendingPayments}
              onMemberClick={(memberId) => setSelectedMemberId(memberId)}
              onQuickPayment={openQuickPayment}
            />
          </div>
        )}
        {activeTab === 'charts' && (
          <FinanceCharts
            transactions={transactions}
            categories={categories}
            year={selectedYear}
          />
        )}
      </div>

      {/* Print View (hidden on screen, shown only when printing) */}
      <div className="print-only">
        <PrintView
          ref={printRef}
          fiscalYear={currentFiscalYear}
          transactions={displayRows}
          categories={categories}
          balances={balances}
        />
      </div>

      {/* Add/Edit Dialog */}
      <TransactionDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingTransaction(undefined);
        }}
        onSave={handleSaveTransaction}
        categories={categories}
        members={members}
        fiscalYear={selectedYear}
        initialData={editingTransaction}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Slet transaktion"
        message="Er du sikker på at du vil slette denne transaktion? Denne handling kan ikke fortrydes."
        confirmText="Slet"
        cancelText="Annuller"
        variant="danger"
      />

      {/* Year Settings Dialog */}
      <YearSettingsDialog
        isOpen={isYearSettingsOpen}
        onClose={() => setIsYearSettingsOpen(false)}
        onSave={handleSaveYearSettings}
        onCreateYear={handleCreateYear}
        fiscalYear={currentFiscalYear}
        existingYears={existingYearNumbers}
        previousYearClosing={getClosingBalances(selectedYear - 1)}
      />

      {/* Member History Dialog */}
      <MemberHistoryDialog
        isOpen={selectedMemberId !== null}
        onClose={() => setSelectedMemberId(null)}
        member={members.find((m) => m.membershipId === selectedMemberId) ?? null}
        transactions={transactions}
        categories={categories}
        year={selectedYear}
      />

      {/* Quick Fee Payment Dialog */}
      <QuickFeePaymentDialog
        isOpen={isQuickPaymentOpen}
        onClose={() => {
          setIsQuickPaymentOpen(false);
          setQuickPaymentMemberId(undefined);
        }}
        onSave={handleQuickPayment}
        members={members}
        feeRates={feeRates}
        year={selectedYear}
        preselectedMemberId={quickPaymentMemberId}
      />

      {/* Consolidate Fee Payments Dialog */}
      <ConsolidateFeePaymentsDialog
        isOpen={isConsolidateOpen}
        onClose={() => setIsConsolidateOpen(false)}
        onConsolidate={handleConsolidate}
        onDelete={handleDeletePendingPayment}
        pendingPayments={pendingPayments}
        categories={categories}
        year={selectedYear}
      />
    </div>
  );
}
