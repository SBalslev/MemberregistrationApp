/**
 * Member Transaction History Dialog.
 * Shows all financial transaction lines linked to a specific member.
 */

import { useMemo } from 'react';
import { X, User, Calendar, Tag } from 'lucide-react';
import type { TransactionWithLines, PostingCategory } from '../../types';
import type { Member } from '../../types/entities';

interface MemberHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  transactions: TransactionWithLines[];
  categories: PostingCategory[];
  year?: number;
}

interface TransactionLineWithContext {
  transactionId: string;
  date: string;
  description: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  isIncome: boolean;
  lineDescription: string | null;
}

export function MemberHistoryDialog({
  isOpen,
  onClose,
  member,
  transactions,
  categories,
  year,
}: MemberHistoryDialogProps) {
  // Get all transaction lines for this member
  const memberLines: TransactionLineWithContext[] = useMemo(() => {
    if (!member) return [];

    const lines: TransactionLineWithContext[] = [];

    for (const txn of transactions) {
      // Filter by year if specified
      if (year && !txn.date.startsWith(year.toString())) continue;

      for (const line of txn.lines) {
        if (line.memberId === member.membershipId) {
          const category = categories.find((c) => c.id === line.categoryId);
          lines.push({
            transactionId: txn.id,
            date: txn.date,
            description: txn.description,
            categoryId: line.categoryId,
            categoryName: category?.name ?? 'Ukendt',
            amount: line.amount,
            isIncome: line.isIncome,
            lineDescription: line.lineDescription,
          });
        }
      }
    }

    // Sort by date descending (newest first)
    return lines.sort((a, b) => b.date.localeCompare(a.date));
  }, [member, transactions, categories, year]);

  // Group by category
  const categoryGroups = useMemo(() => {
    const groups: Record<string, { 
      categoryName: string; 
      income: number; 
      expense: number;
      lines: TransactionLineWithContext[];
    }> = {};

    for (const line of memberLines) {
      if (!groups[line.categoryId]) {
        groups[line.categoryId] = {
          categoryName: line.categoryName,
          income: 0,
          expense: 0,
          lines: [],
        };
      }
      if (line.isIncome) {
        groups[line.categoryId].income += line.amount;
      } else {
        groups[line.categoryId].expense += line.amount;
      }
      groups[line.categoryId].lines.push(line);
    }

    return Object.entries(groups).sort((a, b) => 
      a[1].categoryName.localeCompare(b[1].categoryName, 'da')
    );
  }, [memberLines]);

  // Grand totals
  const totals = useMemo(() => {
    return memberLines.reduce(
      (acc, line) => ({
        income: acc.income + (line.isIncome ? line.amount : 0),
        expense: acc.expense + (!line.isIncome ? line.amount : 0),
      }),
      { income: 0, expense: 0 }
    );
  }, [memberLines]);

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  if (!isOpen || !member) return null;

  const memberName = `${member.firstName} ${member.lastName}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{memberName}</h2>
                <p className="text-sm text-gray-500">
                  Transaktionshistorik {year ? year : '(alle år)'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {memberLines.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Ingen transaktioner fundet for dette medlem</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary by Category */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Oversigt pr. kategori</h3>
                  <div className="space-y-2">
                    {categoryGroups.map(([categoryId, group]) => (
                      <div key={categoryId} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Tag className="w-3 h-3 text-gray-400" />
                          {group.categoryName}
                        </span>
                        <div className="flex gap-4">
                          {group.income > 0 && (
                            <span className="text-green-600">+{formatCurrency(group.income)}</span>
                          )}
                          {group.expense > 0 && (
                            <span className="text-red-600">-{formatCurrency(group.expense)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm font-medium pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <div className="flex gap-4">
                        <span className="text-green-700">+{formatCurrency(totals.income)}</span>
                        <span className="text-red-700">-{formatCurrency(totals.expense)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transaction List */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Alle transaktioner</h3>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Dato</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Beskrivelse</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Kategori</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Beløb</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberLines.map((line, idx) => (
                          <tr
                            key={`${line.transactionId}-${idx}`}
                            className="border-b border-gray-100 last:border-b-0"
                          >
                            <td className="px-4 py-2 text-gray-600">{formatDate(line.date)}</td>
                            <td className="px-4 py-2">
                              <div className="text-gray-900">{line.description}</div>
                              {line.lineDescription && (
                                <div className="text-xs text-gray-500">{line.lineDescription}</div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-600">{line.categoryName}</td>
                            <td className={`px-4 py-2 text-right font-medium ${
                              line.isIncome ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {line.isIncome ? '+' : '-'}{formatCurrency(line.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end p-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Luk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
