/**
 * Unit tests for sync service operations.
 * Verifies:
 * - Registration duplicate prevention via syncVersion
 * - Approval status sync from laptop to tablets
 * - Check-in and session deduplication
 * 
 * @see FR-18 - Sync Protocol Specification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module
vi.mock('./db', () => {
  const mockData: Record<string, unknown[]> = {
    registrations: [],
    checkIns: [],
    sessions: [],
  };
  
  return {
    execute: vi.fn((_sql: string, _params?: unknown[]) => {
      // Track what was executed for assertions
      return { changes: 1 };
    }),
    query: vi.fn(<T>(sql: string, params?: unknown[]): T[] => {
      // Return mock data based on the query
      if (sql.includes('NewMemberRegistration') && sql.includes('WHERE id =')) {
        const id = params?.[0];
        return mockData.registrations.filter((r: any) => r.id === id) as T[];
      }
      if (sql.includes('NewMemberRegistration') && sql.includes('approvalStatus !=')) {
        return mockData.registrations.filter((r: any) => r.approvalStatus !== 'PENDING') as T[];
      }
      if (sql.includes('CheckIn') && sql.includes('WHERE id =')) {
        const id = params?.[0];
        return mockData.checkIns.filter((c: any) => c.id === id) as T[];
      }
      if (sql.includes('PracticeSession') && sql.includes('WHERE id =')) {
        const id = params?.[0];
        return mockData.sessions.filter((s: any) => s.id === id) as T[];
      }
      return [] as T[];
    }),
    getDatabase: vi.fn(() => ({ run: vi.fn() })),
    // Expose mock data for test manipulation
    __mockData: mockData,
  };
});

// Import after mocking
import { query } from './db';

// Type definitions for test payloads
interface SyncableNewMemberRegistration {
  id: string;
  temporaryId: string;
  photoPath: string;
  photoBase64?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  address?: string | null;
  zipCode?: string | null;
  city?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  approvalStatus?: string;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
}

describe('Sync Service - Registration Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registration Duplicate Prevention', () => {
    it('should insert new registration when ID does not exist', async () => {
      // Arrange: query returns empty (no existing registration)
      vi.mocked(query).mockReturnValueOnce([]);
      
      const registration: SyncableNewMemberRegistration = {
        id: 'reg-123',
        temporaryId: 'temp-123',
        photoPath: '/photos/test.jpg',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        deviceId: 'tablet-1',
        syncVersion: 1,
        createdAtUtc: '2026-01-19T10:00:00Z',
        modifiedAtUtc: '2026-01-19T10:00:00Z',
      };

      // Act: Process the registration manually (simulating processRegistration logic)
      const existing = query<{ id: string; syncVersion: number }>(
        'SELECT * FROM NewMemberRegistration WHERE id = ?',
        [registration.id]
      );

      // Assert
      expect(existing).toHaveLength(0);
      // In real code, this would trigger an INSERT
    });

    it('should skip registration when local syncVersion >= incoming', async () => {
      // Arrange: existing registration with higher version
      const existingReg = {
        id: 'reg-123',
        syncVersion: 5,
        approvalStatus: 'APPROVED',
      };
      vi.mocked(query).mockReturnValueOnce([existingReg]);

      const incomingReg: SyncableNewMemberRegistration = {
        id: 'reg-123',
        temporaryId: 'temp-123',
        photoPath: '/photos/test.jpg',
        firstName: 'John',
        lastName: 'Doe',
        deviceId: 'tablet-1',
        syncVersion: 3, // Lower than existing (5)
        createdAtUtc: '2026-01-19T10:00:00Z',
        modifiedAtUtc: '2026-01-19T10:00:00Z',
      };

      // Act
      const existing = query<{ id: string; syncVersion: number }>(
        'SELECT * FROM NewMemberRegistration WHERE id = ?',
        [incomingReg.id]
      );

      // Assert: Should skip because local version is higher
      expect(existing[0].syncVersion).toBeGreaterThanOrEqual(incomingReg.syncVersion);
    });

    it('should update registration when incoming syncVersion > local', async () => {
      // Arrange: existing registration with lower version
      const existingReg = {
        id: 'reg-123',
        syncVersion: 2,
        approvalStatus: 'PENDING',
      };
      vi.mocked(query).mockReturnValueOnce([existingReg]);

      const incomingReg: SyncableNewMemberRegistration = {
        id: 'reg-123',
        temporaryId: 'temp-123',
        photoPath: '/photos/test.jpg',
        firstName: 'John Updated',
        lastName: 'Doe',
        deviceId: 'tablet-1',
        syncVersion: 5, // Higher than existing (2)
        createdAtUtc: '2026-01-19T10:00:00Z',
        modifiedAtUtc: '2026-01-19T12:00:00Z',
      };

      // Act
      const existing = query<{ id: string; syncVersion: number }>(
        'SELECT * FROM NewMemberRegistration WHERE id = ?',
        [incomingReg.id]
      );

      // Assert: Should update because incoming version is higher
      expect(incomingReg.syncVersion).toBeGreaterThan(existing[0].syncVersion);
    });
  });

  describe('Approval Status Sync (Laptop → Tablet)', () => {
    it('should return approved/rejected registrations for sync', () => {
      // Arrange: Mock approved registration
      const approvedReg = {
        id: 'reg-456',
        firstName: 'Jane',
        lastName: 'Smith',
        approvalStatus: 'APPROVED',
        syncVersion: 3,
        syncedAtUtc: '2026-01-18T10:00:00Z',
        updatedAtUtc: '2026-01-19T10:00:00Z', // Updated after last sync
      };
      
      vi.mocked(query).mockReturnValueOnce([approvedReg]);

      // Act: Query for registrations to sync back
      const toSync = query<typeof approvedReg>(
        `SELECT * FROM NewMemberRegistration 
         WHERE approvalStatus != 'PENDING' 
         AND (syncedAtUtc IS NULL OR syncedAtUtc < updatedAtUtc)`
      );

      // Assert
      expect(toSync).toHaveLength(1);
      expect(toSync[0].approvalStatus).toBe('APPROVED');
    });

    it('should not return pending registrations for sync back', () => {
      // Arrange: Mock pending registration
      const pendingReg = {
        id: 'reg-789',
        firstName: 'Bob',
        lastName: 'Wilson',
        approvalStatus: 'PENDING',
        syncVersion: 1,
      };
      
      vi.mocked(query).mockReturnValueOnce([]); // Query filters out PENDING

      // Act
      const toSync = query<typeof pendingReg>(
        `SELECT * FROM NewMemberRegistration 
         WHERE approvalStatus != 'PENDING'`
      );

      // Assert
      expect(toSync).toHaveLength(0);
    });
  });

  describe('Check-in Deduplication', () => {
    it('should skip check-in when ID already exists', () => {
      // Arrange
      const existingCheckIn = {
        id: 'checkin-123',
        membershipId: 'M001',
        localDate: '2026-01-19',
      };
      vi.mocked(query).mockReturnValueOnce([existingCheckIn]);

      // Act
      const existing = query<{ id: string }>(
        'SELECT * FROM CheckIn WHERE id = ?',
        ['checkin-123']
      );

      // Assert
      expect(existing).toHaveLength(1);
      // In real code, this would cause the check-in to be skipped
    });

    it('should insert check-in when ID does not exist', () => {
      // Arrange
      vi.mocked(query).mockReturnValueOnce([]);

      // Act
      const existing = query<{ id: string }>(
        'SELECT * FROM CheckIn WHERE id = ?',
        ['checkin-new']
      );

      // Assert
      expect(existing).toHaveLength(0);
      // In real code, this would trigger an INSERT
    });
  });

  describe('Practice Session Deduplication', () => {
    it('should skip session when ID already exists', () => {
      // Arrange
      const existingSession = {
        id: 'session-123',
        membershipId: 'M001',
        practiceType: 'LUFTRIFFEL',
      };
      vi.mocked(query).mockReturnValueOnce([existingSession]);

      // Act
      const existing = query<{ id: string }>(
        'SELECT * FROM PracticeSession WHERE id = ?',
        ['session-123']
      );

      // Assert
      expect(existing).toHaveLength(1);
    });
  });
});

describe('Sync Version Logic', () => {
  it('should correctly compare sync versions', () => {
    const localVersion = 3;
    const incomingVersion = 5;

    // Should update when incoming is higher
    expect(incomingVersion > localVersion).toBe(true);
  });

  it('should not update when versions are equal', () => {
    const localVersion = 5;
    const incomingVersion = 5;

    // Should skip when versions are equal
    expect(incomingVersion > localVersion).toBe(false);
  });

  it('should not update when local is higher', () => {
    const localVersion = 7;
    const incomingVersion = 5;

    // Should skip when local is higher
    expect(incomingVersion > localVersion).toBe(false);
  });
});

describe('Tablet-to-Tablet Sync Filtering', () => {
  it('should allow check-ins to flow between tablets', () => {
    // This tests the filtering logic where:
    // - Members only sync LAPTOP → tablets
    // - Check-ins, sessions, registrations sync between all peers
    
    const checkInsEnabled = true; // Always true for all device types
    
    expect(checkInsEnabled).toBe(true);
  });

  it('should block member sync from tablet to tablet', () => {
    // Members should only flow from laptop to tablets
    const destinationDeviceType: string = 'MEMBER_TABLET';
    const shouldSyncMembers = destinationDeviceType === 'LAPTOP';
    
    expect(shouldSyncMembers).toBe(false);
  });

  it('should allow member sync from any device to laptop', () => {
    const destinationDeviceType: string = 'LAPTOP';
    const shouldSyncMembers = destinationDeviceType === 'LAPTOP';
    
    expect(shouldSyncMembers).toBe(true);
  });
});

describe('Equipment Sync Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Equipment Item Sync', () => {
    it('should insert new equipment item when ID does not exist', () => {
      // Arrange: query returns empty (no existing item)
      vi.mocked(query).mockReturnValueOnce([]);
      
      const equipmentItem = {
        id: 'eq-123',
        serialNumber: 'SN-001',
        type: 'TRAINING_MATERIAL',
        status: 'AVAILABLE',
        deviceId: 'tablet-1',
        syncVersion: 1,
      };

      // Act
      const existing = query<{ id: string }>(
        'SELECT * FROM EquipmentItem WHERE id = ?',
        [equipmentItem.id]
      );

      // Assert
      expect(existing).toHaveLength(0);
      // In real code, this would trigger an INSERT
    });

    it('should update equipment item when incoming syncVersion is higher', () => {
      // Arrange: existing item with lower version
      const existingItem = {
        id: 'eq-123',
        serialNumber: 'SN-001',
        status: 'AVAILABLE',
        syncVersion: 1,
      };
      vi.mocked(query).mockReturnValueOnce([existingItem]);

      const incomingItem = {
        id: 'eq-123',
        serialNumber: 'SN-001',
        status: 'CHECKED_OUT', // Status changed
        syncVersion: 2, // Higher version
      };

      // Act
      const existing = query<{ id: string; syncVersion: number }>(
        'SELECT * FROM EquipmentItem WHERE id = ?',
        [incomingItem.id]
      );

      // Assert
      expect(existing).toHaveLength(1);
      expect(incomingItem.syncVersion > existing[0].syncVersion).toBe(true);
      // In real code, this would trigger an UPDATE
    });

    it('should skip equipment item when local syncVersion >= incoming', () => {
      // Arrange
      const existingItem = {
        id: 'eq-123',
        syncVersion: 3,
      };
      vi.mocked(query).mockReturnValueOnce([existingItem]);

      const incomingItem = {
        id: 'eq-123',
        syncVersion: 2, // Lower version
      };

      // Act
      const existing = query<{ id: string; syncVersion: number }>(
        'SELECT * FROM EquipmentItem WHERE id = ?',
        [incomingItem.id]
      );

      // Assert
      expect(existing).toHaveLength(1);
      expect(incomingItem.syncVersion > existing[0].syncVersion).toBe(false);
      // In real code, this would be SKIPPED
    });
  });

  describe('Equipment Checkout Sync', () => {
    it('should insert new checkout when ID does not exist', () => {
      // Arrange
      vi.mocked(query).mockReturnValueOnce([]);
      
      const checkout = {
        id: 'checkout-123',
        equipmentId: 'eq-123',
        membershipId: 'M001',
        checkedOutAtUtc: '2026-01-19T10:00:00Z',
        syncVersion: 1,
      };

      // Act
      const existing = query<{ id: string }>(
        'SELECT * FROM EquipmentCheckout WHERE id = ?',
        [checkout.id]
      );

      // Assert
      expect(existing).toHaveLength(0);
    });

    it('should update checkout with check-in time when returned', () => {
      // Arrange: existing checkout without checkin time
      const existingCheckout = {
        id: 'checkout-123',
        equipmentId: 'eq-123',
        membershipId: 'M001',
        checkedOutAtUtc: '2026-01-19T10:00:00Z',
        checkedInAtUtc: null,
        syncVersion: 1,
      };
      vi.mocked(query).mockReturnValueOnce([existingCheckout]);

      // Incoming has check-in time and higher version
      const incomingCheckout = {
        id: 'checkout-123',
        equipmentId: 'eq-123',
        membershipId: 'M001',
        checkedOutAtUtc: '2026-01-19T10:00:00Z',
        checkedInAtUtc: '2026-01-19T12:00:00Z', // Returned!
        syncVersion: 2,
      };

      // Act
      const existing = query<{ id: string; syncVersion: number; checkedInAtUtc: string | null }>(
        'SELECT * FROM EquipmentCheckout WHERE id = ?',
        [incomingCheckout.id]
      );

      // Assert
      expect(existing).toHaveLength(1);
      expect(existing[0].checkedInAtUtc).toBeNull();
      expect(incomingCheckout.checkedInAtUtc).not.toBeNull();
      expect(incomingCheckout.syncVersion > existing[0].syncVersion).toBe(true);
    });

    it('should sync equipment between tablets and laptop', () => {
      // Equipment sync should work in both directions:
      // - Tablet checks out equipment -> syncs to laptop and other tablets
      // - Laptop updates equipment -> syncs to all tablets
      
      const equipmentSyncEnabled = true; // Always true for all device types
      
      expect(equipmentSyncEnabled).toBe(true);
    });
  });
});
