/**
 * Unit tests for fee category helpers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calculateAge, getFeeCategoryFromBirthDate, getEffectiveMemberType } from './feeCategory';
import type { Member } from '../types/entities';

describe('fee category helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates age correctly', () => {
    expect(calculateAge('2000-01-23')).toBe(26);
    expect(calculateAge('2000-12-31')).toBe(25);
  });

  it('returns child fee category for under 18', () => {
    expect(getFeeCategoryFromBirthDate('2010-01-01')).toBe('CHILD');
  });

  it('returns adult fee category for adults', () => {
    expect(getFeeCategoryFromBirthDate('2000-01-01')).toBe('ADULT');
  });

  it('preserves child plus for under 18', () => {
    expect(getFeeCategoryFromBirthDate('2012-01-01', 'CHILD_PLUS')).toBe('CHILD_PLUS');
  });

  it('preserves honorary status regardless of age', () => {
    // Honorary adult
    expect(getFeeCategoryFromBirthDate('2000-01-01', 'HONORARY')).toBe('HONORARY');
    // Honorary child
    expect(getFeeCategoryFromBirthDate('2012-01-01', 'HONORARY')).toBe('HONORARY');
    // Honorary with no birthdate
    expect(getFeeCategoryFromBirthDate(null, 'HONORARY')).toBe('HONORARY');
  });

  it('returns effective member type based on age', () => {
    const member: Member = {
      internalId: 'uuid-1',
      membershipId: 'M1',
      memberLifecycleStage: 'FULL',
      status: 'ACTIVE',
      firstName: 'Anna',
      lastName: 'Jensen',
      birthDate: '2012-01-01',
      gender: null,
      email: null,
      phone: null,
      address: null,
      zipCode: null,
      city: null,
      guardianName: null,
      guardianPhone: null,
      guardianEmail: null,
      memberType: 'CHILD_PLUS',
      expiresOn: null,
      registrationPhotoPath: null,
      photoPath: null,
      photoThumbnail: null,
      idPhotoPath: null,
      idPhotoThumbnail: null,
      mergedIntoId: null,
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: '2026-01-01T00:00:00Z',
      syncedAtUtc: null,
      syncVersion: 0,
    };

    expect(getEffectiveMemberType(member)).toBe('CHILD_PLUS');
  });

  it('returns HONORARY for honorary members regardless of age', () => {
    const honoraryMember: Member = {
      internalId: 'uuid-2',
      membershipId: 'M2',
      memberLifecycleStage: 'FULL',
      status: 'ACTIVE',
      firstName: 'Erik',
      lastName: 'Hansen',
      birthDate: '1950-01-01', // Adult, but honorary
      gender: null,
      email: null,
      phone: null,
      address: null,
      zipCode: null,
      city: null,
      guardianName: null,
      guardianPhone: null,
      guardianEmail: null,
      memberType: 'HONORARY',
      expiresOn: null,
      registrationPhotoPath: null,
      photoPath: null,
      photoThumbnail: null,
      idPhotoPath: null,
      idPhotoThumbnail: null,
      mergedIntoId: null,
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: '2026-01-01T00:00:00Z',
      syncedAtUtc: null,
      syncVersion: 0,
    };

    expect(getEffectiveMemberType(honoraryMember)).toBe('HONORARY');
  });
});
