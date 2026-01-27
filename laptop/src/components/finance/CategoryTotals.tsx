/**
 * Category Totals component.
 * Displays income, expense, and net totals per category.
 */

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { TransactionWithLines, PostingCategory, CategoryTotal } from '../../types';

interface CategoryTotalsProps {
  transactions: TransactionWithLines[];
  categories: PostingCategory[];
}

export function CategoryTotals({ transactions, categories }: CategoryTotalsProps) {
  // Calculate totals per category
  const categoryTotals: CategoryTotal[] = useMemo(() => {
    return categories.map((cat) => {
      let income = 0;
      let expense = 0;

      for (const txn of transactions) {
        for (const line of txn.lines) {
          if (line.categoryId === cat.id) {
            if (line.isIncome) {
              income += line.amount;
            } else {
              expense += line.amount;
            }
          }
        }
      }

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        totalIncome: income,
        totalExpense: expense,
        net: income - expense,
      };
    });
  }, [transactions, categories]);

  // Grand totals
  const grandTotals = useMemo(() => {
    return categoryTotals.reduce(
      (acc, cat) => ({
        income: acc.income + cat.totalIncome,
        expense: acc.expense + cat.totalExpense,
        net: acc.net + cat.net,
      }),
      { income: 0, expense: 0, net: 0 }
    );
  }, [categoryTotals]);

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Kategorioversigt</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2 text-left font-medium text-gray-600">Kategori</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Indtægter</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Udgifter</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Netto</th>
            </tr>
          </thead>
          <tbody>
            {categoryTotals.map((cat) => (
              <tr key={cat.categoryId} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{cat.categoryName}</td>
                <td className="px-4 py-2 text-right text-green-600">
                  {cat.totalIncome > 0 ? formatCurrency(cat.totalIncome) : '-'}
                </td>
                <td className="px-4 py-2 text-right text-red-600">
                  {cat.totalExpense > 0 ? formatCurrency(cat.totalExpense) : '-'}
                </td>
                <td className="px-4 py-2 text-right">
                  <span
                    className={`inline-flex items-center gap-1 ${
                      cat.net > 0
                        ? 'text-green-600'
                        : cat.net < 0
                        ? 'text-red-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {cat.net > 0 && <TrendingUp className="w-3 h-3" />}
                    {cat.net < 0 && <TrendingDown className="w-3 h-3" />}
                    {cat.net === 0 && <Minus className="w-3 h-3" />}
                    {formatCurrency(cat.net)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td className="px-4 py-3 text-gray-900">Total</td>
              <td className="px-4 py-3 text-right text-green-700">
                {formatCurrency(grandTotals.income)}
              </td>
              <td className="px-4 py-3 text-right text-red-700">
                {formatCurrency(grandTotals.expense)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`inline-flex items-center gap-1 ${
                    grandTotals.net > 0
                      ? 'text-green-700'
                      : grandTotals.net < 0
                      ? 'text-red-700'
                      : 'text-gray-600'
                  }`}
                >
                  {grandTotals.net > 0 && <TrendingUp className="w-4 h-4" />}
                  {grandTotals.net < 0 && <TrendingDown className="w-4 h-4" />}
                  {formatCurrency(grandTotals.net)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
