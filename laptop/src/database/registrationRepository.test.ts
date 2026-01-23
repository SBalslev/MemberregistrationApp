/**
 * Unit tests for registration repository schema alignment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./db', () => ({
  execute: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn((fn: () => void) => fn())
}));

import { approveRegistration } from './registrationRepository';
import { execute, query } from './db';

describe('Registration repository schema consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should insert members using the current Member schema columns', () => {
    const registration = {
      id: 'reg-001',
      firstName: 'Anna',
      lastName: 'Jensen',
      birthday: '2001-02-03',
      gender: 'FEMALE',
      email: 'anna@example.com',
      phone: '12345678',
      address: 'Main Street 1',
      zipCode: '1000',
      city: 'Copenhagen',
      notes: null,
      photoPath: 'data:image/jpeg;base64,abc123',
      guardianName: null,
      guardianPhone: null,
      guardianEmail: null,
      sourceDeviceId: 'tablet-1',
      sourceDeviceName: 'Tablet 1',
      approvalStatus: 'PENDING',
      approvedAtUtc: null,
      rejectedAtUtc: null,
      rejectionReason: null,
      createdMemberId: null,
      createdAtUtc: '2026-01-22T09:00:00Z',
      syncedAtUtc: null,
      syncVersion: 1
    };

    vi.mocked(query).mockReturnValueOnce([registration]);

    approveRegistration('reg-001', 'M001');

    const insertCall = vi.mocked(execute).mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO Member')
    );

    expect(insertCall).toBeTruthy();
    const insertSql = insertCall?.[0] as string;
    expect(insertSql).toContain('internalId');
    expect(insertSql).toContain('memberLifecycleStage');
    expect(insertSql).toContain('birthDate');
    expect(insertSql).toContain('registrationPhotoPath');
    expect(insertSql).not.toContain('photoUri');
    expect(insertSql).not.toContain('birthday');
  });
});
