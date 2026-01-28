# Financial Transactions (Kassebog) - Product Requirements Document

**Feature:** Club Financial Transaction Recording and Reporting
**Version:** 1.1
**Last Updated:** 2026-01-28
**Updated By:** sbalslev

---

## 1. Overview

### 1.1 Purpose

This feature enables the club treasurer to record and manage financial transactions directly in the laptop app. Transactions are organized by fiscal year and can be exported to Excel format matching the existing "Kassebog" spreadsheet structure used by ISS-Skydning.

### 1.2 Background

Currently, the club maintains financial records in an Excel spreadsheet ("Kassebog 2025.xlsx"). This manual process requires:

- Manual data entry in Excel
- Manual calculations for category totals
- Risk of calculation errors
- No integration with member management system

### 1.3 Goals

- Provide a user-friendly interface for recording transactions
- Automatic calculation of running balances
- Category-based expense/income tracking with Danish posting groups
- Export to Excel format compatible with existing "Kassebog" template
- Yearly separation of financial data
- Optional: Link transactions to membership fees

### 1.4 Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Transactions can split across multiple categories | Matches real-world scenarios where one purchase covers multiple expense types |
| 2 | Cash and Bank can be combined in one transaction | Supports transfers (e.g., cash deposit = cashOut + bankIn) |
| 3 | Deleted sequence numbers leave gaps | Maintains audit trail integrity |
| 4 | Categories are fixed (not user-editable) | Simplifies MVP; matches existing Kassebog structure |
| 5 | MobilePay integration deferred | Out of scope for initial release |
| 6 | DKK only (no multi-currency) | Club operates in Denmark only |
| 7 | Navigation label: "Økonomi" | Broader term than "Kassebog" for finance section |

---

## 2. User Stories

### 2.1 Core User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| FT-01 | Treasurer | Record income and expense transactions | I can track club finances digitally |
| FT-02 | Treasurer | Assign transactions to categories | I can see spending by category |
| FT-03 | Treasurer | See running cash and bank balances | I know current financial position |
| FT-04 | Treasurer | Export transactions to Excel | I can share reports with the board |
| FT-05 | Treasurer | Filter transactions by date range | I can review specific periods |
| FT-06 | Treasurer | View transactions by year | I can separate fiscal years |
| FT-07 | Treasurer | Set opening balances for new year | I can carry forward from previous year |
| FT-08 | Treasurer | Link line items to members | I can track member purchases and payments |
| FT-09 | Treasurer | Record multiple member payments in one transaction | I can efficiently enter MobilePay statements |
| FT-10 | Treasurer | See member fee payment status | I know who has paid and who owes |

### 2.2 Nice-to-Have Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| FT-11 | Treasurer | Generate annual summary report | I can present at general assembly |
| FT-12 | Treasurer | Import transactions from bank CSV | I reduce manual data entry |
| FT-13 | Treasurer | Send payment reminders to members | I can follow up on unpaid fees |

### 2.3 Out of Scope (Future Features)

| Feature | Description |
|---------|-------------|
| Punchcard Balance Tracking | Track punches bought vs. used per member. Requires integration with check-in system. |
| Training Attendance | Log attendance per training session with punch deduction. |
| MobilePay Integration | Auto-import transactions from MobilePay exports. |

---

## 3. Functional Requirements

### 3.1 Transaction Model

A transaction consists of:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | Yes | Unique identifier |
| sequenceNumber | number | Yes | Sequential number within year (bilagsnummer) |
| date | date | Yes | Transaction date |
| description | string | Yes | Description/narrative |
| cashIn | number | No | Cash income amount |
| cashOut | number | No | Cash expense amount |
| bankIn | number | No | Bank income amount |
| bankOut | number | No | Bank expense amount |
| notes | string | No | Additional notes |
| fiscalYear | number | Yes | Fiscal year (e.g., 2025) |
| createdAtUtc | datetime | Yes | Creation timestamp |
| updatedAtUtc | datetime | Yes | Last update timestamp |

**Note:** A transaction can affect both cash and bank simultaneously (e.g., cash deposit to bank = cashOut + bankIn).

### 3.1.1 Transaction Lines (Itemized Details)

Each transaction contains one or more lines. Lines allow itemization with optional member links:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | Yes | Unique identifier |
| transactionId | string | Yes | Parent transaction reference |
| categoryId | string | Yes | Reference to posting group |
| amount | number | Yes | Amount for this line (positive) |
| isIncome | boolean | Yes | True = income, False = expense |
| memberId | string | No | Optional link to member |
| lineDescription | string | No | Line-specific description (e.g., "Kontingent 2025") |

