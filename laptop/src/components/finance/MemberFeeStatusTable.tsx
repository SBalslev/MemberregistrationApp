/**
 * Member Fee Status Table component.
 * Shows fee payment status for all active members.
 */

import { useMemo, useState, useCallback } from 'react';
import { Check, X, AlertCircle, Filter, Clock, CreditCard, Search, CheckSquare, Square, MinusSquare } from 'lucide-react';
import type { TransactionWithLines, FeeRate, PendingFeePaymentWithMember, MemberType } from '../../types';
import type { Member } from '../../types/entities';
import { MEMBER_TYPE_LABELS } from '../../types';
import { getEffectiveMemberType } from '../../utils/feeCategory';

// Extended fee status for internal use (includes computed fields)
interface FeeStatusRow {
  memberId: string;
  membershipId: string | null;
  memberName: string;
  memberType: MemberType;
  expectedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  externallyPaidAmount: number;
  outstandingAmount: number;
  isPaidInFull: boolean;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  hasPending: boolean;
  hasExternallyPaid: boolean;
  paymentDates: string[];
}

interface MemberFeeStatusTableProps {
  members: Member[];
  transactions: TransactionWithLines[];
  feeRates: FeeRate[];
  year: number;
  pendingPayments?: PendingFeePaymentWithMember[];
  externallyPaidPayments?: PendingFeePaymentWithMember[];
  onMemberClick?: (memberId: string) => void;
  onQuickPayment?: (memberId: string) => void;
  onBatchPayment?: (memberIds: string[]) => void;
}

type FilterType = 'all' | 'paid' | 'unpaid' | 'partial';

