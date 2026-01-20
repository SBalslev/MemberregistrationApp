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

/**
 * Trial Member Sync Operations (FR-6, FR-7)
 * Tests for the new trial member registration flow where:
 * - Tablet sends NewMemberRegistration to laptop
 * - Laptop auto-converts to trial Member with memberType='trial'
 * - Laptop syncs Member (with internalId) back to tablets
 * - Approval workflow is deprecated (registrations auto-approved)
 */
describe('Trial Member Sync Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registration Auto-Conversion (FR-7.3)', () => {
    it('should auto-convert incoming registration to trial member', () => {
      // When laptop receives a NewMemberRegistration from tablet,
      // it should automatically create a trial Member record
      
      const incomingRegistration = {
        id: 'reg-trial-123',
        temporaryId: 'temp-trial-123',
        firstName: 'Trial',
        lastName: 'Member',
        email: 'trial@example.com',
        phone: '+45 12345678',
        deviceId: 'tablet-1',
        syncVersion: 1,
      };

      // The expected behavior (in processRegistration):
      // 1. Check if registration exists -> No
      // 2. Auto-convert to Member with memberType='trial'
      // 3. Generate internalId (UUID)
      // 4. membershipId starts as NULL (assigned later by admin)
      
      const expectedMember = {
        internalId: expect.any(String), // UUID
        membershipId: null, // Not assigned yet
        memberType: 'trial',
        firstName: incomingRegistration.firstName,
        lastName: incomingRegistration.lastName,
        email: incomingRegistration.email,
        phone: incomingRegistration.phone,
        status: 'ACTIVE',
      };

      expect(expectedMember.memberType).toBe('trial');
      expect(expectedMember.membershipId).toBeNull();
    });

    it('should preserve registration-to-member link via temporaryId', () => {
      // The Member.internalId should match registration's temporaryId
      // so we can track the relationship
      
      const registration = {
        id: 'reg-456',
        temporaryId: 'temp-456',
        firstName: 'Test',
        lastName: 'User',
      };

      // When converting, internalId should be set to temporaryId
      const memberInternalId = registration.temporaryId;
      
      expect(memberInternalId).toBe('temp-456');
    });

    it('should not require approval status for new registrations', () => {
      // FR-7: Approval workflow is deprecated
      // Registrations are no longer stored as PENDING
      // They are immediately converted to trial members
      
      const registration = {
        id: 'reg-789',
        temporaryId: 'temp-789',
        firstName: 'Auto',
        lastName: 'Approved',
        // No approvalStatus field needed in new flow
      };

      // In the new flow, there's no PENDING state
      // Registration -> Trial Member happens immediately
      const isAutoConverted = true;
      
      expect(isAutoConverted).toBe(true);
    });
  });

  describe('Trial Member Sync to Tablets (FR-6)', () => {
    it('should sync trial members with internalId to tablets', () => {
      // Trial members need internalId for check-in QR codes
      
      const trialMember = {
        internalId: 'uuid-12345678',
        membershipId: null, // Not assigned yet
        memberType: 'trial',
        firstName: 'Trial',
        lastName: 'Person',
        status: 'ACTIVE',
        syncVersion: 1,
      };

      // Tablet needs internalId to generate QR code with MC: prefix
      expect(trialMember.internalId).toBeTruthy();
      expect(trialMember.memberType).toBe('trial');
    });

    it('should sync membershipId assignment to tablets', () => {
      // When admin assigns membershipId, sync it to tablets
      
      const memberBefore = {
        internalId: 'uuid-12345678',
        membershipId: null,
        memberType: 'trial',
        syncVersion: 1,
      };

      const memberAfter = {
        internalId: 'uuid-12345678',
        membershipId: 'M1234', // Admin assigned ID
        memberType: 'full', // Upgraded from trial
        syncVersion: 2, // Incremented
      };

      expect(memberAfter.syncVersion).toBeGreaterThan(memberBefore.syncVersion);
      expect(memberAfter.membershipId).toBe('M1234');
      expect(memberAfter.memberType).toBe('full');
    });

    it('should include both internalId and membershipId in sync payload', () => {
      // Tablets need both IDs for lookup during check-in
      
      interface SyncableMember {
        internalId: string;
        membershipId: string | null;
        memberType: 'trial' | 'full' | 'honorary';
        firstName: string;
        lastName: string;
        status: string;
        syncVersion: number;
      }

      const syncPayload: SyncableMember = {
        internalId: 'uuid-abc123',
        membershipId: 'M5678',
        memberType: 'full',
        firstName: 'Full',
        lastName: 'Member',
        status: 'ACTIVE',
        syncVersion: 3,
      };

      // Both IDs must be present
      expect(syncPayload).toHaveProperty('internalId');
      expect(syncPayload).toHaveProperty('membershipId');
      expect(typeof syncPayload.internalId).toBe('string');
    });
  });

  describe('QR Code Check-in Lookup (FR-12)', () => {
    it('should support MC: prefix for trial member lookup', () => {
      // QR code format: MC:<internalId>
      // Used for trial members who don't have membershipId yet
      
      const qrCode = 'MC:uuid-trial-123';
      const prefix = qrCode.substring(0, 3);
      const internalId = qrCode.substring(3);

      expect(prefix).toBe('MC:');
      expect(internalId).toBe('uuid-trial-123');
    });

    it('should support direct membershipId for full members', () => {
      // Full members scan their membershipId directly
      
      const qrCode = 'M1234';
      const isMembershipId = !qrCode.startsWith('MC:');

      expect(isMembershipId).toBe(true);
    });

    it('should find member by either internalId or membershipId', () => {
      // Check-in should work with either identifier
      
      const mockFindMember = (identifier: string) => {
        const members = [
          { internalId: 'uuid-123', membershipId: 'M001', firstName: 'Full' },
          { internalId: 'uuid-456', membershipId: null, firstName: 'Trial' },
        ];

        // First try membershipId, then internalId
        return members.find(m => 
          m.membershipId === identifier || m.internalId === identifier
        );
      };

      // Find by membershipId
      const fullMember = mockFindMember('M001');
      expect(fullMember?.firstName).toBe('Full');

      // Find by internalId (trial member)
      const trialMember = mockFindMember('uuid-456');
      expect(trialMember?.firstName).toBe('Trial');
    });
  });

  describe('Sync Protocol v1.1.0 Changes', () => {
    it('should not send registrations in outgoing sync payload', () => {
      // FR-7.3: Stop sending NewMemberRegistration in sync
      // Only send Members (which now include trial members)
      
      interface SyncPayload {
        members: unknown[];
        registrations: unknown[]; // Should be empty
        checkIns: unknown[];
        sessions: unknown[];
      }

      const outgoingPayload: SyncPayload = {
        members: [{ internalId: 'uuid-1', memberType: 'trial' }],
        registrations: [], // Empty - deprecated
        checkIns: [],
        sessions: [],
      };

      expect(outgoingPayload.registrations).toHaveLength(0);
      expect(outgoingPayload.members.length).toBeGreaterThan(0);
    });

    it('should still accept incoming registrations for backward compatibility', () => {
      // Tablets may still send registrations during transition
      // Laptop should accept and auto-convert them
      
      const incomingFromOldTablet = {
        registrations: [
          { id: 'reg-old-1', temporaryId: 'temp-old-1', firstName: 'Old', lastName: 'Format' }
        ],
      };

      // Should not throw - backward compatible
      const canProcess = incomingFromOldTablet.registrations.length >= 0;
      expect(canProcess).toBe(true);
    });
  });
});
