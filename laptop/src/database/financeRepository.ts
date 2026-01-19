/**
 * Finance repository - data access layer for financial transactions (Kassebog).
 */

import { query, execute, transaction } from './db';
import type {
  PostingCategory,
  FiscalYear,
  FeeRate,
  FinancialTransaction,
  TransactionLine,
  TransactionWithLines,
  CategoryTotal,
  MemberFeeStatus,
  RunningBalances,
  MemberType,
  PaymentMethod,
  PendingFeePayment,
  PendingFeePaymentWithMember,
} from '../types';

// ===== Posting Categories =====

/**
 * Get all active posting categories.
 */
export function getCategories(): PostingCategory[] {
  return query<PostingCategory>(
    `SELECT id, name, description, sortOrder, 
            CASE WHEN isActive = 1 THEN 1 ELSE 0 END as isActive,
            createdAtUtc, updatedAtUtc
     FROM PostingCategory 
     WHERE isActive = 1 
     ORDER BY sortOrder`
  ).map(row => ({
    ...row,
    isActive: Boolean(row.isActive),
  }));
}

/**
 * Get a category by ID.
 */
export function getCategoryById(id: string): PostingCategory | null {
  const results = query<PostingCategory>(
    'SELECT * FROM PostingCategory WHERE id = ?',
    [id]
  );
  if (results.length === 0) return null;
  return {
    ...results[0],
    isActive: Boolean(results[0].isActive),
  };
}

// ===== Fiscal Years =====

/**
 * Get all fiscal years.
 */
export function getFiscalYears(): FiscalYear[] {
  return query<FiscalYear>(
    `SELECT year, openingCashBalance, openingBankBalance, 
            CASE WHEN isClosed = 1 THEN 1 ELSE 0 END as isClosed,
            createdAtUtc, updatedAtUtc
     FROM FiscalYear 
     ORDER BY year DESC`
  ).map(row => ({
    ...row,
    isClosed: Boolean(row.isClosed),
  }));
}

/**
 * Get a fiscal year by year number.
 */
export function getFiscalYear(year: number): FiscalYear | null {
  const results = query<FiscalYear>(
    'SELECT * FROM FiscalYear WHERE year = ?',
    [year]
  );
  if (results.length === 0) return null;
  return {
    ...results[0],
    isClosed: Boolean(results[0].isClosed),
  };
}

/**
 * Create a new fiscal year.
 */
