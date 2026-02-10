/**
 * Transaction Table Component.
 * Displays financial transactions in a tabular format with running balances.
 * 
 * @see [prd.md] - Financial Transactions Management
 */

import { Pencil, Trash2, Wallet, Printer } from 'lucide-react';
import type { TransactionDisplayRow, PostingCategory } from '../../types/finance';

export interface TransactionTableProps {
  transactions: TransactionDisplayRow[];
  categories: PostingCategory[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPrint: (id: string) => void;
}

/**
 * Format a number as Danish currency (kr suffix).
 */
function formatAmount(amount: number | null): string {
  if (amount === null || amount === 0) return '';
  return amount.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' kr';
}

/**
 * Format a signed amount with +/- prefix.
 */
function formatSignedAmount(amount: number): string {
  if (amount === 0) return '';
  const sign = amount > 0 ? '+' : '';
  return sign + amount.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' kr';
}

/**
 * Format ISO date (YYYY-MM-DD) to Danish format (DD-MM-YYYY).
 */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Get CSS classes for amount styling (green for positive, red for negative).
 */
function getAmountClasses(amount: number): string {
  if (amount > 0) return 'text-green-600';
  if (amount < 0) return 'text-red-600';
  return 'text-gray-400';
}

/**
 * Calculate net cash amount (in - out) from a transaction.
 */
function getNetCash(transaction: TransactionDisplayRow): number {
  const cashIn = transaction.cashIn ?? 0;
  const cashOut = transaction.cashOut ?? 0;
  return cashIn - cashOut;
}

/**
 * Calculate net bank amount (in - out) from a transaction.
 */
function getNetBank(transaction: TransactionDisplayRow): number {
  const bankIn = transaction.bankIn ?? 0;
  const bankOut = transaction.bankOut ?? 0;
  return bankIn - bankOut;
}

/**
 * Get category names from transaction lines.
 */
function getCategoryNames(
  transaction: TransactionDisplayRow,
  categories: PostingCategory[]
): string {
  if (!transaction.lines || transaction.lines.length === 0) {
    return '';
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const uniqueCategories = new Set(
    transaction.lines.map((line) => categoryMap.get(line.categoryId) ?? line.categoryId)
  );

  return Array.from(uniqueCategories).join(', ');
}

export function TransactionTable({
  transactions,
  categories,
  onEdit,
  onDelete,
  onPrint,
}: TransactionTableProps) {
  // Empty state
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">Ingen transaktioner endnu</p>
          <p className="text-sm mt-1">
            Klik "Ny transaktion" for at tilføje den første
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-auto max-h-[70vh] -mx-px">
        <table className="min-w-[900px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-2 md:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10 md:w-12"
              >
                #
              </th>
              <th
                scope="col"
                className="px-2 md:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 md:w-28"
              >
                Dato
              </th>
              <th
                scope="col"
                className="px-2 md:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
              >
                Beskrivelse
              </th>
              <th
                scope="col"
                className="px-2 md:px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24 md:w-28"
              >
                Kasse
              </th>
              <th
                scope="col"
                className="px-2 md:px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24 md:w-28"
              >
                Bank
              </th>
              <th
                scope="col"
                className="hidden lg:table-cell px-2 md:px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24 md:w-28"
              >
                S.Kasse
              </th>
              <th
                scope="col"
                className="hidden lg:table-cell px-2 md:px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24 md:w-28"
              >
                S.Bank
              </th>
              <th
                scope="col"
                className="hidden md:table-cell px-2 md:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Kategorier
              </th>
              <th
                scope="col"
                className="px-2 md:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20 md:w-24"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map((transaction) => {
              const netCash = getNetCash(transaction);
              const netBank = getNetBank(transaction);
              const categoryNames = getCategoryNames(transaction, categories);

              return (
                <tr
                  key={transaction.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Sequence Number */}
                  <td className="px-2 md:px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {transaction.sequenceNumber}
                  </td>

                  {/* Date */}
                  <td className="px-2 md:px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(transaction.date)}
                  </td>

                  {/* Description */}
                  <td className="px-2 md:px-3 py-3 text-sm text-gray-900">
                    <div className="max-w-[120px] md:max-w-xs truncate" title={transaction.description}>
                      {transaction.description}
                    </div>
                  </td>

                  {/* Cash (net) */}
                  <td
                    className={`px-2 md:px-3 py-3 whitespace-nowrap text-sm text-right font-medium ${getAmountClasses(netCash)}`}
                  >
                    {netCash !== 0 ? formatSignedAmount(netCash) : ''}
                  </td>

                  {/* Bank (net) */}
                  <td
                    className={`px-2 md:px-3 py-3 whitespace-nowrap text-sm text-right font-medium ${getAmountClasses(netBank)}`}
                  >
                    {netBank !== 0 ? formatSignedAmount(netBank) : ''}
                  </td>

                  {/* Running Cash Balance - hidden on smaller screens */}
                  <td className="hidden lg:table-cell px-2 md:px-3 py-3 whitespace-nowrap text-sm text-right text-gray-700 font-medium">
                    {formatAmount(transaction.runningCashBalance)}
                  </td>

                  {/* Running Bank Balance - hidden on smaller screens */}
                  <td className="hidden lg:table-cell px-2 md:px-3 py-3 whitespace-nowrap text-sm text-right text-gray-700 font-medium">
                    {formatAmount(transaction.runningBankBalance)}
                  </td>

                  {/* Categories - hidden on small screens */}
                  <td className="hidden md:table-cell px-2 md:px-3 py-3 text-sm text-gray-500">
                    <div className="max-w-xs truncate" title={categoryNames}>
                      {categoryNames}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-2 md:px-3 py-3 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onPrint(transaction.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Udskriv"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onEdit(transaction.id)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Rediger"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(transaction.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Slet"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
