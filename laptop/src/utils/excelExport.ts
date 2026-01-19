/**
 * Excel export utility for Kassebog.
 * Exports financial transactions matching the Kassebog 2025.xlsx format.
 */

import * as XLSX from 'xlsx';
import type {
  TransactionWithLines,
  PostingCategory,
  FiscalYear,
} from '../types';

interface ExportData {
  fiscalYear: FiscalYear;
  transactions: TransactionWithLines[];
  categories: PostingCategory[];
}

/**
 * Category order for export columns (matches Kassebog 2025.xlsx).
 * Each category gets 2 columns: Income (Ind) and Expense (Ud).
 */
const CATEGORY_ORDER = [
  'AMMO',        // Patroner/skiver
  'COMPETITION', // Kapskydning/præmier
  'FEES',        // Kontingent/Bestyrelse
  'EQUIPMENT',   // Våben/vedligeholdelse
  'ADMIN',       // Porto/Kontoart
  'GIFTS',       // Begr/gaver/støtte
  'OTHER',       // Diverse/renter/gebyr
  'SUBSIDIES',   // Tilskud/kontingent hovedafdeling
  'UTILITIES',   // Vand
];

/**
 * Export Kassebog to Excel file.
 * Matches the structure of Kassebog 2025.xlsx.
 */
export function exportKassebog(data: ExportData): void {
  const { fiscalYear, transactions, categories } = data;
  const year = fiscalYear.year;

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Build ordered category list
  const orderedCategories = CATEGORY_ORDER.map((id) =>
    categories.find((c) => c.id === id)
  ).filter((c): c is PostingCategory => c !== undefined);

  // Create Kassebog sheet
  const kassebogData = buildKassebogSheet(fiscalYear, transactions, orderedCategories);
  const wsSheet = XLSX.utils.aoa_to_sheet(kassebogData);
  
  // Set column widths
  wsSheet['!cols'] = [
    { wch: 5 },   // #
    { wch: 12 },  // Dato
    { wch: 30 },  // Beskrivelse
    { wch: 10 },  // Kasse Ind
    { wch: 10 },  // Kasse Ud
    { wch: 10 },  // Bank Ind
    { wch: 10 },  // Bank Ud
    ...orderedCategories.flatMap(() => [{ wch: 10 }, { wch: 10 }]),
  ];

  XLSX.utils.book_append_sheet(wb, wsSheet, 'Kassebog');

  // Create Årsresultat sheet
  const aarsresultatData = buildAarsresultatSheet(fiscalYear, transactions, orderedCategories);
  const wsAarsresultat = XLSX.utils.aoa_to_sheet(aarsresultatData);
  
  // Set column widths for Årsresultat
  wsAarsresultat['!cols'] = [
    { wch: 5 },   // Empty
    { wch: 5 },   // Empty
    { wch: 35 },  // Description
    { wch: 5 },   // Empty
    { wch: 5 },   // Empty
    { wch: 15 },  // Amount
    { wch: 15 },  // Total
  ];

  XLSX.utils.book_append_sheet(wb, wsAarsresultat, 'Årsresultat');

  // Generate filename with year
  const filename = `Kassebog ${year}.xlsx`;

  // Download file
  XLSX.writeFile(wb, filename);
}

/**
 * Build the Kassebog sheet data as 2D array.
 */
function buildKassebogSheet(
  fiscalYear: FiscalYear,
  transactions: TransactionWithLines[],
  categories: PostingCategory[]
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];

  // Row 1: Category headers (merged cells would go here, but XLSX doesn't support easy merging)
  const headerRow1: (string | number | null)[] = [
    null, null, null, // #, Dato, Beskrivelse
    null, null, // Kasse
    null, null, // Bank
  ];
  for (const cat of categories) {
    headerRow1.push(cat.name, null); // Category name spans 2 cols
  }
  rows.push(headerRow1);

  // Row 2: Column subheaders
  const headerRow2: (string | number | null)[] = [
    '#',
    'Dato',
    'Beskrivelse',
    'Kasse Ind',
    'Kasse Ud',
    'Bank Ind',
    'Bank Ud',
  ];
  for (let i = 0; i < categories.length; i++) {
    headerRow2.push('Ind', 'Ud');
  }
  rows.push(headerRow2);

  // Row 3: Opening balances (marked with # as sequence)
  const openingRow: (string | number | null)[] = [
    '#',
    formatDate(new Date(`${fiscalYear.year}-01-01`)),
    `Overført fra ${fiscalYear.year - 1}`,
    fiscalYear.openingCashBalance || null,
    null,
    fiscalYear.openingBankBalance || null,
    null,
  ];
  // Empty category columns for opening balance
  for (let i = 0; i < categories.length; i++) {
    openingRow.push(null, null);
  }
  rows.push(openingRow);

  // Transaction rows
  for (const txn of transactions) {
    const row: (string | number | null)[] = [
      txn.sequenceNumber,
      formatDate(new Date(txn.date)),
      txn.description,
      txn.cashIn || null,
      txn.cashOut || null,
      txn.bankIn || null,
      txn.bankOut || null,
    ];

    // Category amounts
    for (const cat of categories) {
      const catLines = txn.lines.filter((l) => l.categoryId === cat.id);
      let income = 0;
      let expense = 0;
      for (const line of catLines) {
        if (line.isIncome) {
          income += line.amount;
        } else {
          expense += line.amount;
        }
      }
      row.push(income || null, expense || null);
    }

    rows.push(row);
  }

  // Summary row (optional - totals)
  const summaryRow: (string | number | null)[] = [
    null,
    null,
    'TOTAL',
    sumColumn(transactions, 'cashIn'),
    sumColumn(transactions, 'cashOut'),
    sumColumn(transactions, 'bankIn'),
    sumColumn(transactions, 'bankOut'),
  ];
  for (const cat of categories) {
    let totalIncome = 0;
    let totalExpense = 0;
    for (const txn of transactions) {
      for (const line of txn.lines) {
        if (line.categoryId === cat.id) {
          if (line.isIncome) {
            totalIncome += line.amount;
          } else {
            totalExpense += line.amount;
          }
        }
      }
    }
    summaryRow.push(totalIncome || null, totalExpense || null);
  }
  rows.push(summaryRow);

  return rows;
}