export function createFiscalYear(fiscalYear: FiscalYear): void {
  execute(
    `INSERT INTO FiscalYear (year, openingCashBalance, openingBankBalance, isClosed, createdAtUtc, updatedAtUtc)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      fiscalYear.year,
      fiscalYear.openingCashBalance,
      fiscalYear.openingBankBalance,
      fiscalYear.isClosed ? 1 : 0,
      fiscalYear.createdAtUtc,
      fiscalYear.updatedAtUtc,
    ]
  );
}

/**
 * Update a fiscal year.
 */
export function updateFiscalYear(fiscalYear: FiscalYear): void {
  execute(
    `UPDATE FiscalYear 
     SET openingCashBalance = ?, openingBankBalance = ?, isClosed = ?, updatedAtUtc = ?
     WHERE year = ?`,
    [
      fiscalYear.openingCashBalance,
      fiscalYear.openingBankBalance,
      fiscalYear.isClosed ? 1 : 0,
      fiscalYear.updatedAtUtc,
      fiscalYear.year,
    ]
  );
}

// ===== Fee Rates =====

/**
 * Get fee rate for a specific year and member type.
 */
export function getFeeRate(year: number, memberType: MemberType): number {
  const results = query<FeeRate>(
    'SELECT feeAmount FROM FeeRate WHERE fiscalYear = ? AND memberType = ?',
    [year, memberType]
  );
  return results.length > 0 ? results[0].feeAmount : 0;
}

/**
 * Get all fee rates for a year.
 */
export function getFeeRatesForYear(year: number): FeeRate[] {
  return query<FeeRate>(
    'SELECT fiscalYear, memberType, feeAmount FROM FeeRate WHERE fiscalYear = ?',
    [year]
  );
}

/**
 * Set fee rate for a year and member type.
 */
export function setFeeRate(year: number, memberType: MemberType, feeAmount: number): void {
  execute(
    `INSERT OR REPLACE INTO FeeRate (fiscalYear, memberType, feeAmount)
     VALUES (?, ?, ?)`,
    [year, memberType, feeAmount]
  );
}

// ===== Transactions =====

/**
 * Get all transactions for a fiscal year (excluding deleted).
 */
export function getTransactionsByYear(year: number): FinancialTransaction[] {
  return query<FinancialTransaction>(
    `SELECT id, fiscalYear, sequenceNumber, date, description,
            cashIn, cashOut, bankIn, bankOut, notes,
            CASE WHEN isDeleted = 1 THEN 1 ELSE 0 END as isDeleted,
            createdAtUtc, updatedAtUtc
     FROM FinancialTransaction 
     WHERE fiscalYear = ? AND isDeleted = 0
     ORDER BY date, sequenceNumber`,
    [year]
  ).map(row => ({
    ...row,
    isDeleted: Boolean(row.isDeleted),
  }));
}

/**
 * Get a transaction by ID.
 */
export function getTransactionById(id: string): FinancialTransaction | null {
  const results = query<FinancialTransaction>(
    'SELECT * FROM FinancialTransaction WHERE id = ?',
    [id]
  );
  if (results.length === 0) return null;
  return {
    ...results[0],
    isDeleted: Boolean(results[0].isDeleted),
  };
}

/**
 * Get transaction lines for a transaction.
 */
export function getTransactionLines(transactionId: string): TransactionLine[] {
  return query<TransactionLine>(
    `SELECT id, transactionId, categoryId, amount, 
            CASE WHEN isIncome = 1 THEN 1 ELSE 0 END as isIncome,
            memberId, lineDescription
     FROM TransactionLine 
     WHERE transactionId = ?`,
    [transactionId]
  ).map(row => ({
    ...row,
    isIncome: Boolean(row.isIncome),
  }));
}

/**
 * Get transaction with all its lines.
 */
export function getTransactionWithLines(id: string): TransactionWithLines | null {
  const txn = getTransactionById(id);
  if (!txn) return null;
  return {
    ...txn,
    lines: getTransactionLines(id),
  };
}

/**
 * Get all transactions with lines for a year.
 */
export function getTransactionsWithLinesByYear(year: number): TransactionWithLines[] {
  const transactions = getTransactionsByYear(year);
  return transactions.map(txn => ({
    ...txn,
    lines: getTransactionLines(txn.id),
  }));
}

/**
 * Get the next sequence number for a fiscal year.
 */
export function getNextSequenceNumber(year: number): number {
  const results = query<{ maxSeq: number | null }>(
    'SELECT MAX(sequenceNumber) as maxSeq FROM FinancialTransaction WHERE fiscalYear = ?',
    [year]
  );
  return (results[0]?.maxSeq ?? 0) + 1;
}

/**
 * Create a new transaction with lines.
 */
export function createTransaction(
  txn: Omit<FinancialTransaction, 'sequenceNumber'>,
  lines: Omit<TransactionLine, 'transactionId'>[]
): void {
  transaction(() => {
    const sequenceNumber = getNextSequenceNumber(txn.fiscalYear);
    
    execute(
      `INSERT INTO FinancialTransaction 
       (id, fiscalYear, sequenceNumber, date, description, cashIn, cashOut, bankIn, bankOut, notes, isDeleted, createdAtUtc, updatedAtUtc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        txn.id,
        txn.fiscalYear,
        sequenceNumber,
        txn.date,
        txn.description,
        txn.cashIn,
        txn.cashOut,
        txn.bankIn,
        txn.bankOut,
        txn.notes,
        txn.createdAtUtc,
        txn.updatedAtUtc,
      ]
    );
    
    for (const line of lines) {
      execute(
        `INSERT INTO TransactionLine 
         (id, transactionId, categoryId, amount, isIncome, memberId, lineDescription)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          line.id,
          txn.id,
          line.categoryId,
          line.amount,
          line.isIncome ? 1 : 0,
          line.memberId,
          line.lineDescription,
        ]
      );
    }
  });
}

/**
 * Update an existing transaction with lines.
 */
export function updateTransaction(
  txn: FinancialTransaction,
  lines: TransactionLine[]
): void {
  transaction(() => {
    execute(
      `UPDATE FinancialTransaction 
       SET date = ?, description = ?, cashIn = ?, cashOut = ?, bankIn = ?, bankOut = ?, notes = ?, updatedAtUtc = ?
       WHERE id = ?`,
      [
        txn.date,
        txn.description,
        txn.cashIn,
        txn.cashOut,
        txn.bankIn,
        txn.bankOut,
        txn.notes,
        txn.updatedAtUtc,
        txn.id,
      ]
    );
    
    // Delete existing lines and re-insert
    execute('DELETE FROM TransactionLine WHERE transactionId = ?', [txn.id]);
    
    for (const line of lines) {
      execute(
        `INSERT INTO TransactionLine 
         (id, transactionId, categoryId, amount, isIncome, memberId, lineDescription)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          line.id,
          txn.id,
          line.categoryId,
          line.amount,
          line.isIncome ? 1 : 0,
          line.memberId,
          line.lineDescription,
        ]
      );
    }
  });
}

