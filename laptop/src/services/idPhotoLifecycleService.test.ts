/**
 * Unit tests for ID Photo Lifecycle Service.
 * Tests the automatic deletion of ID photos when:
 * - Member has been assigned a membershipId (FULL member)
 * - Member has paid their membership fee for the current fiscal year
 *
 * @see Enhanced Trial Registration - Phase 8 ID Photo Deletion Rule
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasMemberPaidFee,
  checkIdPhotoEligibility,
  deleteIdPhotoIfEligible,
  findMembersEligibleForIdPhotoDeletion,
} from './idPhotoLifecycleService';

// Mock data stores
let mockMembers: Map<string, {
  internalId: string;
  membershipId: string | null;
  memberLifecycleStage: string;
  memberType: string;
  idPhotoPath: string | null;
  idPhotoThumbnail: string | null;
  firstName: string;
  lastName: string;
}>;

let mockFeeRates: Array<{ memberType: string; feeAmount: number }>;
let mockPendingPayments: Map<string, number>; // memberId -> total pending amount
let mockConsolidatedPayments: Map<string, number>; // memberId -> total consolidated amount
let mockExternallyPaidPayments: Map<string, number>; // memberId -> total externally paid amount
let mockExecutedQueries: string[];

// Mock the database module
vi.mock('../database/db', () => ({
  execute: vi.fn((sql: string) => {
    mockExecutedQueries.push(sql);
    return { changes: 1 };
  }),
  query: vi.fn(<T>(sql: string, params?: unknown[]): T[] => {
    // Get fee rates for year
    if (sql.includes('FROM FeeRate')) {
      return mockFeeRates as T[];
    }

    // Get externally paid fee total
    if (sql.includes('FROM PendingFeePayment') && sql.includes('isConsolidated = 1')) {
      const memberId = params?.[0] as string;
      const total = mockExternallyPaidPayments.get(memberId) ?? 0;
      return [{ total }] as T[];
    }

    // Get pending fee total
    if (sql.includes('FROM PendingFeePayment') && sql.includes('SUM(amount)')) {
      const memberId = params?.[0] as string;
      const total = mockPendingPayments.get(memberId) ?? 0;
      return [{ total }] as T[];
    }

    // Get consolidated fee total
    if (sql.includes('FROM TransactionLine') && sql.includes('SUM')) {
      const memberId = params?.[0] as string;
      const total = mockConsolidatedPayments.get(memberId) ?? 0;
      return [{ total }] as T[];
    }

    // Find eligible members
    if (sql.includes('memberLifecycleStage') && sql.includes('FULL') && sql.includes('idPhotoPath IS NOT NULL')) {
      return Array.from(mockMembers.values())
        .filter(m => m.memberLifecycleStage === 'FULL' && m.membershipId && m.idPhotoPath)
        .map(m => ({ internalId: m.internalId })) as T[];
    }

    return [];
  }),
}));

// Mock memberRepository
vi.mock('../database/memberRepository', () => ({
  getMemberByInternalId: vi.fn((internalId: string) => {
    return mockMembers.get(internalId) ?? null;
  }),
  queueMember: vi.fn(),
}));

// Mock financeRepository
vi.mock('../database/financeRepository', () => ({
  getFeeRatesForYear: vi.fn(() => mockFeeRates),
  getPendingFeeTotal: vi.fn((memberId: string) => mockPendingPayments.get(memberId) ?? 0),
}));

describe('IdPhotoLifecycleService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15')); // Mid-year for fee testing

    // Reset mock data
    mockMembers = new Map();
    mockFeeRates = [
      { memberType: 'ADULT', feeAmount: 600 },
      { memberType: 'CHILD', feeAmount: 300 },
      { memberType: 'CHILD_PLUS', feeAmount: 600 },
      { memberType: 'HONORARY', feeAmount: 0 },
    ];
    mockPendingPayments = new Map();
    mockConsolidatedPayments = new Map();
    mockExternallyPaidPayments = new Map();
    mockExecutedQueries = [];

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('hasMemberPaidFee', () => {
    it('returns false for non-existent member', () => {
      expect(hasMemberPaidFee('non-existent')).toBe(false);
    });

    it('returns true for honorary member (0 fee required)', () => {
      mockMembers.set('honorary-1', {
        internalId: 'honorary-1',
        membershipId: 'M001',
        memberLifecycleStage: 'FULL',
        memberType: 'HONORARY',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Honorary',
        lastName: 'Member',
      });

      expect(hasMemberPaidFee('honorary-1')).toBe(true);
    });

    it('returns false when pending payments cover full fee', () => {
      mockMembers.set('adult-1', {
        internalId: 'adult-1',
        membershipId: 'M002',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Test',
        lastName: 'Adult',
      });
      mockPendingPayments.set('adult-1', 600); // Full fee paid

      expect(hasMemberPaidFee('adult-1')).toBe(false);
    });

    it('returns true when consolidated payments cover full fee', () => {
      mockMembers.set('adult-2', {
        internalId: 'adult-2',
        membershipId: 'M003',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Test',
        lastName: 'Adult2',
      });
      mockConsolidatedPayments.set('adult-2', 600); // Full fee consolidated

      expect(hasMemberPaidFee('adult-2')).toBe(true);
    });

    it('returns true when externally paid amount matches full fee', () => {
      mockMembers.set('adult-external', {
        internalId: 'adult-external',
        membershipId: 'M003A',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'External',
        lastName: 'Paid',
      });
      mockExternallyPaidPayments.set('adult-external', 600);

      expect(hasMemberPaidFee('adult-external')).toBe(true);
    });

    it('returns false when pending exists even if consolidated covers full fee', () => {
      mockMembers.set('adult-3', {
        internalId: 'adult-3',
        membershipId: 'M004',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Test',
        lastName: 'Adult3',
      });
      mockPendingPayments.set('adult-3', 300);
      mockConsolidatedPayments.set('adult-3', 600); // Full fee consolidated

      expect(hasMemberPaidFee('adult-3')).toBe(false);
    });

    it('returns false when payments are insufficient', () => {
      mockMembers.set('adult-4', {
        internalId: 'adult-4',
        membershipId: 'M005',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Test',
        lastName: 'Adult4',
      });
      mockPendingPayments.set('adult-4', 200); // Only partial payment

      expect(hasMemberPaidFee('adult-4')).toBe(false);
    });

    it('handles child member type with lower fee', () => {
      mockMembers.set('child-1', {
        internalId: 'child-1',
        membershipId: 'M006',
        memberLifecycleStage: 'FULL',
        memberType: 'CHILD',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Test',
        lastName: 'Child',
      });
      mockConsolidatedPayments.set('child-1', 300); // Child fee is 300

      expect(hasMemberPaidFee('child-1')).toBe(true);
    });

    it('returns false when consolidated amount differs from expected fee', () => {
      mockMembers.set('adult-5', {
        internalId: 'adult-5',
        membershipId: 'M007',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Test',
        lastName: 'Adult5',
      });
      mockConsolidatedPayments.set('adult-5', 200); // Not equal to 600

      expect(hasMemberPaidFee('adult-5')).toBe(false);
    });
  });

  describe('checkIdPhotoEligibility', () => {
    it('returns not eligible for non-existent member', () => {
      const result = checkIdPhotoEligibility('non-existent');

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('Member not found');
    });

    it('returns not eligible for member without ID photo', () => {
      mockMembers.set('no-photo', {
        internalId: 'no-photo',
        membershipId: 'M007',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: null,
        idPhotoThumbnail: null,
        firstName: 'No',
        lastName: 'Photo',
      });
      mockPendingPayments.set('no-photo', 600);

      const result = checkIdPhotoEligibility('no-photo');

      expect(result.isEligible).toBe(false);
      expect(result.hasIdPhoto).toBe(false);
      expect(result.reason).toBe('No ID photo to delete');
    });

    it('returns not eligible for TRIAL member', () => {
      mockMembers.set('trial-1', {
        internalId: 'trial-1',
        membershipId: null,
        memberLifecycleStage: 'TRIAL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Trial',
        lastName: 'Member',
      });
      mockPendingPayments.set('trial-1', 600);

      const result = checkIdPhotoEligibility('trial-1');

      expect(result.isEligible).toBe(false);
      expect(result.hasMembershipId).toBe(false);
      expect(result.reason).toBe('Member has not been assigned a membership ID');
    });

    it('returns not eligible for unpaid member', () => {
      mockMembers.set('unpaid-1', {
        internalId: 'unpaid-1',
        membershipId: 'M008',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Unpaid',
        lastName: 'Member',
      });
      // No payments

      const result = checkIdPhotoEligibility('unpaid-1');

      expect(result.isEligible).toBe(false);
      expect(result.hasMembershipId).toBe(true);
      expect(result.hasFeePaid).toBe(false);
      expect(result.reason).toBe('Membership fee not yet paid for current fiscal year');
    });

    it('returns eligible when all conditions are met', () => {
      mockMembers.set('eligible-1', {
        internalId: 'eligible-1',
        membershipId: 'M009',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: 'data:image/jpeg;base64,...',
        firstName: 'Eligible',
        lastName: 'Member',
      });
      mockConsolidatedPayments.set('eligible-1', 600);

      const result = checkIdPhotoEligibility('eligible-1');

      expect(result.isEligible).toBe(true);
      expect(result.hasMembershipId).toBe(true);
      expect(result.hasFeePaid).toBe(true);
      expect(result.hasIdPhoto).toBe(true);
      expect(result.reason).toBe('All conditions met - ID photo can be deleted');
    });
  });

  describe('deleteIdPhotoIfEligible', () => {
    it('returns failure for non-existent member', () => {
      const result = deleteIdPhotoIfEligible('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Member not found');
    });

    it('returns failure when not eligible', () => {
      mockMembers.set('not-eligible', {
        internalId: 'not-eligible',
        membershipId: null,
        memberLifecycleStage: 'TRIAL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Not',
        lastName: 'Eligible',
      });

      const result = deleteIdPhotoIfEligible('not-eligible');

      expect(result.success).toBe(false);
      expect(result.memberName).toBe('Not Eligible');
    });

    it('successfully deletes ID photo for eligible member', () => {
      mockMembers.set('eligible-delete', {
        internalId: 'eligible-delete',
        membershipId: 'M010',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: 'data:image/jpeg;base64,...',
        firstName: 'Delete',
        lastName: 'Me',
      });
      mockConsolidatedPayments.set('eligible-delete', 600);

      const result = deleteIdPhotoIfEligible('eligible-delete');

      expect(result.success).toBe(true);
      expect(result.memberName).toBe('Delete Me');
      expect(result.reason).toBe('ID photo deleted successfully');

      // Verify UPDATE query was executed
      const updateQuery = mockExecutedQueries.find(q => q.includes('UPDATE Member') && q.includes('idPhotoPath = NULL'));
      expect(updateQuery).toBeDefined();
    });
  });

  describe('findMembersEligibleForIdPhotoDeletion', () => {
    it('returns empty array when no eligible members', () => {
      const result = findMembersEligibleForIdPhotoDeletion();
      expect(result).toEqual([]);
    });

    it('returns eligible member IDs', () => {
      // Add eligible member
      mockMembers.set('batch-eligible', {
        internalId: 'batch-eligible',
        membershipId: 'M011',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Batch',
        lastName: 'Eligible',
      });
      mockConsolidatedPayments.set('batch-eligible', 600);

      // Add ineligible member (no payment)
      mockMembers.set('batch-ineligible', {
        internalId: 'batch-ineligible',
        membershipId: 'M012',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Batch',
        lastName: 'Ineligible',
      });
      // No payment for this member

      const result = findMembersEligibleForIdPhotoDeletion();

      expect(result).toContain('batch-eligible');
      expect(result).not.toContain('batch-ineligible');
    });
  });

  describe('integration scenarios', () => {
    it('scenario: trial member gets membershipId, then pays - photo deleted', () => {
      // Start as trial member
      mockMembers.set('scenario-1', {
        internalId: 'scenario-1',
        membershipId: null,
        memberLifecycleStage: 'TRIAL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Scenario',
        lastName: 'One',
      });

      // Check - not eligible (no membershipId)
      let result = checkIdPhotoEligibility('scenario-1');
      expect(result.isEligible).toBe(false);

      // Assign membershipId
      mockMembers.get('scenario-1')!.membershipId = 'M100';
      mockMembers.get('scenario-1')!.memberLifecycleStage = 'FULL';

      // Check - still not eligible (no payment)
      result = checkIdPhotoEligibility('scenario-1');
      expect(result.isEligible).toBe(false);
      expect(result.hasMembershipId).toBe(true);
      expect(result.hasFeePaid).toBe(false);

      // Pay fee
      mockConsolidatedPayments.set('scenario-1', 600);

      // Check - now eligible
      result = checkIdPhotoEligibility('scenario-1');
      expect(result.isEligible).toBe(true);
    });

    it('scenario: trial member pays first, then gets membershipId - photo deleted', () => {
      // Start as trial member
      mockMembers.set('scenario-2', {
        internalId: 'scenario-2',
        membershipId: null,
        memberLifecycleStage: 'TRIAL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Scenario',
        lastName: 'Two',
      });

      // Pay fee first
      mockConsolidatedPayments.set('scenario-2', 600);

      // Check - not eligible (no membershipId)
      let result = checkIdPhotoEligibility('scenario-2');
      expect(result.isEligible).toBe(false);

      // Assign membershipId
      mockMembers.get('scenario-2')!.membershipId = 'M101';
      mockMembers.get('scenario-2')!.memberLifecycleStage = 'FULL';

      // Check - now eligible
      result = checkIdPhotoEligibility('scenario-2');
      expect(result.isEligible).toBe(true);
    });

    it('scenario: partial payment followed by rest - photo deleted after full payment', () => {
      mockMembers.set('scenario-3', {
        internalId: 'scenario-3',
        membershipId: 'M102',
        memberLifecycleStage: 'FULL',
        memberType: 'ADULT',
        idPhotoPath: '/photos/id.jpg',
        idPhotoThumbnail: null,
        firstName: 'Scenario',
        lastName: 'Three',
      });

      // Partial payment
      mockConsolidatedPayments.set('scenario-3', 300);

      // Not eligible - partial payment
      let result = checkIdPhotoEligibility('scenario-3');
      expect(result.isEligible).toBe(false);
      expect(result.hasFeePaid).toBe(false);

      // Complete payment
      mockConsolidatedPayments.set('scenario-3', 600);

      // Now eligible
      result = checkIdPhotoEligibility('scenario-3');
      expect(result.isEligible).toBe(true);
    });
  });
});
