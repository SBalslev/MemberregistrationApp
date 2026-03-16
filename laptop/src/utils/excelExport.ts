/**
 * Excel export utility for Kassebog.
 * Exports financial transactions matching the Kassebog 2025.xlsx format.
 */

import * as XLSX from 'xlsx-js-style';
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
 * Supports legacy category IDs from older data.
 */
const CATEGORY_ALIAS_GROUPS = [
  { ids: ['AMMO'] },
  { ids: ['COMP', 'COMPETITION'] },
  { ids: ['FEES', 'cat-kontingent'] },
  { ids: ['WEAP', 'EQUIPMENT'] },
  { ids: ['OFFC', 'ADMIN'] },
  { ids: ['GIFT', 'GIFTS'] },
  { ids: ['MISC', 'OTHER'] },
  { ids: ['SUBS', 'SUBSIDIES'] },
  { ids: ['UTIL', 'UTILITIES'] },
  { ids: ['XFER'] },
];

const CATEGORY_ALIAS_MAP = new Map<string, string[]>();
for (const group of CATEGORY_ALIAS_GROUPS) {
  for (const id of group.ids) {
    CATEGORY_ALIAS_MAP.set(id, group.ids);
  }
}

function getCategoryMatchIds(categoryId: string): string[] {
  return CATEGORY_ALIAS_MAP.get(categoryId) ?? [categoryId];
}

function getExportCategories(categories: PostingCategory[]): PostingCategory[] {
  const orderedCategories = CATEGORY_ALIAS_GROUPS.map((group) =>
    group.ids.map((id) => categories.find((c) => c.id === id)).find((c) => c !== undefined)
  ).filter((c): c is PostingCategory => c !== undefined);
  const orderedCategoryIds = new Set(orderedCategories.map((cat) => cat.id));
  const remainingCategories = categories
    .filter((cat) => !orderedCategoryIds.has(cat.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return [...orderedCategories, ...remainingCategories];
}

export function getMissingExportCategoryIds(
  transactions: TransactionWithLines[],
  categories: PostingCategory[]
): string[] {
  return getMissingExportCategoryCounts(transactions, categories)
    .map((item) => item.categoryId)
    .sort();
}

export function getMissingExportCategoryCounts(
  transactions: TransactionWithLines[],
  categories: PostingCategory[]
): { categoryId: string; count: number }[] {
  const exportCategories = getExportCategories(categories);
  const allowedCategoryIds = new Set<string>();
  for (const category of exportCategories) {
    for (const id of getCategoryMatchIds(category.id)) {
      allowedCategoryIds.add(id);
    }
  }

  const counts = new Map<string, number>();
  for (const txn of transactions) {
    for (const line of txn.lines) {
      if (!allowedCategoryIds.has(line.categoryId)) {
        counts.set(line.categoryId, (counts.get(line.categoryId) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([categoryId, count]) => ({ categoryId, count }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId));
}

const CURRENCY_FORMAT = '#,##0.00 "kr"';

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'D0D0D0' } },
  bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
  left: { style: 'thin', color: { rgb: 'D0D0D0' } },
  right: { style: 'thin', color: { rgb: 'D0D0D0' } },
};

const STYLE_HEADER_GROUP: Record<string, unknown> = {
  font: { bold: true },
  alignment: { horizontal: 'center', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } },
  border: THIN_BORDER,
};

const STYLE_HEADER: Record<string, unknown> = {
  font: { bold: true },
  alignment: { horizontal: 'center', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } },
  border: THIN_BORDER,
};

const STYLE_INCOME_HEADER: Record<string, unknown> = {
  font: { bold: true, color: { rgb: '006100' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'E2F0D9' } },
};

const STYLE_EXPENSE_HEADER: Record<string, unknown> = {
  font: { bold: true, color: { rgb: '9C0006' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FCE4D6' } },
};

const STYLE_OPENING: Record<string, unknown> = {
  fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } },
};

const STYLE_ALT_ROW: Record<string, unknown> = {
  fill: { patternType: 'solid', fgColor: { rgb: 'F9F9F9' } },
};

const STYLE_SUMMARY: Record<string, unknown> = {
  font: { bold: true, color: { rgb: '000000' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'DDEBF7' } },
  border: THIN_BORDER,
};

const STYLE_SECTION_HEADER: Record<string, unknown> = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } },
};

const STYLE_INCOME_TEXT: Record<string, unknown> = {
  font: { color: { rgb: '006100' } },
};