/**
 * Soft delete a transaction.
 */
export function deleteTransaction(id: string): void {
  const now = new Date().toISOString();
  execute(
    'UPDATE FinancialTransaction SET isDeleted = 1, updatedAtUtc = ? WHERE id = ?',
    [now, id]
  );
}

// ===== Balance Calculations =====

/**
 * Get running balances for a fiscal year.
 */
export function getRunningBalances(year: number): RunningBalances {
  const fiscalYear = getFiscalYear(year);
  if (!fiscalYear) {
    return { cash: 0, bank: 0 };
  }
  
  const results = query<{ totalCashIn: number; totalCashOut: number; totalBankIn: number; totalBankOut: number }>(
    `SELECT 
       COALESCE(SUM(cashIn), 0) as totalCashIn,
       COALESCE(SUM(cashOut), 0) as totalCashOut,
       COALESCE(SUM(bankIn), 0) as totalBankIn,
       COALESCE(SUM(bankOut), 0) as totalBankOut
     FROM FinancialTransaction 
     WHERE fiscalYear = ? AND isDeleted = 0`,
    [year]
  );
  
  const totals = results[0] || { totalCashIn: 0, totalCashOut: 0, totalBankIn: 0, totalBankOut: 0 };
  
  return {
    cash: fiscalYear.openingCashBalance + totals.totalCashIn - totals.totalCashOut,
    bank: fiscalYear.openingBankBalance + totals.totalBankIn - totals.totalBankOut,
  };
}

/**
 * Get category totals for a fiscal year.
 */
export function getCategoryTotals(year: number): CategoryTotal[] {
  const results = query<{ categoryId: string; categoryName: string; totalIncome: number; totalExpense: number }>(
    `SELECT 
       tl.categoryId,
       pc.name as categoryName,
       COALESCE(SUM(CASE WHEN tl.isIncome = 1 THEN tl.amount ELSE 0 END), 0) as totalIncome,
       COALESCE(SUM(CASE WHEN tl.isIncome = 0 THEN tl.amount ELSE 0 END), 0) as totalExpense
     FROM TransactionLine tl
     JOIN PostingCategory pc ON tl.categoryId = pc.id
     JOIN FinancialTransaction ft ON tl.transactionId = ft.id
     WHERE ft.fiscalYear = ? AND ft.isDeleted = 0
     GROUP BY tl.categoryId, pc.name
     ORDER BY pc.sortOrder`,
    [year]
  );
  
  return results.map(row => ({
    ...row,
    net: row.totalIncome - row.totalExpense,
  }));
}