**Example 1:** Simple expense (no member link)
- Transaction: Date=2025-01-15, Description="Indkøb patroner", bankOut=1500
- Line 1: categoryId=AMMO, amount=1500, isIncome=false

**Example 2:** MobilePay with multiple member payments
- Transaction: Date=2025-02-01, Description="MobilePay Februar", bankIn=3.475
- Line 1: categoryId=FEES, amount=400, isIncome=true, memberId="m-123", lineDescription="Kontingent 2025"
- Line 2: categoryId=FEES, amount=400, isIncome=true, memberId="m-456", lineDescription="Kontingent 2025"
- Line 3: categoryId=FEES, amount=400, isIncome=true, memberId="m-789", lineDescription="Kontingent 2025"
- Line 4: categoryId=FEES, amount=400, isIncome=true, memberId="m-012", lineDescription="Kontingent 2025"
- Line 5: categoryId=FEES, amount=400, isIncome=true, memberId="m-345", lineDescription="Kontingent 2025"
- Line 6: categoryId=UTIL, amount=75, isIncome=true, lineDescription="5 x vand"
- Line 7: categoryId=AMMO, amount=350, isIncome=true, memberId="m-111", lineDescription="Klippekort"
- Line 8: categoryId=AMMO, amount=350, isIncome=true, memberId="m-222", lineDescription="Klippekort"
- Line 9: categoryId=AMMO, amount=350, isIncome=true, memberId="m-333", lineDescription="Klippekort"
- Line 10: categoryId=AMMO, amount=350, isIncome=true, memberId="m-444", lineDescription="Klippekort"

### 3.2 Posting Categories (Kontogrupper)

Based on the existing Kassebog structure:

| ID | Danish Name | English Description |
|----|-------------|---------------------|
| AMMO | Patroner/skiver | Ammunition and targets |
| COMP | Kapskydning/præmier | Competitions and prizes |
| FEES | Kontingent/Bestyrelse | Membership fees and board expenses |
| WEAP | Våben/vedligeholdelse | Weapons and maintenance |
| OFFC | Porto/Kontoart | Postage and office supplies |
| GIFT | Begr/gaver/støtte | Flowers, gifts, support |
| MISC | Diverse/renter/gebyr | Miscellaneous, interest, fees |
| SUBS | Tilskud/kontingent hovedafdeling | Subsidies and main association fees |
| UTIL | Vand | Utilities (water) |

Categories are fixed in the initial release. Future versions may allow customization.

### 3.3 Fiscal Year Model

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| year | number | Yes | Fiscal year (e.g., 2025) |
| openingCashBalance | number | Yes | Starting cash balance |
| openingBankBalance | number | Yes | Starting bank balance |
| isClosed | boolean | Yes | Year is closed for editing |
| createdAtUtc | datetime | Yes | Creation timestamp |

### 3.4 Core Functions

#### 3.4.1 Create Transaction

- User selects date, enters description
- User enters amount in appropriate field (cash in/out or bank in/out)
- User selects category
- System auto-assigns next sequence number
- System saves transaction

#### 3.4.2 Edit Transaction

- User can edit any open-year transaction
- Sequence numbers remain stable
- System updates timestamp

#### 3.4.3 Delete Transaction

- User can delete transaction (soft delete recommended)
- Sequence numbers are NOT reassigned

#### 3.4.4 View Transaction List

- Default view: Current year, sorted by date/sequence
- Show columns: #, Date, Description, Cash In/Out, Bank In/Out, Category, Running Balance
- Filter by: Date range, Category
- Search by: Description

#### 3.4.5 Year Management

- Create new fiscal year with opening balances
- Close year (prevents further edits)
- Carry forward: Create opening balance from previous year's closing

#### 3.4.6 Export to Excel

- Export format matches "Kassebog 2025.xlsx" structure
- Include all transactions for selected year
- Include category columns with income/expense pairs
- Include running balance calculations
- Include annual summary sheet (Årsresultat)

### 3.5 Calculated Fields

| Field | Calculation |
|-------|-------------|
| Running Cash Balance | Opening Cash + Sum(CashIn) - Sum(CashOut) |
| Running Bank Balance | Opening Bank + Sum(BankIn) - Sum(BankOut) |
| Category Income Total | Sum of category isIncome=true amounts |
| Category Expense Total | Sum of category isIncome=false amounts |
| Year Result | Total Income - Total Expense |

