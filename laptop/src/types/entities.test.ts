/**
 * Unit tests for entity helper functions.
 * Tests age calculation, adult detection, and ID photo status helpers.
 *
 * @see Enhanced Trial Registration - Phase 2 Age Validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateAge, isAdult, needsIdPhoto, getIdPhotoStatus } from './entities';
import type { Member } from './entities';

// Helper to create a minimal member for testing
function createTestMember(overrides: Partial<Member> = {}): Member {
  return {
    internalId: 'test-123',
    membershipId: null,
    memberLifecycleStage: 'TRIAL',
    status: 'ACTIVE',
    firstName: 'Test',
    lastName: 'User',
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
    expiresOn: null,
    photoPath: null,
    photoThumbnail: null,
    registrationPhotoPath: null,
    idPhotoPath: null,
    idPhotoThumbnail: null,
    mergedIntoId: null,
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
    syncedAtUtc: null,
    syncVersion: 0,
    ...overrides,
  };
}

describe('calculateAge', () => {
  beforeEach(() => {
    // Mock current date to 2026-01-28 for predictable tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-28'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for null birthDate', () => {
    expect(calculateAge(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(calculateAge('')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(calculateAge('not-a-date')).toBeNull();
    expect(calculateAge('2026-13-01')).toBeNull(); // Invalid month
  });

  it('calculates age correctly for past birthday this year', () => {
    // Born Jan 1, 2000 - birthday has passed
    expect(calculateAge('2000-01-01')).toBe(26);
  });

  it('calculates age correctly for future birthday this year', () => {
    // Born Dec 31, 2000 - birthday hasn't happened yet
    expect(calculateAge('2000-12-31')).toBe(25);
  });

  it('calculates age correctly for birthday today', () => {
    // Born Jan 28, 2000 - birthday is today
    expect(calculateAge('2000-01-28')).toBe(26);
  });

  it('calculates age correctly for someone born yesterday', () => {
    // Born Jan 27, 2026 - 1 day old
    expect(calculateAge('2026-01-27')).toBe(0);
  });

  it('calculates age correctly for 18-year-old threshold', () => {
    // Exactly 18 (birthday passed)
    expect(calculateAge('2008-01-01')).toBe(18);

    // Still 17 (birthday not yet)
    expect(calculateAge('2008-02-01')).toBe(17);
  });

  it('handles leap year birthdays', () => {
    // Born Feb 29, 2000 (leap year)
    expect(calculateAge('2000-02-29')).toBe(25); // Before their birthday in 2026
  });
});

describe('isAdult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-28'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for member without birthDate', () => {
    const member = createTestMember({ birthDate: null });
    expect(isAdult(member)).toBe(false);
  });

  it('returns true for member aged 18+', () => {
    const member = createTestMember({ birthDate: '2000-01-01' }); // 26 years old
    expect(isAdult(member)).toBe(true);
  });

  it('returns true for member exactly 18', () => {
    const member = createTestMember({ birthDate: '2008-01-01' }); // Exactly 18
    expect(isAdult(member)).toBe(true);
  });

  it('returns false for member under 18', () => {
    const member = createTestMember({ birthDate: '2010-01-01' }); // 16 years old
    expect(isAdult(member)).toBe(false);
  });

  it('returns false for member turning 18 later this year', () => {
    const member = createTestMember({ birthDate: '2008-06-15' }); // Still 17
    expect(isAdult(member)).toBe(false);
  });
});

describe('needsIdPhoto', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-28'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for adult without ID photo', () => {
    const member = createTestMember({
      birthDate: '2000-01-01',
      idPhotoPath: null,
    });
    expect(needsIdPhoto(member)).toBe(true);
  });

  it('returns false for adult with ID photo', () => {
    const member = createTestMember({
      birthDate: '2000-01-01',
      idPhotoPath: '/photos/id/test-123.jpg',
    });
    expect(needsIdPhoto(member)).toBe(false);
  });

  it('returns false for minor without ID photo', () => {
    const member = createTestMember({
      birthDate: '2015-01-01', // 11 years old
      idPhotoPath: null,
    });
    expect(needsIdPhoto(member)).toBe(false);
  });

  it('returns false for member without birthDate', () => {
    const member = createTestMember({
      birthDate: null,
      idPhotoPath: null,
    });
    expect(needsIdPhoto(member)).toBe(false);
  });
});

describe('getIdPhotoStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-28'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "not_required" for minor', () => {
    const member = createTestMember({ birthDate: '2015-01-01' }); // 11 years old
    expect(getIdPhotoStatus(member)).toBe('not_required');
  });

  it('returns "not_required" for member without birthDate', () => {
    const member = createTestMember({ birthDate: null });
    expect(getIdPhotoStatus(member)).toBe('not_required');
  });

  it('returns "available" for adult with ID photo', () => {
    const member = createTestMember({
      birthDate: '2000-01-01',
      idPhotoPath: '/photos/id/test-123.jpg',
    });
    expect(getIdPhotoStatus(member)).toBe('available');
  });

  it('returns "pending" for adult without ID photo', () => {
    const member = createTestMember({
      birthDate: '2000-01-01',
      idPhotoPath: null,
    });
    expect(getIdPhotoStatus(member)).toBe('pending');
  });

  it('returns "available" for adult with ID photo even if thumbnail is missing', () => {
    const member = createTestMember({
      birthDate: '2000-01-01',
      idPhotoPath: '/photos/id/test-123.jpg',
      idPhotoThumbnail: null,
    });
    expect(getIdPhotoStatus(member)).toBe('available');
  });
});

describe('edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-28'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles member turning 18 on current date', () => {
    const member = createTestMember({ birthDate: '2008-01-28' }); // 18 today
    expect(isAdult(member)).toBe(true);
    expect(getIdPhotoStatus(member)).toBe('pending');
  });

  it('handles member turning 18 tomorrow', () => {
    const member = createTestMember({ birthDate: '2008-01-29' }); // 18 tomorrow
    expect(isAdult(member)).toBe(false);
    expect(getIdPhotoStatus(member)).toBe('not_required');
  });

  it('handles very old member', () => {
    const member = createTestMember({ birthDate: '1926-01-01' }); // 100 years old
    expect(isAdult(member)).toBe(true);
    expect(calculateAge(member.birthDate)).toBe(100);
  });

  it('handles newborn member', () => {
    const member = createTestMember({ birthDate: '2026-01-28' }); // Born today
    expect(isAdult(member)).toBe(false);
    expect(calculateAge(member.birthDate)).toBe(0);
  });
});