// ===== Member Fee Tracking =====

/**
 * Get member fee status for a fiscal year.
 */
export function getMemberFeeStatus(year: number): MemberFeeStatus[] {
  // Get all active members with their fee payments
  const results = query<{
    memberId: string;
    firstName: string;
    lastName: string;
    memberType: string;
    paidAmount: number;
    paymentDates: string;
  }>(
    `SELECT 
       m.membershipId as memberId,
       m.firstName,
       m.lastName,
       COALESCE(m.memberType, 'ADULT') as memberType,
       COALESCE(SUM(tl.amount), 0) as paidAmount,
       GROUP_CONCAT(ft.date, ',') as paymentDates
     FROM Member m
     LEFT JOIN TransactionLine tl ON tl.memberId = m.membershipId 
       AND tl.categoryId = 'FEES' 
       AND tl.isIncome = 1
     LEFT JOIN FinancialTransaction ft ON tl.transactionId = ft.id 
       AND ft.fiscalYear = ? 
       AND ft.isDeleted = 0
     WHERE m.status = 'ACTIVE'
     GROUP BY m.membershipId, m.firstName, m.lastName, m.memberType
     ORDER BY m.lastName, m.firstName`,
    [year]
  );
  
  // Get fee rates for the year
  const feeRates = getFeeRatesForYear(year);
  const rateMap = new Map(feeRates.map(r => [r.memberType, r.feeAmount]));
  
  return results.map(row => {
    const memberType = row.memberType as MemberType;
    const expectedFee = rateMap.get(memberType) || 0;
    const paymentDates = row.paymentDates ? row.paymentDates.split(',').filter(Boolean) : [];
    
    return {
      memberId: row.memberId,
      memberName: `${row.firstName} ${row.lastName}`,
      memberType,
      expectedFee,
      paidAmount: row.paidAmount,
      outstanding: expectedFee - row.paidAmount,
      paymentDates,
    };
  });
}

/**
 * Get closing balances for a fiscal year (opening + sum of movements).
 */
export function getClosingBalances(year: number): RunningBalances {
  const fiscalYear = getFiscalYear(year);
  const transactions = getTransactionsByYear(year);

  const openingCash = fiscalYear?.openingCashBalance ?? 0;
  const openingBank = fiscalYear?.openingBankBalance ?? 0;

  const totalCashIn = transactions.reduce((sum, t) => sum + (t.cashIn ?? 0), 0);
  const totalCashOut = transactions.reduce((sum, t) => sum + (t.cashOut ?? 0), 0);
  const totalBankIn = transactions.reduce((sum, t) => sum + (t.bankIn ?? 0), 0);
  const totalBankOut = transactions.reduce((sum, t) => sum + (t.bankOut ?? 0), 0);

  return {
    cash: openingCash + totalCashIn - totalCashOut,
    bank: openingBank + totalBankIn - totalBankOut,
  };
}

/**
 * Get transaction lines for a specific member.
 */
export function getMemberTransactionLines(memberId: string, year?: number): Array<TransactionLine & { date: string; description: string }> {
  const yearFilter = year ? 'AND ft.fiscalYear = ?' : '';
  const params = year ? [memberId, year] : [memberId];
  
  return query<TransactionLine & { date: string; description: string }>(
    `SELECT 
       tl.id, tl.transactionId, tl.categoryId, tl.amount, 
       CASE WHEN tl.isIncome = 1 THEN 1 ELSE 0 END as isIncome,
       tl.memberId, tl.lineDescription,
       ft.date, ft.description
     FROM TransactionLine tl
     JOIN FinancialTransaction ft ON tl.transactionId = ft.id
     WHERE tl.memberId = ? AND ft.isDeleted = 0 ${yearFilter}
     ORDER BY ft.date DESC`,
    params
  ).map(row => ({
    ...row,
    isIncome: Boolean(row.isIncome),
  }));
}