### 3.6 Member Fee Tracking

#### 3.6.1 Member Types and Fee Rates

Fee amounts are determined by member type and fiscal year:

| Member Type | Danish | 2026 Fee |
|-------------|--------|----------|
| ADULT | Voksen | 600 kr |
| CHILD | Barn | 300 kr |
| CHILD_PLUS | Barn+ | 600 kr |

**Note:** Member type (`memberType`) must be added to the Member entity. Fee rates are stored per fiscal year to allow changes.

Fee rates are editable per fiscal year in the UI.

Member fee category rules:

- Members under 18 use CHILD or CHILD_PLUS
- Members 18 and older use ADULT

#### 3.6.2 Fee Rate Table

| Field | Type | Description |
|-------|------|-------------|
| fiscalYear | number | Year these rates apply |
| memberType | string | ADULT, CHILD, CHILD_PLUS |
| feeAmount | number | Annual fee in DKK |

#### 3.6.3 Fee Payment Query

The system can query all transaction lines linked to a specific member:

- Filter by: memberId, categoryId (FEES), fiscalYear
- Show: date, description, amount paid

#### 3.6.4 Member Payment Status View

For a given fiscal year, show each member with:

- Member type and expected fee amount
- Amount paid (sum of FEES lines linked to member)
- Outstanding balance
- Payment date(s)

#### 3.6.5 Use Cases

| Use Case | Description |
|----------|-------------|
| Record MobilePay Statement | Single transaction with multiple lines, each linked to paying member |
| Record Cash Payments | Multiple members pay at club, enter as one transaction |
| Track Punchcard Sales | Lines with category AMMO, linked to purchasing member |
| Water Sales (General) | Lines with category UTIL, no member link needed |

---

## 4. User Interface Requirements

### 4.1 Navigation

Add new sidebar item:

- **Icon:** Wallet or Receipt from lucide-react
- **Label:** "Økonomi"
- **Position:** After Equipment, before Devices

### 4.2 Main Transaction Page

```
+------------------------------------------------------------------------+
| Kassebog 2025                                     [År: 2025 ▼] [+]    |
+------------------------------------------------------------------------+
| Kasse: 4.521,50 kr     Bank: 72.450,00 kr                              |
| [Eksporter Excel]  [Filtre ▼]                                          |
+------------------------------------------------------------------------+
| #  | Dato       | Beskrivelse      | Kasse  | Bank    | S.Kasse | S.Bank |
|----|------------|------------------|--------|---------|---------|--------|
| 1  | 2025-01-02 | Punktum.dk       |        | -70,00  | 2.511   | 63.465 |
| 2  | 2025-01-14 | Kontingent       | +400   |         | 2.911   | 63.465 |
| 3  | 2025-01-31 | MobilePay Januar |        | +2.745  | 2.911   | 66.210 |
| ...                                                                    |
+------------------------------------------------------------------------+
```

**Note:** S.Kasse = Saldo Kasse (running cash balance), S.Bank = Saldo Bank (running bank balance)

### 4.3 Add/Edit Transaction Dialog

```
+------------------------------------------+
| Ny transaktion                      [X]  |
+------------------------------------------+
| Dato:        [2025-01-19        📅]      |
| Beskrivelse: [________________________]  |
|                                          |
| Beløb:                                   |
| Kasse ind:  [________] kr                |
| Kasse ud:   [________] kr                |
| Bank ind:   [________] kr                |
| Bank ud:    [________] kr                |
|                                          |
| Fordeling på kategorier:                 |
| [Patroner/skiver  ▼] [1.200] kr [+]     |
| [Diverse          ▼] [  300] kr [×]     |
| Noter:       [________________________]  |
|                                          |
|              [Annuller]    [Gem]         |
+------------------------------------------+
```

### 4.4 Year Settings Dialog

```
+------------------------------------------+
| Regnskabsår 2025                    [X]  |
+------------------------------------------+
| Start saldo:                             |
| Kasse: [2.511,50] kr                     |
| Bank:  [63.535,20] kr                    |
|                                          |
| Status: ( ) Åben  (•) Lukket             |
|                                          |
|        [Annuller]    [Gem]               |
+------------------------------------------+
```

---

## 5. Technical Requirements