/**
 * Format date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Sum a numeric column from transactions.
 */
function sumColumn(
  transactions: TransactionWithLines[],
  field: 'cashIn' | 'cashOut' | 'bankIn' | 'bankOut'
): number | null {
  const sum = transactions.reduce((acc, txn) => acc + (txn[field] ?? 0), 0);
  return sum || null;
}

/**
 * Export category totals summary (Årsresultat).
 * Matches the Kassebog 2025.xlsx Årsresultat sheet format.
 */
function buildAarsresultatSheet(
  fiscalYear: FiscalYear,
  transactions: TransactionWithLines[],
  categories: PostingCategory[]
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  const year = fiscalYear.year;

  // Calculate category totals
  const categoryTotals = categories.map((cat) => {
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
    return { id: cat.id, name: cat.name, income, expense };
  });

  const totalIncome = categoryTotals.reduce((sum, c) => sum + c.income, 0);
  const totalExpense = categoryTotals.reduce((sum, c) => sum + c.expense, 0);
  const yearResult = totalIncome - totalExpense;

  // Calculate closing balances
  const closingCash =
    fiscalYear.openingCashBalance +
    transactions.reduce((sum, t) => sum + (t.cashIn ?? 0) - (t.cashOut ?? 0), 0);
  const closingBank =
    fiscalYear.openingBankBalance +
    transactions.reduce((sum, t) => sum + (t.bankIn ?? 0) - (t.bankOut ?? 0), 0);
  const openingTotal = fiscalYear.openingCashBalance + fiscalYear.openingBankBalance;

  // Row 1-2: Empty
  rows.push([]);
  rows.push([]);

  // Row 3: Title
  rows.push([null, null, `Regnskab for Iss-Skydning  01-01-${year} til 31-12-${year}`]);

  // Row 4: Empty
  rows.push([]);

  // Row 5: Indtægter header
  rows.push([null, null, 'Indtægter']);

  // Row 6: Empty
  rows.push([]);

  // Rows 7-15: Income by category
  for (const cat of categoryTotals) {
    if (cat.income > 0) {
      rows.push([null, null, cat.name, null, null, cat.income]);
    }
  }

  // Income total row
  rows.push([null, null, null, null, null, null, totalIncome]);

  // Row: Empty
  rows.push([]);

  // Udgifter header
  rows.push([null, null, 'Udgifter']);

  // Row: Empty
  rows.push([]);

  // Expense by category
  for (const cat of categoryTotals) {
    if (cat.expense > 0) {
      rows.push([null, null, cat.name, null, null, cat.expense]);
    }
  }

  // Expense total row
  rows.push([null, null, null, null, null, null, totalExpense]);

  // Resultat row
  rows.push([null, null, 'Resultat', null, null, null, yearResult]);

  // Empty rows
  rows.push([]);
  rows.push([]);

  // Likvide beholdning section
  rows.push([null, null, `Likvide beholdning 1/1/${year}`, null, null, openingTotal]);
  rows.push([null, null, `Resultat ${year}`, null, null, yearResult, openingTotal + yearResult]);

  // Empty row
  rows.push([]);

  // Closing balances
  rows.push([null, null, `Beholdning, kasse 31/12/${year}`, null, null, closingCash]);
  rows.push([null, null, `Beholdning, bank 31/12/${year}`, null, null, closingBank, closingCash + closingBank]);

  // Empty rows
  rows.push([]);
  rows.push([]);

  // Signature section
  rows.push([null, null, 'Kasserer']);

  // Empty rows for signature
  rows.push([]);
  rows.push([]);
  rows.push([]);
  rows.push([]);
  rows.push([]);

  // Revisor section
  rows.push([null, null, 'Ovennævnte regnskab og status er revideret og fundet i orden']);
  rows.push([null, null, 'Skævinge den ']);

  // Empty rows
  rows.push([]);
  rows.push([]);

  rows.push([null, null, 'Revisor']);

  return rows;
}