// ===== Pending Fee Payments =====

/**
 * Get all pending (unconsolidated) fee payments for a fiscal year.
 */
export function getPendingFeePayments(year: number): PendingFeePaymentWithMember[] {
  // Query returns isConsolidated as number (0/1) from SQLite
  interface RawRow {
    id: string;
    fiscalYear: number;
    memberId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string | null;
    notes: string | null;
    isConsolidated: number;
    consolidatedTransactionId: string | null;
    createdAtUtc: string | null;
    updatedAtUtc: string | null;
    memberName: string;
    memberType: string;
  }
  const now = new Date().toISOString();
  return query<RawRow>(
    `SELECT 
       p.id, p.fiscalYear, p.memberId, p.amount, p.paymentDate, 
       p.paymentMethod, p.notes, p.isConsolidated, 
       p.consolidatedTransactionId, p.createdAtUtc, p.updatedAtUtc,
       m.firstName || ' ' || m.lastName as memberName,
       COALESCE(m.memberType, 'ADULT') as memberType
     FROM PendingFeePayment p
     JOIN Member m ON p.memberId = m.membershipId
     WHERE p.fiscalYear = ? AND p.isConsolidated = 0
     ORDER BY p.paymentDate DESC`,
    [year]
  ).map(row => ({
    id: row.id,
    fiscalYear: row.fiscalYear,
    memberId: row.memberId,
    amount: row.amount,
    paymentDate: row.paymentDate,
    paymentMethod: (row.paymentMethod ?? 'CASH') as PaymentMethod,
    notes: row.notes,
    isConsolidated: Boolean(row.isConsolidated),
    consolidatedTransactionId: row.consolidatedTransactionId,
    createdAtUtc: row.createdAtUtc ?? now,
    updatedAtUtc: row.updatedAtUtc ?? now,
    memberName: row.memberName,
    memberType: row.memberType as MemberType,
  }));
}

/**
 * Get all pending fee payments for a specific member.
 */
export function getPendingFeePaymentsForMember(memberId: string, year: number): PendingFeePayment[] {
  interface RawRow {
    id: string;
    fiscalYear: number;
    memberId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string | null;
    notes: string | null;
    isConsolidated: number;
    consolidatedTransactionId: string | null;
    createdAtUtc: string | null;
    updatedAtUtc: string | null;
  }
  const now = new Date().toISOString();
  return query<RawRow>(
    `SELECT * FROM PendingFeePayment 
     WHERE memberId = ? AND fiscalYear = ? AND isConsolidated = 0
     ORDER BY paymentDate DESC`,
    [memberId, year]
  ).map(row => ({
    id: row.id,
    fiscalYear: row.fiscalYear,
    memberId: row.memberId,
    amount: row.amount,
    paymentDate: row.paymentDate,
    paymentMethod: (row.paymentMethod ?? 'CASH') as PaymentMethod,
    notes: row.notes,
    isConsolidated: Boolean(row.isConsolidated),
    consolidatedTransactionId: row.consolidatedTransactionId,
    createdAtUtc: row.createdAtUtc ?? now,
    updatedAtUtc: row.updatedAtUtc ?? now,
  }));
}

/**
 * Create a pending fee payment.
 */