### 5.1 Database Schema

Add new tables to SQLite database:

```sql
-- Posting categories
CREATE TABLE IF NOT EXISTS PostingCategory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAtUtc TEXT NOT NULL,
  updatedAtUtc TEXT NOT NULL
);

-- Fiscal years
CREATE TABLE IF NOT EXISTS FiscalYear (
  year INTEGER PRIMARY KEY,
  openingCashBalance REAL NOT NULL DEFAULT 0,
  openingBankBalance REAL NOT NULL DEFAULT 0,
  isClosed INTEGER NOT NULL DEFAULT 0,
  createdAtUtc TEXT NOT NULL,
  updatedAtUtc TEXT NOT NULL
);

-- Financial transactions (header)
CREATE TABLE IF NOT EXISTS FinancialTransaction (
  id TEXT PRIMARY KEY,
  fiscalYear INTEGER NOT NULL,
  sequenceNumber INTEGER NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  cashIn REAL,
  cashOut REAL,
  bankIn REAL,
  bankOut REAL,
  notes TEXT,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  createdAtUtc TEXT NOT NULL,
  updatedAtUtc TEXT NOT NULL,
  FOREIGN KEY (fiscalYear) REFERENCES FiscalYear(year),
  UNIQUE(fiscalYear, sequenceNumber)
);

-- Transaction lines (itemized with optional member links)
CREATE TABLE IF NOT EXISTS TransactionLine (
  id TEXT PRIMARY KEY,
  transactionId TEXT NOT NULL,
  categoryId TEXT NOT NULL,
  amount REAL NOT NULL,
  isIncome INTEGER NOT NULL DEFAULT 0,
  memberId TEXT,
  lineDescription TEXT,
  FOREIGN KEY (transactionId) REFERENCES FinancialTransaction(id),
  FOREIGN KEY (categoryId) REFERENCES PostingCategory(id),
  FOREIGN KEY (memberId) REFERENCES Member(id)
);

-- Index for efficient member fee lookups
CREATE INDEX IF NOT EXISTS idx_transaction_line_member 
  ON TransactionLine(memberId) WHERE memberId IS NOT NULL;

-- Fee rates per fiscal year and member type
CREATE TABLE IF NOT EXISTS FeeRate (
  fiscalYear INTEGER NOT NULL,
  memberType TEXT NOT NULL,
  feeAmount REAL NOT NULL,
  PRIMARY KEY (fiscalYear, memberType),
  FOREIGN KEY (fiscalYear) REFERENCES FiscalYear(year)
);

-- Seed 2026 fee rates
INSERT OR IGNORE INTO FeeRate (fiscalYear, memberType, feeAmount) VALUES
  (2026, 'ADULT', 600),
  (2026, 'CHILD', 300),
  (2026, 'CHILD_PLUS', 600);
```

### 5.2 Member Entity Update (Dependency)

The Member table needs a `memberType` column. This requires a migration:

```sql
-- Add memberType to Member table
ALTER TABLE Member ADD COLUMN memberType TEXT DEFAULT 'ADULT';
```

Member types: `ADULT` (Voksen), `CHILD` (Barn), `CHILD_PLUS` (Barn+)

### 5.3 New Files Required

| File | Purpose |
|------|---------|
| `src/pages/FinancePage.tsx` | Main finance/kassebog page |
| `src/database/financeRepository.ts` | Database operations for transactions |
| `src/types/finance.ts` | TypeScript types for finance entities |
| `src/components/TransactionDialog.tsx` | Add/edit transaction modal |
| `src/components/YearSettingsDialog.tsx` | Fiscal year settings modal |
| `src/components/TransactionTable.tsx` | Transaction list component |
| `src/utils/excelExport.ts` | Excel export functionality |

### 5.5 Dependencies

- `xlsx` (SheetJS) - for Excel export

### 5.4 Data Migration

Create default posting categories on first run based on existing Kassebog structure.

---

## 6. Export Format Specification

### 6.1 Excel Workbook Structure

Match the existing "Kassebog 2025.xlsx" format:

**Sheet 1: Kassebog**

