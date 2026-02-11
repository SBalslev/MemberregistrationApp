/**
 * Print View component for a single transaction.
 * Renders a print-friendly summary with income and expense details.
 */

import type { PostingCategory, TransactionWithLines } from '../../types/finance';
import type { Member } from '../../types/entities';

interface TransactionPrintViewProps {
  transaction: TransactionWithLines | null;
  categories: PostingCategory[];
  members: Member[];
  fiscalYear: number;
}

/**
 * Format a number as Danish currency.
 */
function formatAmount(amount: number): string {
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

function sortLinesByCategory(
  lines: TransactionWithLines['lines'],
  categories: PostingCategory[]
) {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return [...lines].sort((a, b) => {
    const catA = categoryMap.get(a.categoryId);
    const catB = categoryMap.get(b.categoryId);
    const orderA = catA?.sortOrder ?? 999;
    const orderB = catB?.sortOrder ?? 999;

    if (orderA !== orderB) return orderA - orderB;

    const nameA = catA?.name ?? a.categoryId;
    const nameB = catB?.name ?? b.categoryId;
    const nameCompare = nameA.localeCompare(nameB, 'da');
    if (nameCompare !== 0) return nameCompare;

    const descA = a.lineDescription ?? '';
    const descB = b.lineDescription ?? '';
    return descA.localeCompare(descB, 'da');
  });
}

function sumLines(lines: TransactionWithLines['lines']) {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

function buildCategoryTotals(
  lines: TransactionWithLines['lines'],
  categories: PostingCategory[]
) {
  const categoryInfo = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  lines.forEach((line) => {
    totals.set(line.categoryId, (totals.get(line.categoryId) ?? 0) + line.amount);
  });

  return Array.from(totals.entries())
    .map(([categoryId, amount]) => {
      const category = categoryInfo.get(categoryId);
      return {
        categoryId,
        categoryName: category?.name ?? categoryId,
        sortOrder: category?.sortOrder ?? 999,
        amount,
      };
    })
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.categoryName.localeCompare(b.categoryName, 'da');
    });
}