export function createPendingFeePayment(payment: Omit<PendingFeePayment, 'isConsolidated' | 'consolidatedTransactionId'>): void {
  execute(
    `INSERT INTO PendingFeePayment 
     (id, fiscalYear, memberId, amount, paymentDate, paymentMethod, notes, isConsolidated, consolidatedTransactionId, createdAtUtc, updatedAtUtc)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      payment.id,
      payment.fiscalYear,
      payment.memberId,
      payment.amount,
      payment.paymentDate,
      payment.paymentMethod,
      payment.notes,
      payment.createdAtUtc,
      payment.updatedAtUtc,
    ]
  );
}

/**
 * Delete a pending fee payment.
 */
export function deletePendingFeePayment(id: string): void {
  execute('DELETE FROM PendingFeePayment WHERE id = ? AND isConsolidated = 0', [id]);
}

/**
 * Consolidate pending fee payments into a transaction.
 * Creates a single transaction with lines for each payment.
 */
export function consolidatePendingFeePayments(
  year: number,
  paymentIds: string[],
  description: string,
  date: string,
  categoryId: string
): string {
  interface RawRow {
    id: string;
    fiscalYear: number;
    memberId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string | null;
    notes: string | null;
    isConsolidated: number;
    consolidatedTransactionId: string | null;
    createdAtUtc: string | null;
    updatedAtUtc: string | null;
  }
  const now = new Date().toISOString();
  const payments = query<RawRow>(
    `SELECT * FROM PendingFeePayment WHERE id IN (${paymentIds.map(() => '?').join(',')}) AND isConsolidated = 0`,
    paymentIds
  ).map(row => ({
    id: row.id,
    fiscalYear: row.fiscalYear,
    memberId: row.memberId,
    amount: row.amount,
    paymentDate: row.paymentDate,
    paymentMethod: (row.paymentMethod ?? 'CASH') as PaymentMethod,
    notes: row.notes,
    isConsolidated: Boolean(row.isConsolidated),
    consolidatedTransactionId: row.consolidatedTransactionId,
    createdAtUtc: row.createdAtUtc ?? now,
    updatedAtUtc: row.updatedAtUtc ?? now,
  }));

  if (payments.length === 0) {
    throw new Error('No pending payments found to consolidate');
  }

  // Calculate totals by payment method
  let totalCash = 0;
  let totalBank = 0;
  payments.forEach(p => {
    if (p.paymentMethod === 'CASH') {
      totalCash += p.amount;
    } else {
      totalBank += p.amount;
    }
  });

  // Get next sequence number
  const seqResult = query<{ maxSeq: number | null }>(
    'SELECT MAX(sequenceNumber) as maxSeq FROM FinancialTransaction WHERE fiscalYear = ?',
    [year]
  );
  const nextSeq = (seqResult[0]?.maxSeq ?? 0) + 1;

  const transactionId = crypto.randomUUID();

  // Create the transaction
  execute(
    `INSERT INTO FinancialTransaction 
     (id, fiscalYear, sequenceNumber, date, description, cashIn, cashOut, bankIn, bankOut, notes, isDeleted, createdAtUtc, updatedAtUtc)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?)`,
    [
      transactionId,
      year,
      nextSeq,
      date,
      description,
      totalCash > 0 ? totalCash : null,
      totalBank > 0 ? totalBank : null,
      `Konsolideret fra ${payments.length} kontingentbetalinger`,
      now,
      now,
    ]
  );

  // Create transaction lines for each payment
  payments.forEach(payment => {
    execute(
      `INSERT INTO TransactionLine (id, transactionId, categoryId, amount, isIncome, memberId, lineDescription)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [
        crypto.randomUUID(),
        transactionId,
        categoryId,
        payment.amount,
        payment.memberId,
        `Kontingent ${payment.paymentMethod === 'CASH' ? 'kontant' : 'bank'}`,
      ]
    );
  });

  // Mark payments as consolidated
  execute(
    `UPDATE PendingFeePayment 
     SET isConsolidated = 1, consolidatedTransactionId = ?, updatedAtUtc = ?
     WHERE id IN (${paymentIds.map(() => '?').join(',')})`,
    [transactionId, now, ...paymentIds]
  );

  return transactionId;
}

/**
 * Get total pending fee amount for a member in a year.
 */
export function getPendingFeeTotal(memberId: string, year: number): number {
  const result = query<{ total: number | null }>(
    `SELECT SUM(amount) as total FROM PendingFeePayment 
     WHERE memberId = ? AND fiscalYear = ? AND isConsolidated = 0`,
    [memberId, year]
  );
  return result[0]?.total ?? 0;
}
