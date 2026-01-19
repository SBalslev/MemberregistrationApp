# Financial Transactions - Implementation Tasks

**Feature:** Club Financial Transaction Recording and Reporting
**PRD:** [prd.md](prd.md)
**Created:** 2026-01-19

---

## Phase 1: Core Transaction Recording (MVP)

### Task 1.1: Database Schema and Types

**Status:** Not Started
**Estimated Effort:** 2-3 hours

- [ ] Create `src/types/finance.ts` with TypeScript interfaces:
  - `PostingCategory`
  - `FiscalYear`
  - `FeeRate`
  - `MemberType` enum (ADULT, CHILD, CHILD_PLUS)
  - `FinancialTransaction`
  - `TransactionLine` (with optional memberId and lineDescription)
  - `TransactionWithLines` (transaction + lines combined)
  - `TransactionFormData`
- [ ] Create database migration in `src/database/financeRepository.ts`:
  - `PostingCategory` table
  - `FiscalYear` table
  - `FeeRate` table
  - `FinancialTransaction` table
  - `TransactionLine` table (with memberId FK)
- [ ] Add `memberType` column to Member table (ALTER TABLE migration)
- [ ] Update `src/types/entities.ts` to add `memberType` to Member interface
- [ ] Add `initializeFinanceTables()` function to be called on app startup
- [ ] Add `seedDefaultCategories()` function for initial posting categories
- [ ] Add `seedDefaultFeeRates()` function for 2026 rates (Voksen=600, Barn=300, Barn+=600)

**Acceptance Criteria:**

- Tables are created on first app launch
- Default categories match Kassebog structure
- Types are properly exported and usable

---

### Task 1.2: Finance Repository - CRUD Operations

**Status:** Not Started
**Estimated Effort:** 3-4 hours

- [ ] Implement category operations:
  - `getCategories(): Promise<PostingCategory[]>`
  - `getCategoryById(id: string): Promise<PostingCategory | null>`
- [ ] Implement fiscal year operations:
  - `getFiscalYears(): Promise<FiscalYear[]>`
  - `getFiscalYear(year: number): Promise<FiscalYear | null>`
  - `createFiscalYear(year: FiscalYear): Promise<void>`
  - `updateFiscalYear(year: FiscalYear): Promise<void>`
- [ ] Implement transaction operations:
  - `getTransactionsByYear(year: number): Promise<FinancialTransaction[]>`
  - `getTransactionById(id: string): Promise<FinancialTransaction | null>`
  - `createTransaction(txn: FinancialTransaction): Promise<void>`
  - `updateTransaction(txn: FinancialTransaction): Promise<void>`
  - `deleteTransaction(id: string): Promise<void>` (soft delete)
  - `getNextSequenceNumber(year: number): Promise<number>`
- [ ] Implement balance calculations:
  - `getRunningBalances(year: number): Promise<{cash: number, bank: number}>`
  - `getCategoryTotals(year: number): Promise<CategoryTotal[]>`

**Acceptance Criteria:**

- All CRUD operations work correctly
- Sequence numbers auto-increment per year
- Soft delete sets `isDeleted = 1`

---

### Task 1.3: Finance Page - Basic Layout

**Status:** Not Started
**Estimated Effort:** 2-3 hours

- [ ] Create `src/pages/FinancePage.tsx`
- [ ] Add page header with:
  - Title "Kassebog {year}"
  - Year selector dropdown
  - Add transaction button (+)
- [ ] Add balance summary bar:
  - Current cash balance
  - Current bank balance
- [ ] Add placeholder for transaction table
- [ ] Add route to App.tsx
- [ ] Add sidebar navigation item in `Sidebar.tsx`:
  - Icon: Wallet or Receipt from lucide-react
  - Label: "Økonomi"
  - Position: After Equipment

**Acceptance Criteria:**

- Page renders without errors
- Navigation works from sidebar
- Year selector shows available years

---

### Task 1.4: Transaction Table Component

**Status:** Not Started
**Estimated Effort:** 3-4 hours

- [ ] Create `src/components/finance/TransactionTable.tsx`
- [ ] Display columns:
  - # (sequence number)
  - Dato (date)
  - Beskrivelse (description)
  - Kasse Ind/Ud (cash in/out, combined display)
  - Bank Ind/Ud (bank in/out, combined display)
  - S.Kasse (running cash balance after this transaction)
  - S.Bank (running bank balance after this transaction)
  - Kategorier (list of categories from split lines)