- Row 1: Category headers (spanning 2 columns each)
- Row 2: Column headers (#, Dato, Beskrivelse, Kasse, blank, Bank, blank, then category pairs)
- Row 3+: Transactions
- Each category has 2 columns: Income (left) and Expense (right)
- Bottom rows: Totals and closing balances

**Sheet 2: Årsresultat (Annual Result)**

- Summary by category
- Income section
- Expense section
- Year result calculation
- Signature lines for treasurer and auditor

### 6.2 Number Formatting

- Use Danish locale (comma as decimal separator)
- Currency format: 1.234,56 kr
- Date format: YYYY-MM-DD or DD-MM-YYYY

---

## 7. Acceptance Criteria

### 7.1 Must Have (MVP)

- [x] Can create new transactions with date, description, amount, category
- [x] Can view list of transactions for current year
- [x] Can set opening balances for a year
- [x] Running balances update correctly
- [x] Can export to Excel file matching Kassebog format

### 7.2 Should Have

- [x] Can edit existing transactions
- [x] Can delete transactions (soft delete)
- [x] Can filter by date range
- [x] Can filter by category
- [x] Can switch between fiscal years
- [x] Can close a fiscal year

### 7.3 Could Have

- [x] Search transactions by description
- [x] Carry forward balances to new year
- [x] Annual summary report (Årsresultat)
- [x] Print-friendly view

### 7.4 Won't Have (Future)

- ~~Link transactions to member fee payments~~ ✅ Implemented (member fee status, pending payments, consolidation)
- Import from bank CSV
- Multi-currency support
- Budget tracking

---

## 11. Import Pending Payments Feature

### 11.1 Overview

The Transaction Dialog now supports importing pending fee payments directly as transaction lines. This streamlines reconciliation by allowing the treasurer to select registered pending payments when creating a new transaction, converting them to transaction lines with pre-filled data.

### 11.2 User Flow

1. User opens "Ny transaktion" dialog
2. If there are unconsolidated pending payments, a collapsible section appears:
   - Header: "Importer fra afventende betalinger (N)" where N is the count
   - Clicking expands to show a checkbox list of payments
3. Each payment row shows:
   - Member name
   - Payment date (dd-mm-yyyy format)
   - Payment method (Kontant/Bank)
   - Amount (color-coded by payment method)
   - Optional notes
4. User can select individual payments or use "Vælg alle"
5. Clicking "Importer valgte" converts selected payments to transaction lines:
   - Category: `cat-kontingent` (member fee category)
   - Amount: from payment
   - Type: Income
   - Source: CASH or BANK based on payment method
   - Member: linked to payment member
   - Line description: member name + notes
6. Header totals (Kasse ind/Bank ind) are automatically updated
7. Imported payments are hidden from the available list
8. On save, imported payments are marked as consolidated with the new transaction ID

### 11.3 Technical Details

#### New Repository Function

```typescript
/**
 * Mark pending fee payments as consolidated with a given transaction ID.
 * Used when importing payments into a transaction via the TransactionDialog.
 */
export function markPaymentsAsConsolidated(paymentIds: string[], transactionId: string): void
```

#### TransactionDialog Props Changes

```typescript
interface TransactionDialogProps {
  // ... existing props
  pendingPayments?: PendingFeePaymentWithMember[];
  onSave: (data: TransactionFormData, consolidatePaymentIds?: string[]) => void;
}
```

#### State Management

- `importSectionExpanded`: Controls visibility of the import section
- `selectedPaymentIds`: Set of payment IDs selected for import
- `importedPaymentIds`: Set of payment IDs that have been imported (for consolidation on save)
- `availablePayments`: Memo filtering out already-imported payments

### 11.4 UI Considerations

- Only shown when creating new transactions (not editing)
- Only shown if there are unconsolidated pending payments
- Imported payments are removed from the available list (can't import twice)
- Empty lines in the transaction are replaced when importing
- Visual feedback shows count of imported payments

---

## 12. Mark Payment as Paid in Different Year

### 12.1 Overview

Handles the edge case where a pending payment is registered in the current year but was actually paid in a previous fiscal year. This allows proper reconciliation without creating duplicate entries.

### 12.2 Use Case

1. Member pays their fee in December 2025
2. The transaction is recorded in the 2025 books
3. In January 2026, someone registers a pending payment for this member
4. The pending payment needs to be cleared without affecting 2026 totals

### 12.3 User Flow

1. User opens "Konsolider betalinger" dialog
2. Each payment row has a calendar icon button (alongside delete)
3. Clicking the calendar opens a mini-dialog:
   - Shows member name and amount
   - Explains that this marks the payment as paid without creating a transaction
   - Year selector (defaults to previous year)
4. Clicking "Bekræft" marks the payment as consolidated
5. The payment is removed from the pending list
6. Notes field is updated with "Betalt i {year}" for audit trail

### 12.4 Technical Details

#### New Repository Function

```typescript
/**
 * Mark a pending fee payment as paid in a different year.
 * The payment is marked as consolidated without linking to a transaction.
 */
export function markPaymentAsPaidExternally(
  paymentId: string,
  paidInYear: number,
  notes?: string
): void
```

#### Database Changes

- Sets `isConsolidated = 1`
- Sets `consolidatedTransactionId = NULL` (no transaction link)
- Updates `notes` with year information for audit trail
- Updates `updatedAtUtc` timestamp

### 12.5 UI Components

Added to `ConsolidateFeePaymentsDialog`:
- `onMarkPaidExternally` callback prop
- Calendar button on each payment row
- Mini-dialog overlay for year selection
- Year dropdown (current year and 5 years back)

### 12.6 Fee Status Integration

Externally paid amounts are fully integrated into the member fee status:

#### MemberFeeStatusTable Changes
- New prop: `externallyPaidPayments?: PendingFeePaymentWithMember[]`
- Externally paid amounts count toward member's fee status
- "Betalt" column shows externally paid amounts with purple "(ext)" indicator
- Status badge shows "Betalt (ext)" when paid only via external payments
- Collection summary shows "Betalt i andet år" total in purple
- Filter logic includes externally paid in "partial" and excludes from "unpaid"

#### New Repository Function

```typescript
/**
 * Get fee payments that were marked as "paid externally" (in a different year).
 * These are consolidated payments without a transaction ID.
 */
export function getExternallyPaidFeePayments(year: number): PendingFeePaymentWithMember[]
```

#### Visual Indicators
- Purple color scheme for externally paid amounts (consistent differentiation)
- "(ext)" suffix on amounts and status badges
- Tooltip explaining "Betalt i andet år" on hover

### 12.7 Online Database Sync

The `PendingFeePayment` table is synced to the online database. When a payment is marked as "paid externally":

1. Local database is updated (`isConsolidated=1`, `consolidatedTransactionId=NULL`, updated notes)
2. `onlineSyncService.pushPendingFeePaymentUpdate(paymentId)` is called immediately
3. The update is pushed to the online database for consistency across devices

#### New Sync Function

```typescript
/**
 * Push a pending fee payment update to the online database.
 * Call this after updating a pending fee payment locally.
 */
async pushPendingFeePaymentUpdate(paymentId: string): Promise<boolean>
```

This mirrors the existing `pushPendingFeePaymentDelete()` function for immediate consistency.

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Excel export format mismatch | High | Test with actual Kassebog template |
| Calculation errors | High | Unit tests for all balance calculations |
| Data loss | High | Soft delete, database backup |
| Danish number format issues | Medium | Use proper locale handling |

---

## 9. Open Questions

1. Should transactions be synced to tablets? (Probably not - finance is laptop-only)
2. Should we support attaching receipts/documents to transactions?
3. Should we track who created/modified each transaction?
4. Is there a need for approval workflow for large transactions?

---

## 10. Implementation Phases

### Phase 1: Core Transaction Recording (MVP)

- Database schema and migrations
- Transaction CRUD operations
- Basic transaction list view
- Add transaction dialog

### Phase 2: Reporting and Export

- Running balance calculations
- Year settings dialog
- Excel export (basic format)
- Category summary view

### Phase 3: Polish and Additional Features

- Year-over-year navigation
- Filtering and search
- Full Kassebog Excel format with Årsresultat sheet
- Year closing workflow

---

## Appendix A: Kassebog Column Mapping

Based on "Kassebog 2025.xlsx":

| Excel Column | Purpose |
|--------------|---------|
| A | Sequence # |
| B | Date |
| C | Description |
| D | Cash In |
| E | Cash Out |
| F | Bank In |
| G | Bank Out |
| H-I | Patroner/skiver (In/Out) |
| J-K | Kapskydning/præmier (In/Out) |
| L-M | Kontingent/Bestyrelse (In/Out) |
| N-O | Våben/vedligeholdelse (In/Out) |
| P-Q | Porto/Kontoart (In/Out) |
| R-S | Begr/gaver/støtte (In/Out) |
| T-U | Diverse/renter/gebyr (In/Out) |
| V-W | Tilskud/kontingent hovedafdeling (In/Out) |
| X-Y | Vand (In/Out) |