export function TransactionPrintView({
  transaction,
  categories,
  members,
  fiscalYear,
}: TransactionPrintViewProps) {
  if (!transaction) return null;

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const memberMap = new Map(members.map((m) => [m.internalId, `${m.firstName} ${m.lastName}`.trim()]));

  const sortedLines = sortLinesByCategory(transaction.lines, categories);
  const incomeLines = sortedLines.filter((line) => line.isIncome);
  const expenseLines = sortedLines.filter((line) => !line.isIncome);

  const incomeTotal = sumLines(incomeLines);
  const expenseTotal = sumLines(expenseLines);

  const cashIn = transaction.cashIn ?? 0;
  const cashOut = transaction.cashOut ?? 0;
  const bankIn = transaction.bankIn ?? 0;
  const bankOut = transaction.bankOut ?? 0;

  const incomeCategoryTotals = buildCategoryTotals(incomeLines, categories);
  const expenseCategoryTotals = buildCategoryTotals(expenseLines, categories);

  return (
    <div className="p-6">
      <style>{`
        @media print {
          th,
          td {
            padding: 4px 6px !important;
          }
          .print-compact {
            margin-top: 12px;
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
          tfoot {
            display: table-footer-group;
          }
        }
      `}</style>
      <div className="flex items-center justify-between border-b border-gray-300 pb-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Transaktion</h1>
          <p className="text-sm text-gray-600">Regnskabsår {fiscalYear}</p>
        </div>
        <div className="text-right text-sm text-gray-700">
          <div>Bilag #{transaction.sequenceNumber}</div>
          <div className="text-xs text-gray-500">ID: {transaction.id}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Dato</div>
          <div className="font-medium text-gray-900">{formatDate(transaction.date)}</div>
        </div>
        <div>
          <div className="text-gray-500">Beskrivelse</div>
          <div className="font-medium text-gray-900">{transaction.description}</div>
        </div>
        {transaction.notes && (
          <div className="col-span-2">
            <div className="text-gray-500">Noter</div>
            <div className="font-medium text-gray-900">{transaction.notes}</div>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="font-medium text-gray-700 mb-2">Kasse og bank</div>
          <div className="grid grid-cols-2 gap-1">
            <span className="text-gray-500">Kasse ind</span>
            <span className="text-right font-medium">{formatAmount(cashIn)}</span>
            <span className="text-gray-500">Kasse ud</span>
            <span className="text-right font-medium">{formatAmount(cashOut)}</span>
            <span className="text-gray-500">Bank ind</span>
            <span className="text-right font-medium">{formatAmount(bankIn)}</span>
            <span className="text-gray-500">Bank ud</span>
            <span className="text-right font-medium">{formatAmount(bankOut)}</span>
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="font-medium text-gray-700 mb-2">Linjernes total</div>
          <div className="grid grid-cols-2 gap-1">
            <span className="text-gray-500">Indtægter</span>
            <span className="text-right font-medium">{formatAmount(incomeTotal)}</span>
            <span className="text-gray-500">Udgifter</span>
            <span className="text-right font-medium">{formatAmount(expenseTotal)}</span>
            <span className="text-gray-500">Netto</span>
            <span className="text-right font-medium">{formatAmount(incomeTotal - expenseTotal)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
          <div className="font-medium text-blue-800 mb-2">Indtægter pr. kategori</div>
          <div className="space-y-1">
            {incomeCategoryTotals.length === 0 ? (
              <div className="text-gray-500">Ingen indtægter</div>
            ) : (
              incomeCategoryTotals.map((item) => (
                <div key={item.categoryId} className="flex items-center justify-between">
                  <span className="text-blue-700">{item.categoryName}</span>
                  <span className="font-medium text-blue-900">{formatAmount(item.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="border border-red-200 rounded-lg p-3 bg-red-50">
          <div className="font-medium text-red-800 mb-2">Udgifter pr. kategori</div>
          <div className="space-y-1">
            {expenseCategoryTotals.length === 0 ? (
              <div className="text-gray-500">Ingen udgifter</div>
            ) : (
              expenseCategoryTotals.map((item) => (
                <div key={item.categoryId} className="flex items-center justify-between">
                  <span className="text-red-700">{item.categoryName}</span>
                  <span className="font-medium text-red-900">{formatAmount(item.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Indtægter</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-2 text-left">Kategori</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Beskrivelse</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Medlem</th>
              <th className="border border-gray-300 px-2 py-2 text-left w-20">Kilde</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">Beløb</th>
            </tr>
          </thead>
          <tbody>
            {incomeLines.map((line) => (
              <tr key={line.id}>
                <td className="border border-gray-300 px-2 py-2">
                  {categoryMap.get(line.categoryId) ?? line.categoryId}
                </td>
                <td className="border border-gray-300 px-2 py-2">
                  {line.lineDescription ?? ''}
                </td>
                <td className="border border-gray-300 px-2 py-2">
                  {line.memberId ? (memberMap.get(line.memberId) ?? '') : ''}
                </td>
                <td className="border border-gray-300 px-2 py-2">{line.source === 'CASH' ? 'Kasse' : 'Bank'}</td>
                <td className="border border-gray-300 px-2 py-2 text-right">
                  {formatAmount(line.amount)}
                </td>
              </tr>
            ))}
            {incomeLines.length === 0 && (
              <tr>
                <td className="border border-gray-300 px-2 py-2 text-center text-gray-500" colSpan={5}>
                  Ingen indtægtslinjer
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Udgifter</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-2 text-left">Kategori</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Beskrivelse</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Medlem</th>
              <th className="border border-gray-300 px-2 py-2 text-left w-20">Kilde</th>
              <th className="border border-gray-300 px-2 py-2 text-right w-24">Beløb</th>
            </tr>
          </thead>
          <tbody>
            {expenseLines.map((line) => (
              <tr key={line.id}>
                <td className="border border-gray-300 px-2 py-2">
                  {categoryMap.get(line.categoryId) ?? line.categoryId}
                </td>
                <td className="border border-gray-300 px-2 py-2">
                  {line.lineDescription ?? ''}
                </td>
                <td className="border border-gray-300 px-2 py-2">
                  {line.memberId ? (memberMap.get(line.memberId) ?? '') : ''}
                </td>
                <td className="border border-gray-300 px-2 py-2">{line.source === 'CASH' ? 'Kasse' : 'Bank'}</td>
                <td className="border border-gray-300 px-2 py-2 text-right">
                  {formatAmount(line.amount)}
                </td>
              </tr>
            ))}
            {expenseLines.length === 0 && (
              <tr>
                <td className="border border-gray-300 px-2 py-2 text-center text-gray-500" colSpan={5}>
                  Ingen udgiftslinjer
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
