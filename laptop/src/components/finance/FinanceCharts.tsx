/**
 * Finance Charts component for visualizing income and expenses.
 * Shows bar charts and pie charts for category breakdown.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { TransactionWithLines, PostingCategory } from '../../types';

interface FinanceChartsProps {
  transactions: TransactionWithLines[];
  categories: PostingCategory[];
  year: number;
}

// Color palette for charts
const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
];

/**
 * Format amount for tooltip.
 */
function formatAmount(value: number): string {
  return value.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' kr';
}

/**
 * Custom tooltip for charts.
 */
function CustomTooltip({ 
  active, 
  payload, 
  label 
}: { 
  active?: boolean; 
  payload?: Array<{ value: number; name: string; color: string }>; 
  label?: string;
}) {
  if (!active || !payload) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="font-medium text-gray-900 mb-2">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color }} className="text-sm">
          {entry.name}: {formatAmount(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function FinanceCharts({ transactions, categories, year }: FinanceChartsProps) {
  // Calculate category totals
  const categoryData = useMemo(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const incomeByCategory = new Map<string, number>();
    const expenseByCategory = new Map<string, number>();

    transactions.forEach((txn) => {
      txn.lines?.forEach((line) => {
        const categoryName = categoryMap.get(line.categoryId) ?? line.categoryId;
        if (line.isIncome) {
          incomeByCategory.set(
            categoryName,
            (incomeByCategory.get(categoryName) ?? 0) + line.amount
          );
        } else {
          expenseByCategory.set(
            categoryName,
            (expenseByCategory.get(categoryName) ?? 0) + line.amount
          );
        }
      });
    });

    // Build data for bar chart
    const allCategories = new Set([
      ...incomeByCategory.keys(),
      ...expenseByCategory.keys(),
    ]);

    return Array.from(allCategories)
      .map((name) => ({
        name,
        income: incomeByCategory.get(name) ?? 0,
        expense: expenseByCategory.get(name) ?? 0,
      }))
      .sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [transactions, categories]);

  // Calculate monthly totals
  const monthlyData = useMemo(() => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
      'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'
    ];
    
    const monthlyIncome = new Array(12).fill(0);
    const monthlyExpense = new Array(12).fill(0);

    transactions.forEach((txn) => {
      const month = new Date(txn.date).getMonth();
      const totalIn = (txn.cashIn ?? 0) + (txn.bankIn ?? 0);
      const totalOut = (txn.cashOut ?? 0) + (txn.bankOut ?? 0);
      monthlyIncome[month] += totalIn;
      monthlyExpense[month] += totalOut;
    });

    return months.map((name, index) => ({
      name,
      income: monthlyIncome[index],
      expense: monthlyExpense[index],
    }));
  }, [transactions]);

  // Pie chart data for income
  const incomePieData = useMemo(() => {
    return categoryData
      .filter((d) => d.income > 0)
      .map((d) => ({ name: d.name, value: d.income }));
  }, [categoryData]);

  // Pie chart data for expenses
  const expensePieData = useMemo(() => {
    return categoryData
      .filter((d) => d.expense > 0)
      .map((d) => ({ name: d.name, value: d.expense }));
  }, [categoryData]);

  // Calculate totals
  const totals = useMemo(() => {
    const income = transactions.reduce(
      (sum, t) => sum + (t.cashIn ?? 0) + (t.bankIn ?? 0),
      0
    );
    const expense = transactions.reduce(
      (sum, t) => sum + (t.cashOut ?? 0) + (t.bankOut ?? 0),
      0
    );
    return { income, expense, net: income - expense };
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        <p className="text-lg font-medium">Ingen transaktioner at vise</p>
        <p className="text-sm mt-1">Tilføj transaktioner for at se visualiseringer</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <h3 className="text-sm font-medium text-green-700">Total Indtægter</h3>
          <p className="text-2xl font-bold text-green-900 mt-1">
            {formatAmount(totals.income)}
          </p>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <h3 className="text-sm font-medium text-red-700">Total Udgifter</h3>
          <p className="text-2xl font-bold text-red-900 mt-1">
            {formatAmount(totals.expense)}
          </p>
        </div>
        <div className={`rounded-lg p-4 border ${
          totals.net >= 0 
            ? 'bg-blue-50 border-blue-200' 
            : 'bg-orange-50 border-orange-200'
        }`}>
          <h3 className={`text-sm font-medium ${
            totals.net >= 0 ? 'text-blue-700' : 'text-orange-700'
          }`}>
            Resultat {year}
          </h3>
          <p className={`text-2xl font-bold mt-1 ${
            totals.net >= 0 ? 'text-blue-900' : 'text-orange-900'
          }`}>
            {formatAmount(totals.net)}
          </p>
        </div>
      </div>

      {/* Monthly Bar Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Månedlig oversigt {year}
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis 
                tick={{ fontSize: 12 }} 
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="income" name="Indtægter" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Udgifter" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income by Category */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Indtægter pr. kategori
          </h3>
          {incomePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incomePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => 
                      `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {incomePieData.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatAmount(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Ingen indtægter registreret</p>
          )}
        </div>

        {/* Expenses by Category */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Udgifter pr. kategori
          </h3>
          {expensePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => 
                      `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {expensePieData.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatAmount(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Ingen udgifter registreret</p>
          )}
        </div>
      </div>

      {/* Category Bar Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Indtægter vs. Udgifter pr. kategori
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                type="number" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fontSize: 11 }}
                width={120}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="income" name="Indtægter" fill="#10b981" radius={[0, 4, 4, 0]} />
              <Bar dataKey="expense" name="Udgifter" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
