/**
 * Type definitions for financial transactions (Kassebog).
 * 
 * @see /docs/features/financial-transactions/prd.md
 */

// ===== Member Type =====

export type MemberType = 'ADULT' | 'CHILD' | 'CHILD_PLUS' | 'HONORARY';

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  ADULT: 'Voksen',
  CHILD: 'Barn',
  CHILD_PLUS: 'Barn+',
  HONORARY: 'Æresmedlem',
};

// ===== Posting Category =====

export interface PostingCategory {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

// Default posting categories matching Kassebog structure
export const DEFAULT_CATEGORIES: Omit<PostingCategory, 'createdAtUtc' | 'updatedAtUtc'>[] = [
  { id: 'AMMO', name: 'Patroner/skiver', description: 'Ammunition and targets', sortOrder: 1, isActive: true },
  { id: 'COMP', name: 'Kapskydning/præmier', description: 'Competitions and prizes', sortOrder: 2, isActive: true },
  { id: 'FEES', name: 'Kontingent/Bestyrelse', description: 'Membership fees and board expenses', sortOrder: 3, isActive: true },
  { id: 'WEAP', name: 'Våben/vedligeholdelse', description: 'Weapons and maintenance', sortOrder: 4, isActive: true },
  { id: 'OFFC', name: 'Porto/Kontoart', description: 'Postage and office supplies', sortOrder: 5, isActive: true },
  { id: 'GIFT', name: 'Begr/gaver/støtte', description: 'Flowers, gifts, support', sortOrder: 6, isActive: true },
  { id: 'MISC', name: 'Diverse/renter/gebyr', description: 'Miscellaneous, interest, fees', sortOrder: 7, isActive: true },
  { id: 'SUBS', name: 'Tilskud/kontingent hovedafdeling', description: 'Subsidies and main association fees', sortOrder: 8, isActive: true },
  { id: 'UTIL', name: 'Vand', description: 'Utilities (water)', sortOrder: 9, isActive: true },
  { id: 'XFER', name: 'Intern overførsel', description: 'Internal transfers between bank and cash', sortOrder: 10, isActive: true },
];

// ===== Fiscal Year =====

export interface FiscalYear {
  year: number;
  openingCashBalance: number;
  openingBankBalance: number;
  isClosed: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

// ===== Fee Rate =====

export interface FeeRate {
  fiscalYear: number;
  memberType: MemberType;
  feeAmount: number;
}

// Default fee rates for 2026
export const DEFAULT_FEE_RATES_2026: FeeRate[] = [
  { fiscalYear: 2026, memberType: 'ADULT', feeAmount: 600 },
  { fiscalYear: 2026, memberType: 'CHILD', feeAmount: 300 },
  { fiscalYear: 2026, memberType: 'CHILD_PLUS', feeAmount: 600 },
  { fiscalYear: 2026, memberType: 'HONORARY', feeAmount: 0 },
];

// ===== Financial Transaction =====

export interface FinancialTransaction {
  id: string;
  fiscalYear: number;
  sequenceNumber: number;
  date: string; // ISO date YYYY-MM-DD
  description: string;
  cashIn: number | null;
  cashOut: number | null;
  bankIn: number | null;
  bankOut: number | null;
  notes: string | null;
  isDeleted: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

// ===== Transaction Line =====

export interface TransactionLine {
  id: string;
  transactionId: string;
  categoryId: string;
  amount: number;
  isIncome: boolean;
  source: PaymentMethod;
  memberId: string | null;
  lineDescription: string | null;
}

// ===== Combined Types =====

export interface TransactionWithLines extends FinancialTransaction {
  lines: TransactionLine[];
}

// ===== Form Data Types =====

export interface TransactionLineFormData {
  id?: string;
  categoryId: string;
  amount: number;
  isIncome: boolean;
  source: PaymentMethod;
  memberId: string | null;
  lineDescription: string | null;
}

export interface TransactionFormData {
  id?: string;
  date: string;
  description: string;
  cashIn: number | null;
  cashOut: number | null;
  bankIn: number | null;
  bankOut: number | null;
  notes: string | null;
  lines: TransactionLineFormData[];
}

// ===== Calculated Types =====

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
}

export interface MemberFeeStatus {
  memberId: string;
  memberName: string;
  memberType: MemberType;
  expectedFee: number;
  paidAmount: number;
  outstanding: number;
  paymentDates: string[];
}

export interface RunningBalances {
  cash: number;
  bank: number;
}

// ===== Pending Fee Payment =====

export type PaymentMethod = 'CASH' | 'BANK';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Kontant',
  BANK: 'Bank',
};

export interface PendingFeePayment {
  id: string;
  fiscalYear: number;
  memberId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  isConsolidated: boolean;
  consolidatedTransactionId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface PendingFeePaymentWithMember extends PendingFeePayment {
  memberName: string;
  memberType: MemberType;
}

// ===== Transaction Display Type (for table with running balance) =====

export interface TransactionDisplayRow extends TransactionWithLines {
  runningCashBalance: number;
  runningBankBalance: number;
}
