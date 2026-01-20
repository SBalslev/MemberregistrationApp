/**
 * Member Fee Status Table component.
 * Shows fee payment status for all active members.
 */

import { useMemo, useState } from 'react';
import { Check, X, AlertCircle, Filter, Clock, CreditCard } from 'lucide-react';
import type { TransactionWithLines, FeeRate, PendingFeePaymentWithMember } from '../../types';
import type { Member } from '../../types/entities';
import { MEMBER_TYPE_LABELS } from '../../types';

// Extended fee status for internal use (includes computed fields)
interface FeeStatusRow {
  memberId: string;
  memberName: string;
  memberType: 'ADULT' | 'CHILD' | 'CHILD_PLUS';
  expectedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  outstandingAmount: number;
  isPaidInFull: boolean;
  hasPending: boolean;
  paymentDates: string[];
}

interface MemberFeeStatusTableProps {
  members: Member[];
  transactions: TransactionWithLines[];
  feeRates: FeeRate[];
  year: number;
  pendingPayments?: PendingFeePaymentWithMember[];
  onMemberClick?: (memberId: string) => void;
  onQuickPayment?: (memberId: string) => void;
}

type FilterType = 'all' | 'paid' | 'unpaid' | 'partial';

export function MemberFeeStatusTable({
  members,
  transactions,
  feeRates,
  year,
  pendingPayments = [],
  onMemberClick,
  onQuickPayment,
}: MemberFeeStatusTableProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Calculate fee status for each member
  const feeStatuses: FeeStatusRow[] = useMemo(() => {
    const FEES_CATEGORY_ID = 'FEES';

    return members
      .filter((m) => m.status === 'ACTIVE')
      .map((member) => {
        // Find expected fee based on fee category
        const feeCategory = member.feeCategory || 'ADULT';
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
              line.memberId === member.membershipId &&
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
          .filter((p) => p.memberId === member.membershipId)
          .reduce((sum, p) => sum + p.amount, 0);

        const outstandingAmount = expectedAmount - paidAmount - pendingAmount;
        const isPaidInFull = paidAmount >= expectedAmount;
        const hasPending = pendingAmount > 0;

        return {
          memberId: member.membershipId || member.internalId, // Use internalId for trials
          memberName: `${member.firstName} ${member.lastName}`,
          memberType: feeCategory,
          expectedAmount,
          paidAmount,
          pendingAmount,
          outstandingAmount: outstandingAmount > 0 ? outstandingAmount : 0,
          isPaidInFull,
          hasPending,
          paymentDates: paymentDates.sort(),
        };
      })
      .sort((a, b) => a.memberName.localeCompare(b.memberName, 'da'));
  }, [members, transactions, feeRates, year, pendingPayments]);

  // Apply filter
  const filteredStatuses = useMemo(() => {
    switch (filter) {
      case 'paid':
        return feeStatuses.filter((s) => s.isPaidInFull);
      case 'unpaid':
        return feeStatuses.filter((s) => s.paidAmount === 0);
      case 'partial':
        return feeStatuses.filter((s) => s.paidAmount > 0 && !s.isPaidInFull);
      default:
        return feeStatuses;
    }
  }, [feeStatuses, filter]);

  // Summary stats
  const stats = useMemo(() => {
    const total = feeStatuses.length;
    const paid = feeStatuses.filter((s) => s.isPaidInFull).length;
    const partial = feeStatuses.filter((s) => s.paidAmount > 0 && !s.isPaidInFull).length;
    const unpaid = feeStatuses.filter((s) => s.paidAmount === 0 && s.pendingAmount === 0).length;
    const pending = feeStatuses.filter((s) => s.hasPending && !s.isPaidInFull).length;
    const totalExpected = feeStatuses.reduce((acc, s) => acc + s.expectedAmount, 0);
    const totalPaid = feeStatuses.reduce((acc, s) => acc + s.paidAmount, 0);
    const totalPending = feeStatuses.reduce((acc, s) => acc + s.pendingAmount, 0);
    return { total, paid, partial, unpaid, pending, totalExpected, totalPaid, totalPending };
  }, [feeStatuses]);

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('da-DK');

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
          <div className="text-right">
            <p className="text-sm text-gray-600">Udestående</p>
            <p className="text-xl font-bold text-red-600">
              {formatCurrency(stats.totalExpected - stats.totalPaid - stats.totalPending)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
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

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
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
                  <td colSpan={onQuickPayment ? 9 : 8} className="px-4 py-8 text-center text-gray-500">
                    Ingen medlemmer matcher filteret
                  </td>
                </tr>
              ) : (
                filteredStatuses.map((status) => (
                  <tr
                    key={status.memberId}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      onMemberClick ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => onMemberClick?.(status.memberId)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {status.memberName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {MEMBER_TYPE_LABELS[status.memberType as keyof typeof MEMBER_TYPE_LABELS]}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(status.expectedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600">
                      {status.paidAmount > 0 ? formatCurrency(status.paidAmount) : '-'}
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
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          <Check className="w-3 h-3" />
                          Betalt
                        </span>
                      ) : status.hasPending ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          <Clock className="w-3 h-3" />
                          Afventer
                        </span>
                      ) : status.paidAmount > 0 ? (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