- [ ] Calculate running balances per row from opening balance
- [ ] Sort by date/sequence number
- [ ] Add row actions: Edit, Delete
- [ ] Style positive amounts in green, negative in red
- [ ] Handle empty state

**Acceptance Criteria:**

- Table displays transactions correctly
- Amounts formatted with Danish locale
- Row actions trigger edit/delete

---

### Task 1.5: Add/Edit Transaction Dialog

**Status:** Not Started
**Estimated Effort:** 3-4 hours

- [ ] Create `src/components/finance/TransactionDialog.tsx`
- [ ] Form fields:
  - Date picker
  - Description (text input, e.g., "MobilePay Februar")
  - Cash In (number input, optional)
  - Cash Out (number input, optional)
  - Bank In (number input, optional)
  - Bank Out (number input, optional)
  - Transaction lines (dynamic list):
    - Category dropdown
    - Amount
    - Income/Expense toggle
    - Member dropdown (optional, for linking to member)
    - Line description (optional, e.g., "Kontingent 2025")
    - Add/remove line buttons
  - Notes (textarea, optional)
- [ ] Support bulk-add helper for multiple member payments:
  - Select category (e.g., FEES)
  - Select multiple members
  - Enter amount per member
  - Auto-generate lines
- [ ] Validation:
  - Date required
  - Description required (min 3 chars)
  - At least one cash/bank amount required
  - At least one category split required
  - Split amounts should sum to total transaction amount
- [ ] Handle create and edit modes
- [ ] Auto-assign sequence number on create

**Acceptance Criteria:**

- Dialog opens for new and edit
- Validation errors shown clearly
- Save creates/updates transaction
- Dialog closes on save/cancel

---

### Task 1.6: Delete Transaction Confirmation

**Status:** Not Started
**Estimated Effort:** 1 hour

- [ ] Add confirmation dialog before delete
- [ ] Implement soft delete (set isDeleted = 1)
- [ ] Remove transaction from visible list
- [ ] Update balances after delete

**Acceptance Criteria:**

- User must confirm deletion
- Transaction hidden but not removed from DB
- Balances recalculate correctly

---

## Phase 2: Reporting and Export

### Task 2.1: Year Settings Dialog

**Status:** Not Started
**Estimated Effort:** 2 hours

- [ ] Create `src/components/finance/YearSettingsDialog.tsx`
- [ ] Fields:
  - Opening cash balance
  - Opening bank balance
  - Year status (open/closed toggle)
- [ ] Add "Create New Year" functionality
- [ ] Add button to access from FinancePage header

**Acceptance Criteria:**

- Can set opening balances
- Can close year (prevents edits)
- Can create new fiscal year

---

### Task 2.2: Running Balance Calculations

**Status:** Not Started
**Estimated Effort:** 2-3 hours

- [ ] Calculate running totals correctly:
  - Running Cash = Opening + Sum(CashIn) - Sum(CashOut)
  - Running Bank = Opening + Sum(BankIn) - Sum(BankOut)
- [ ] Display in balance summary bar
- [ ] Update on transaction add/edit/delete
- [ ] Add per-row running balance (optional)

**Acceptance Criteria:**

- Balances match manual calculation
- Updates in real-time on changes

---

### Task 2.3: Excel Export - Basic

**Status:** Not Started
**Estimated Effort:** 4-5 hours

- [ ] Add `xlsx` or `exceljs` package dependency
- [ ] Create `src/utils/excelExport.ts`
- [ ] Implement `exportKassebog(year: number)` function
- [ ] Generate Excel with:
  - Header row with column names
  - Transaction rows
  - Cash/Bank columns
  - Category columns (income/expense pairs)
- [ ] Match Danish number formatting
- [ ] Add export button to FinancePage

**Acceptance Criteria:**

- Exports valid .xlsx file
- Column structure matches Kassebog template
- Numbers formatted correctly

---

### Task 2.4: Category Totals View

**Status:** Not Started
**Estimated Effort:** 2 hours

- [ ] Add summary section or tab to FinancePage
- [ ] Show each category with:
  - Total income
  - Total expense
  - Net (income - expense)
- [ ] Calculate year result (total income - total expense)

**Acceptance Criteria:**