const STYLE_EXPENSE_TEXT: Record<string, unknown> = {
  font: { color: { rgb: '9C0006' } },
};

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
  const exportCategories = getExportCategories(categories);

  // Create Kassebog sheet
  const kassebogData = buildKassebogSheet(fiscalYear, transactions, exportCategories);
  const wsSheet = XLSX.utils.aoa_to_sheet(kassebogData);
  applyKassebogStyles(wsSheet, kassebogData, exportCategories.length);
  
  // Set column widths
  wsSheet['!cols'] = [
    { wch: 5 },   // #
    { wch: 12 },  // Dato
    { wch: 30 },  // Beskrivelse
    { wch: 10 },  // Kasse Ind
    { wch: 10 },  // Kasse Ud
    { wch: 10 },  // Bank Ind
    { wch: 10 },  // Bank Ud
    ...exportCategories.flatMap(() => [{ wch: 10 }, { wch: 10 }]),
  ];

  XLSX.utils.book_append_sheet(wb, wsSheet, 'Kassebog');

  // Create Årsresultat sheet
  const aarsresultatData = buildAarsresultatSheet(fiscalYear, transactions, exportCategories);
  const wsAarsresultat = XLSX.utils.aoa_to_sheet(aarsresultatData);
  applyAarsresultatStyles(wsAarsresultat, aarsresultatData);
  
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
      const matchIds = getCategoryMatchIds(cat.id);
      const catLines = txn.lines.filter((l) => matchIds.includes(l.categoryId));
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
    const matchIds = getCategoryMatchIds(cat.id);
    let totalIncome = 0;
    let totalExpense = 0;
    for (const txn of transactions) {
      for (const line of txn.lines) {
        if (matchIds.includes(line.categoryId)) {
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

function mergeStyle(
  base: Record<string, unknown> | undefined,
  next: Record<string, unknown>
): Record<string, unknown> {
  const baseFont = (base?.font ?? {}) as Record<string, unknown>;
  const nextFont = (next.font ?? {}) as Record<string, unknown>;
  const baseAlignment = (base?.alignment ?? {}) as Record<string, unknown>;
  const nextAlignment = (next.alignment ?? {}) as Record<string, unknown>;

  return {
    ...base,
    ...next,
    font: { ...baseFont, ...nextFont },
    alignment: { ...baseAlignment, ...nextAlignment },
    fill: next.fill ?? base?.fill,
    border: next.border ?? base?.border,
    numFmt: next.numFmt ?? base?.numFmt,
  };
}

function applyCellStyle(
  ws: XLSX.WorkSheet,
  row: number,
  col: number,
  style: Record<string, unknown>
): void {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = ws[address];
  if (!cell) return;
  const merged = mergeStyle(cell.s as Record<string, unknown> | undefined, style);
  cell.s = merged;
  if (merged.numFmt && typeof merged.numFmt === 'string') {
    cell.z = merged.numFmt;
  }
}

function applyRowStyle(
  ws: XLSX.WorkSheet,
  row: number,
  startCol: number,
  endCol: number,
  style: Record<string, unknown>
): void {
  for (let col = startCol; col <= endCol; col++) {
    applyCellStyle(ws, row, col, style);
  }
}

function applyCurrencyIfNumber(
  ws: XLSX.WorkSheet,
  row: number,
  col: number
): void {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = ws[address];
  if (!cell || typeof cell.v !== 'number') return;
  applyCellStyle(ws, row, col, { numFmt: CURRENCY_FORMAT });
}

function applyKassebogStyles(
  ws: XLSX.WorkSheet,
  rows: (string | number | null)[][],
  categoryCount: number
): void {
  if (rows.length === 0) return;
  const lastCol = rows[0].length - 1;
  const summaryRow = rows.length - 1;
  const firstTransactionRow = 3;

  applyRowStyle(ws, 0, 0, lastCol, STYLE_HEADER_GROUP);
  applyRowStyle(ws, 1, 0, lastCol, STYLE_HEADER);
  applyRowStyle(ws, 2, 0, lastCol, STYLE_OPENING);

  const incomeCols = [3, 5];
  const expenseCols = [4, 6];
  for (let i = 0; i < categoryCount; i++) {
    const base = 7 + i * 2;
    incomeCols.push(base);
    expenseCols.push(base + 1);
  }

  for (const col of incomeCols) {
    applyCellStyle(ws, 1, col, STYLE_INCOME_HEADER);
  }
  for (const col of expenseCols) {
    applyCellStyle(ws, 1, col, STYLE_EXPENSE_HEADER);
  }

  for (let row = 2; row <= summaryRow; row++) {
    for (let col = 3; col <= lastCol; col++) {
      applyCurrencyIfNumber(ws, row, col);
    }
  }

  for (let row = firstTransactionRow; row < summaryRow; row++) {
    if ((row - firstTransactionRow) % 2 === 1) {
      applyRowStyle(ws, row, 0, lastCol, STYLE_ALT_ROW);
    }
  }

  for (let row = 2; row < summaryRow; row++) {
    for (const col of incomeCols) {
      applyCellStyle(ws, row, col, STYLE_INCOME_TEXT);
    }
    for (const col of expenseCols) {
      applyCellStyle(ws, row, col, STYLE_EXPENSE_TEXT);
    }
  }

  applyRowStyle(ws, summaryRow, 0, lastCol, STYLE_SUMMARY);
}

function applyAarsresultatStyles(
  ws: XLSX.WorkSheet,
  rows: (string | number | null)[][]
): void {
  let section: 'income' | 'expense' | null = null;

  for (let row = 0; row < rows.length; row++) {
    const label = rows[row]?.[2];
    if (label === 'Indtægter') {
      section = 'income';
      applyCellStyle(ws, row, 2, STYLE_SECTION_HEADER);
    } else if (label === 'Udgifter') {
      section = 'expense';
      applyCellStyle(ws, row, 2, STYLE_SECTION_HEADER);
    } else if (label === 'Resultat') {
      section = null;
      applyRowStyle(ws, row, 2, 6, STYLE_SUMMARY);
    } else if (typeof label === 'string' && label.includes('Regnskab for')) {
      applyCellStyle(ws, row, 2, { font: { bold: true } });
    }

    const amountCols = [5, 6];
    for (const col of amountCols) {
      applyCurrencyIfNumber(ws, row, col);
      if (section === 'income') {
        applyCellStyle(ws, row, col, STYLE_INCOME_TEXT);
      } else if (section === 'expense') {
        applyCellStyle(ws, row, col, STYLE_EXPENSE_TEXT);
      }
    }

    const isTotalRow = label === null && typeof rows[row]?.[6] === 'number';
    if (isTotalRow) {
      applyRowStyle(ws, row, 2, 6, STYLE_SUMMARY);
    }
  }
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
    const matchIds = getCategoryMatchIds(cat.id);
    let income = 0;
    let expense = 0;
    for (const txn of transactions) {
      for (const line of txn.lines) {
        if (matchIds.includes(line.categoryId)) {
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
