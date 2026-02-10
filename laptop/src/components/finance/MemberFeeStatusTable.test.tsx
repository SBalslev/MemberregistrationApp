/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemberFeeStatusTable } from './MemberFeeStatusTable';
import type { Member } from '../../types/entities';
import type { FeeRate, TransactionWithLines, PendingFeePaymentWithMember } from '../../types';

vi.mock('../../utils/feeCategory', () => ({
  getEffectiveMemberType: () => 'ADULT',
}));

const baseMember = (overrides: Partial<Member>): Member => ({
  internalId: crypto.randomUUID(),
  membershipId: null,
  memberLifecycleStage: 'FULL',
  firstName: 'Test',
  lastName: 'Member',
  birthDate: null,
  gender: null,
  email: null,
  phone: null,
  address: null,
  zipCode: null,
  city: null,
  guardianName: null,
  guardianPhone: null,
  guardianEmail: null,
  memberType: 'ADULT',
  status: 'ACTIVE',
  expiresOn: null,
  registrationPhotoPath: null,
  photoPath: null,
  photoThumbnail: null,
  idPhotoPath: null,
  idPhotoThumbnail: null,
  mergedIntoId: null,
  createdAtUtc: new Date().toISOString(),
  updatedAtUtc: new Date().toISOString(),
  syncedAtUtc: null,
  syncVersion: 0,
  ...overrides,
});

const feeRates: FeeRate[] = [
  { fiscalYear: 2026, memberType: 'ADULT', feeAmount: 300 },
];

const buildTransaction = (memberId: string, amount: number): TransactionWithLines => {
  const transactionId = crypto.randomUUID();
  return {
    id: transactionId,
    fiscalYear: 2026,
    sequenceNumber: 1,
    date: '2026-02-05',
    description: 'Kontingent',
    cashIn: amount,
    cashOut: null,
    bankIn: null,
    bankOut: null,
    notes: null,
    isDeleted: false,
    createdAtUtc: '2026-02-05T10:00:00Z',
    updatedAtUtc: '2026-02-05T10:00:00Z',
    lines: [
      {
        id: crypto.randomUUID(),
        transactionId,
        categoryId: 'cat-kontingent',
        amount,
        isIncome: true,
        source: 'CASH',
        memberId,
        lineDescription: 'Kontingent',
      },
    ],
  };
};

const renderTable = (
  members: Member[],
  pendingPayments: PendingFeePaymentWithMember[],
  transactions: TransactionWithLines[] = []
) => {
  render(
    <MemberFeeStatusTable
      members={members}
      transactions={transactions}
      feeRates={feeRates}
      year={2026}
      pendingPayments={pendingPayments}
      externallyPaidPayments={[]}
    />
  );
};

describe('MemberFeeStatusTable filters', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('shows members with pending consolidation under partial filter', () => {
    const member = baseMember({ firstName: 'Pending', lastName: 'Member' });
    const pendingPayments: PendingFeePaymentWithMember[] = [
      {
        id: 'pay-1',
        fiscalYear: 2026,
        memberId: member.internalId,
        amount: 150,
        paymentDate: '2026-02-01',
        paymentMethod: 'BANK',
        notes: null,
        isConsolidated: false,
        consolidatedTransactionId: null,
        createdAtUtc: '2026-02-01T10:00:00Z',
        updatedAtUtc: '2026-02-01T10:00:00Z',
        memberName: 'Pending Member',
        memberType: 'ADULT',
      },
    ];

    renderTable([member], pendingPayments);

    fireEvent.click(screen.getByRole('button', { name: 'Delvist' }));

    expect(screen.getByText('Pending Member')).toBeTruthy();
  });

  it('shows members with no payments and no pending under unpaid filter', () => {
    const member = baseMember({ firstName: 'Unpaid', lastName: 'Member' });

    renderTable([member], []);

    fireEvent.click(screen.getByRole('button', { name: 'Ikke betalt' }));

    expect(screen.getByText('Unpaid Member')).toBeTruthy();
  });

  it('does not show members without pending in partial filter', () => {
    const member = baseMember({ firstName: 'NoPending', lastName: 'Member' });

    renderTable([member], []);

    fireEvent.click(screen.getByRole('button', { name: 'Delvist' }));

    expect(screen.getByText('Ingen medlemmer matcher filteret')).toBeTruthy();
  });

  it('shows members with mismatched transaction amount under partial filter', () => {
    const member = baseMember({ firstName: 'Mismatch', lastName: 'Member' });
    const memberTransactions = [buildTransaction(member.internalId, 200)];

    renderTable([member], [], memberTransactions);

    fireEvent.click(screen.getByRole('button', { name: 'Delvist' }));

    expect(screen.getByText('Mismatch Member')).toBeTruthy();
  });

  it('shows members with full transaction amount under paid filter', () => {
    const member = baseMember({ firstName: 'Paid', lastName: 'Member' });
    const memberTransactions = [buildTransaction(member.internalId, 300)];

    renderTable([member], [], memberTransactions);

    fireEvent.click(screen.getByRole('button', { name: 'Betalt' }));

    expect(screen.getByText('Paid Member')).toBeTruthy();
  });
});