- Totals are accurate
- Matches expected Kassebog summary

---

### Task 2.5: Member Fee Tracking View

**Status:** Not Started
**Estimated Effort:** 3-4 hours

- [ ] Add `getFeeRate(year: number, memberType: string)` to repository
- [ ] Create `src/components/finance/MemberFeeStatusTable.tsx`
- [ ] Query transaction lines where categoryId = FEES and memberId is set
- [ ] For each active member, show:
  - Member name
  - Member type (Voksen/Barn/Barn+)
  - Expected fee (from FeeRate table: Voksen=600, Barn=300, Barn+=600)
  - Amount paid (sum of FEES lines)
  - Outstanding balance
  - Payment date(s)
- [ ] Add filter: Show all / Paid / Unpaid
- [ ] Add tab or section in FinancePage for fee status
- [ ] Allow click-through to see member's payment history

**Acceptance Criteria:**

- Shows all members with fee status
- Correctly calculates paid/outstanding amounts
- Filters work correctly

---

### Task 2.6: Member Transaction History

**Status:** Not Started
**Estimated Effort:** 2 hours

- [ ] Add `getMemberTransactionLines(memberId: string, year?: number)` to repository
- [ ] Create dialog or panel showing:
  - All transaction lines linked to a member
  - Grouped by category (fees, punchcards, etc.)
  - Total amounts per category
- [ ] Accessible from member page or fee status table

**Acceptance Criteria:**

- Shows complete history for member
- Correct totals per category

---

## Phase 3: Polish and Additional Features

### Task 3.1: Filtering and Search

**Status:** Not Started
**Estimated Effort:** 2-3 hours

- [ ] Add date range filter
- [ ] Add category filter dropdown
- [ ] Add search by description
- [ ] Persist filter state during session

**Acceptance Criteria:**

- Filters work correctly
- Can combine multiple filters
- Clear filters button

---

### Task 3.2: Full Excel Export with Årsresultat

**Status:** Not Started
**Estimated Effort:** 3-4 hours

- [ ] Add second sheet "Årsresultat"
- [ ] Include:
  - Income by category
  - Expense by category
  - Year result calculation
  - Signature lines
- [ ] Match exact Kassebog 2025.xlsx format
- [ ] Add formatting (borders, fonts, etc.)

**Acceptance Criteria:**

- Two-sheet workbook exports correctly
- Format matches template exactly

---

### Task 3.3: Year Navigation and Carry Forward

**Status:** Not Started
**Estimated Effort:** 2 hours

- [ ] Easy switching between years
- [ ] "Carry Forward" button to create new year
- [ ] Auto-populate opening balances from previous closing
- [ ] Prevent edits to closed years

**Acceptance Criteria:**

- Can navigate between years smoothly
- Carry forward calculates correctly

---

### Task 3.4: Mobile-Responsive Layout

**Status:** Not Started
**Estimated Effort:** 2 hours

- [ ] Ensure FinancePage works on smaller screens
- [ ] Responsive table or card layout
- [ ] Touch-friendly controls

**Acceptance Criteria:**

- Usable on laptop and tablet sizes
- No horizontal scroll on small screens

---

## Technical Notes

### Dependencies to Add

```bash
npm install xlsx
# or
npm install exceljs
```

### Database Initialization

Add to `src/database/index.ts`:

```typescript
import { initializeFinanceTables } from './financeRepository';

// In initializeDatabase() function:
await initializeFinanceTables();
```

### File Structure

```
src/
├── components/
│   └── finance/
│       ├── TransactionTable.tsx
│       ├── TransactionDialog.tsx
│       └── YearSettingsDialog.tsx
├── database/
│   └── financeRepository.ts
├── pages/
│   └── FinancePage.tsx
├── types/
│   └── finance.ts
└── utils/
    └── excelExport.ts
```

---

## Progress Tracking

| Phase | Tasks | Completed | Progress |
|-------|-------|-----------|----------|
| Phase 1 | 6 | 0 | 0% |
| Phase 2 | 4 | 0 | 0% |
| Phase 3 | 4 | 0 | 0% |
| **Total** | **14** | **0** | **0%** |

---

## Definition of Done

- [ ] Feature implemented according to PRD
- [ ] No TypeScript errors
- [ ] App builds successfully
- [ ] Manual testing completed
- [ ] Export tested with actual Kassebog template
