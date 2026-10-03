/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemberHistoryDialog } from './MemberHistoryDialog';
import type { Member } from '../../types/entities';
import type { PostingCategory, TransactionWithLines } from '../../types';

const member: Member = {
  internalId: 'member-internal-id',
  membershipId: 'membership-number',
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
  cardStatus: 'none',
  cardFileReference: null,
  cardPrintedAtUtc: null,
  cardRequestedAtUtc: null,
  cardRequestedByDeviceId: null,
  createdAtUtc: '2026-02-05T10:00:00Z',
  updatedAtUtc: '2026-02-05T10:00:00Z',
  syncedAtUtc: null,
  syncVersion: 0,
};

const categories: PostingCategory[] = [
  {
    id: 'cat-kontingent',
    name: 'Kontingent',
    description: 'Membership fees',
    sortOrder: 1,
    isActive: true,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  },
];

const transactions: TransactionWithLines[] = [
  {
    id: 'transaction-1',
    fiscalYear: 2026,
    sequenceNumber: 42,
    date: '2026-02-05',
    description: 'Kontingentbetaling',
    cashIn: 300,
    cashOut: null,
    bankIn: null,
    bankOut: null,
    notes: null,
    isDeleted: false,
    createdAtUtc: '2026-02-05T10:00:00Z',
    updatedAtUtc: '2026-02-05T10:00:00Z',
    lines: [
      {
        id: 'line-1',
        transactionId: 'transaction-1',
        categoryId: 'cat-kontingent',
        amount: 300,
        isIncome: true,
        source: 'CASH',
        memberId: member.internalId,
        lineDescription: 'Kontingent 2026',
      },
    ],
  },
];

describe('MemberHistoryDialog', () => {
  it('shows transaction lines linked by the member internal ID', () => {
    const onEditTransaction = vi.fn();
    render(
      <MemberHistoryDialog
        isOpen
        onClose={() => undefined}
        member={member}
        transactions={transactions}
        categories={categories}
        year={2026}
        onEditTransaction={onEditTransaction}
      />
    );

    expect(screen.getByText('Kontingentbetaling')).toBeTruthy();
    expect(screen.getByText('Kontingent 2026')).toBeTruthy();
    expect(screen.getByText('#42')).toBeTruthy();
    expect(screen.queryByText('Ingen transaktioner fundet for dette medlem')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rediger bilag 42' }));

    expect(onEditTransaction).toHaveBeenCalledWith('transaction-1');
  });
});