export function MemberFeeStatusTable({
  members,
  transactions,
  feeRates,
  year,
  pendingPayments = [],
  externallyPaidPayments = [],
  onMemberClick,
  onQuickPayment,
  onBatchPayment,
}: MemberFeeStatusTableProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  // Calculate fee status for each member
  const feeStatuses: FeeStatusRow[] = useMemo(() => {
    const FEES_CATEGORY_ID = 'cat-kontingent';

    return members
      .filter((m) => m.status === 'ACTIVE')
      .map((member) => {
        // Find expected fee based on fee category
        const feeCategory = getEffectiveMemberType(member);
        const feeRate = feeRates.find(
          (fr) => fr.fiscalYear === year && fr.memberType === feeCategory
        );
        const expectedAmount = feeRate?.feeAmount ?? 0;

        // Sum all FEES category payments for this member
        let paidAmount = 0;
        const paymentDates: string[] = [];

        for (const txn of transactions) {
          for (const line of txn.lines) {
            if (
              line.categoryId === FEES_CATEGORY_ID &&
              line.memberId === member.internalId &&
              line.isIncome
            ) {
              paidAmount += line.amount;
              if (!paymentDates.includes(txn.date)) {
                paymentDates.push(txn.date);
              }
            }
          }
        }

        // Sum pending payments for this member
        const pendingAmount = pendingPayments
          .filter((p) => p.memberId === member.internalId)
          .reduce((sum, p) => sum + p.amount, 0);

        // Sum externally paid amounts for this member (paid in different year)
        const externallyPaidAmount = externallyPaidPayments
          .filter((p) => p.memberId === member.internalId)
          .reduce((sum, p) => sum + p.amount, 0);

        const effectivePaidAmount = paidAmount + externallyPaidAmount;
        const totalPaidOrPending = effectivePaidAmount + pendingAmount;
        const outstandingAmount = expectedAmount - totalPaidOrPending;
        const status: FeeStatusRow['status'] = expectedAmount === 0
          ? 'PAID'
          : pendingAmount > 0
          ? 'PARTIAL'
          : effectivePaidAmount === expectedAmount
          ? 'PAID'
          : effectivePaidAmount > 0
          ? 'PARTIAL'
          : 'UNPAID';
        const isPaidInFull = status === 'PAID';
        const hasPending = pendingAmount > 0;
        const hasExternallyPaid = externallyPaidAmount > 0;

        return {
          memberId: member.internalId, // Always use internalId for consistency
          membershipId: member.membershipId,
          memberName: `${member.firstName} ${member.lastName}`,
          memberType: feeCategory,
          expectedAmount,
          paidAmount,
          pendingAmount,
          externallyPaidAmount,
          outstandingAmount: outstandingAmount > 0 ? outstandingAmount : 0,
          isPaidInFull,
          status,
          hasPending,
          hasExternallyPaid,
          paymentDates: paymentDates.sort(),
        };
      })
      .sort((a, b) => a.memberName.localeCompare(b.memberName, 'da'));
  }, [members, transactions, feeRates, year, pendingPayments, externallyPaidPayments]);

  // Apply filter and search
  const filteredStatuses = useMemo(() => {
    // First apply status filter
    let result: FeeStatusRow[];
    switch (filter) {
      case 'paid':
        result = feeStatuses.filter((s) => s.status === 'PAID');
        break;
      case 'unpaid':
        result = feeStatuses.filter((s) => s.status === 'UNPAID');
        break;
      case 'partial':
        result = feeStatuses.filter((s) => s.status === 'PARTIAL');
        break;
      default:
        result = feeStatuses;
    }

    // Then apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((s) =>
        s.memberName.toLowerCase().includes(query) ||
        (s.membershipId && s.membershipId.toLowerCase().includes(query))
      );
    }

    return result;
  }, [feeStatuses, filter, searchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    const total = feeStatuses.length;
    const paid = feeStatuses.filter((s) => s.status === 'PAID').length;
    const partial = feeStatuses.filter((s) => s.status === 'PARTIAL').length;
    const unpaid = feeStatuses.filter((s) => s.status === 'UNPAID').length;
    const pending = feeStatuses.filter((s) => s.hasPending && !s.isPaidInFull).length;
    const totalExpected = feeStatuses.reduce((acc, s) => acc + s.expectedAmount, 0);
    const totalPaid = feeStatuses.reduce((acc, s) => acc + s.paidAmount, 0);
    const totalPending = feeStatuses.reduce((acc, s) => acc + s.pendingAmount, 0);
    const totalExternallyPaid = feeStatuses.reduce((acc, s) => acc + s.externallyPaidAmount, 0);
    return { total, paid, partial, unpaid, pending, totalExpected, totalPaid, totalPending, totalExternallyPaid };
  }, [feeStatuses]);

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('da-DK');

  // Get selectable members (those who haven't paid in full)
  const selectableMembers = useMemo(() =>
    filteredStatuses.filter(s => !s.isPaidInFull),
    [filteredStatuses]
  );

  // Check if all selectable members are selected
  const allSelected = selectableMembers.length > 0 &&
    selectableMembers.every(s => selectedMemberIds.has(s.memberId));
  const someSelected = selectableMembers.some(s => selectedMemberIds.has(s.memberId));

  // Toggle single member selection
  const toggleMemberSelection = useCallback((memberId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);

  // Toggle all selectable members
  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      // Deselect all
      setSelectedMemberIds(new Set());
    } else {
      // Select all selectable members in current filter
      setSelectedMemberIds(new Set(selectableMembers.map(s => s.memberId)));
    }
  }, [allSelected, selectableMembers]);

  // Handle batch payment
  const handleBatchPayment = useCallback(() => {
    if (selectedMemberIds.size > 0 && onBatchPayment) {
      onBatchPayment(Array.from(selectedMemberIds));
      setSelectedMemberIds(new Set());
    }
  }, [selectedMemberIds, onBatchPayment]);

  // Calculate total for selected members
  const selectedTotal = useMemo(() => {
    return filteredStatuses
      .filter(s => selectedMemberIds.has(s.memberId))
      .reduce((sum, s) => sum + s.outstandingAmount, 0);
  }, [filteredStatuses, selectedMemberIds]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Medlemmer</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm text-green-600">Betalt fuldt</p>
          <p className="text-2xl font-bold text-green-700">{stats.paid}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
          <p className="text-sm text-yellow-600">Delvist betalt</p>
          <p className="text-2xl font-bold text-yellow-700">{stats.partial}</p>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <p className="text-sm text-red-600">Ikke betalt</p>
          <p className="text-2xl font-bold text-red-700">{stats.unpaid}</p>
        </div>
      </div>

      {/* Collection Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-gray-600">Forventet kontingent</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.totalExpected)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Indsamlet</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</p>
          </div>
          {stats.totalPending > 0 && (
            <div className="text-right">
              <p className="text-sm text-amber-600">Afventer konsolidering</p>
              <p className="text-xl font-bold text-amber-600">{formatCurrency(stats.totalPending)}</p>
            </div>
          )}
          {stats.totalExternallyPaid > 0 && (
            <div className="text-right">
              <p className="text-sm text-purple-600">Betalt i andet år</p>
              <p className="text-xl font-bold text-purple-600">{formatCurrency(stats.totalExternallyPaid)}</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-sm text-gray-600">Udestående</p>
            <p className="text-xl font-bold text-red-600">
              {formatCurrency(stats.totalExpected - stats.totalPaid - stats.totalPending - stats.totalExternallyPaid)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['all', 'paid', 'partial', 'unpaid'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filter === f
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {f === 'all' && 'Alle'}
                {f === 'paid' && 'Betalt'}
                {f === 'partial' && 'Delvist'}
                {f === 'unpaid' && 'Ikke betalt'}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Søg navn eller medlemsnr..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
          />
        </div>
      </div>

      {/* Batch Action Bar */}
      {onBatchPayment && selectedMemberIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-blue-700 font-medium">
              {selectedMemberIds.size} medlem{selectedMemberIds.size > 1 ? 'mer' : ''} valgt
            </span>
            <span className="text-blue-600">
              Total udestående: {formatCurrency(selectedTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedMemberIds(new Set())}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            >
              Fravælg alle
            </button>
            <button
              onClick={handleBatchPayment}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Registrer betalinger
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {onBatchPayment && (
                  <th className="px-4 py-3 w-10">
                    <button
                      onClick={toggleSelectAll}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title={allSelected ? 'Fravælg alle' : 'Vælg alle'}
                      aria-label={allSelected ? 'Fravælg alle' : 'Vælg alle'}
                    >
                      {allSelected ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : someSelected ? (
                        <MinusSquare className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium text-gray-600">Medlem</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Forventet</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Betalt</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Afventer</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Udestående</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Betalingsdato</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                {onQuickPayment && (
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Handling</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredStatuses.length === 0 ? (
                <tr>
                  <td colSpan={onQuickPayment ? 10 : onBatchPayment ? 9 : 8} className="px-4 py-8 text-center text-gray-500">
                    Ingen medlemmer matcher filteret
                  </td>
                </tr>
              ) : (
                filteredStatuses.map((status) => {
                  const isSelected = selectedMemberIds.has(status.memberId);
                  const canSelect = !status.isPaidInFull;

                  return (
                  <tr
                    key={status.memberId}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      onMemberClick ? 'cursor-pointer' : ''
                    } ${isSelected ? 'bg-blue-50' : ''}`}
                    onClick={() => onMemberClick?.(status.memberId)}
                  >
                    {onBatchPayment && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {canSelect ? (
                          <button
                            onClick={() => toggleMemberSelection(status.memberId)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            aria-label={isSelected ? 'Fravælg medlem' : 'Vælg medlem'}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5 h-5 block" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {status.memberName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {MEMBER_TYPE_LABELS[status.memberType as keyof typeof MEMBER_TYPE_LABELS]}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(status.expectedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status.paidAmount > 0 || status.externallyPaidAmount > 0 ? (
                        <div className="space-y-0.5">
                          {status.paidAmount > 0 && (
                            <span className="text-green-600">{formatCurrency(status.paidAmount)}</span>
                          )}
                          {status.externallyPaidAmount > 0 && (
                            <span className="block text-purple-600 text-xs" title="Betalt i andet år">
                              +{formatCurrency(status.externallyPaidAmount)} (ext)
                            </span>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status.pendingAmount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Clock className="w-3 h-3" />
                          {formatCurrency(status.pendingAmount)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {status.outstandingAmount > 0
                        ? formatCurrency(status.outstandingAmount)
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {status.paymentDates.length > 0
                        ? status.paymentDates.map(formatDate).join(', ')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {status.isPaidInFull ? (
                        status.hasExternallyPaid && status.paidAmount === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium" title="Betalt i andet år">
                            <Check className="w-3 h-3" />
                            Betalt (ext)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            <Check className="w-3 h-3" />
                            Betalt
                          </span>
                        )
                      ) : status.hasPending ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          <Clock className="w-3 h-3" />
                          Afventer
                        </span>
                      ) : status.paidAmount > 0 || status.externallyPaidAmount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                          <AlertCircle className="w-3 h-3" />
                          Delvist
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          <X className="w-3 h-3" />
                          Mangler
                        </span>
                      )}
                    </td>
                    {onQuickPayment && (
                      <td className="px-4 py-3 text-center">
                        {!status.isPaidInFull && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickPayment(status.memberId);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                            title="Registrer betaling"
                          >
                            <CreditCard className="w-3 h-3" />
                            Betal
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
