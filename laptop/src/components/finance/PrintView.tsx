/**
 * Print View component for financial transactions.
 * Renders a print-friendly version of the Kassebog.
 */

import { forwardRef } from 'react';
import type { TransactionDisplayRow, PostingCategory, FiscalYear } from '../../types';

interface PrintViewProps {
  fiscalYear: FiscalYear | null;
  transactions: TransactionDisplayRow[];
  categories: PostingCategory[];
  balances: { cash: number; bank: number };
}

/**
 * Format a number as Danish currency.
 */
function formatAmount(amount: number | null): string {
  if (amount === null || amount === 0) return '';
  return amount.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' kr';
}

/**
 * Format ISO date to Danish format.
 */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Get category names from transaction lines.
 */
function getCategoryNames(
  transaction: TransactionDisplayRow,
  categories: PostingCategory[]
): string {
  if (!transaction.lines || transaction.lines.length === 0) return '';
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const uniqueCategories = new Set(
    transaction.lines.map((line) => categoryMap.get(line.categoryId) ?? line.categoryId)
  );
  return Array.from(uniqueCategories).join(', ');
}

export const PrintView = forwardRef<HTMLDivElement, PrintViewProps>(
  function PrintView({ fiscalYear, transactions, categories, balances }, ref) {
    const year = fiscalYear?.year ?? new Date().getFullYear();
    const openingCash = fiscalYear?.openingCashBalance ?? 0;
    const openingBank = fiscalYear?.openingBankBalance ?? 0;

    return (
      <div ref={ref} className="print-view bg-white p-8">
        {/* Print Styles */}
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .print-view, .print-view * {
              visibility: visible;
            }
            .print-view {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 20px;
            }
            .no-print {
              display: none !important;
            }
            table {
              page-break-inside: auto;
            }
            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            thead {
              display: table-header-group;
            }
          }
        `}</style>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Kassebog {year}
          </h1>
          <p className="text-gray-600 mt-1">ISS Skydning</p>
          <p className="text-sm text-gray-500 mt-2">
            Udskrevet: {new Date().toLocaleDateString('da-DK')}
          </p>
        </div>

        {/* Opening Balances */}
        <div className="mb-6 border border-gray-300 rounded p-4">
          <h2 className="text-lg font-semibold mb-3">Primosaldi</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Kasse:</span>
              <span className="ml-2 font-medium">{formatAmount(openingCash)}</span>
            </div>
            <div>
              <span className="text-gray-600">Bank:</span>
              <span className="ml-2 font-medium">{formatAmount(openingBank)}</span>
            </div>
            <div>
              <span className="text-gray-600">Total:</span>
              <span className="ml-2 font-medium">{formatAmount(openingCash + openingBank)}</span>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-2 text-left w-12">#</th>
              <th className="border border-gray-300 px-2 py-2 text-left w-24">Dato</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Beskrivelse</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">Kasse Ind</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">Kasse Ud</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">Bank Ind</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">Bank Ud</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">S.Kasse</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">S.Bank</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Kategorier</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn) => (
              <tr key={txn.id} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-2 py-1">{txn.sequenceNumber}</td>
                <td className="border border-gray-300 px-2 py-1">{formatDate(txn.date)}</td>
                <td className="border border-gray-300 px-2 py-1">{txn.description}</td>
                <td className="border border-gray-300 px-2 py-1 text-right text-green-700">
                  {formatAmount(txn.cashIn)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right text-red-700">
                  {formatAmount(txn.cashOut)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right text-green-700">
                  {formatAmount(txn.bankIn)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right text-red-700">
                  {formatAmount(txn.bankOut)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right font-medium">
                  {formatAmount(txn.runningCashBalance)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right font-medium">
                  {formatAmount(txn.runningBankBalance)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-xs text-gray-600">
                  {getCategoryNames(txn, categories)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Closing Balances */}
        <div className="mt-6 border border-gray-300 rounded p-4">
          <h2 className="text-lg font-semibold mb-3">Ultimosaldi</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Kasse:</span>
              <span className="ml-2 font-bold">{formatAmount(balances.cash)}</span>
            </div>
            <div>
              <span className="text-gray-600">Bank:</span>
              <span className="ml-2 font-bold">{formatAmount(balances.bank)}</span>
            </div>
            <div>
              <span className="text-gray-600">Total:</span>
              <span className="ml-2 font-bold">{formatAmount(balances.cash + balances.bank)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
          <p>Kassebog genereret fra Medlems Admin</p>
        </div>
      </div>
    );
  }
);
