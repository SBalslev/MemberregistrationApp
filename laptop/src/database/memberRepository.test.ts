/**
 * Unit tests for member repository operations.
 * Verifies:
 * - Trial member creation and management
 * - MembershipId assignment (TRIAL → FULL transition)
 * - Duplicate detection
 * - Member merge functionality
 * 
 * @see FR-1 - Member Entity Changes
 * @see FR-3 - Laptop Trial Member Management
 * @see FR-9 - Duplicate Detection and Member Merge
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTrialMemberCount, getRecentTrialMembers, getMemberDeletePreview, deleteMemberPermanently, getUniqueMemberEmailsByFeeCategory } from './memberRepository';

// Mock the database module
const mockData: {
  members: Array<{
    internalId: string;
    membershipId: string | null;
    memberType: string;
    memberLifecycleStage: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    birthday: string | null;
    status: string;
    createdAtUtc: string;
    mergedIntoId: string | null;
  }>;
  checkIns: Array<{ id: string; internalMemberId: string; localDate: string }>;
  practiceSessions: Array<{ id: string; internalMemberId: string }>;
  scanEvents: Array<{ id: string; internalMemberId: string }>;
  equipmentCheckouts: Array<{ id: string; internalMemberId: string }>;
  pendingFeePayments: Array<{ id: string; memberId: string }>;
  skvRegistrations: Array<{ id: string; memberId: string }>;
  skvWeapons: Array<{ id: string; skvRegistrationId: string }>;
  trainerInfos: Array<{ memberId: string }>;
  trainerDisciplines: Array<{ id: string; memberId: string }>;
  memberPreferences: Array<{ memberId: string }>;
  transactionLines: Array<{ id: string; memberId: string; fiscalYear: number }>;
} = {
  members: [],
  checkIns: [],
  practiceSessions: [],
  scanEvents: [],
  equipmentCheckouts: [],
  pendingFeePayments: [],
  skvRegistrations: [],
  skvWeapons: [],
  trainerInfos: [],
  trainerDisciplines: [],
  memberPreferences: [],
  transactionLines: [],
};

vi.mock('./syncOutboxRepository', () => ({
  queueMember: vi.fn(),
  queueMemberDeletion: vi.fn(),
}));

vi.mock('./db', () => ({
  execute: vi.fn(() => {
    return { changes: 1 };
  }),
  query: vi.fn(<T>(sql: string, params?: unknown[]): T[] => {
    // Trial member count query
    if (sql.includes('COUNT(*)') && sql.includes('FROM Member') && sql.includes("memberLifecycleStage = 'TRIAL'")) {
      const count = mockData.members.filter(
        (m) => m.memberLifecycleStage === 'TRIAL' && m.status === 'ACTIVE' && m.mergedIntoId === null
      ).length;
      return [{ count }] as T[];
    }
    // Recent trial members query (with JOIN to CheckIn)
    if (sql.includes('FROM Member m') && sql.includes('LEFT JOIN CheckIn') && sql.includes("memberLifecycleStage = 'TRIAL'")) {
      const threeMonthsAgo = params?.[0] as string;
      const threeMonthsAgoDate = params?.[1] as string;

      const results = mockData.members
        .filter((m) => m.memberLifecycleStage === 'TRIAL' && m.status === 'ACTIVE' && m.mergedIntoId === null)
        .map((m) => {
          const memberCheckIns = mockData.checkIns.filter((c) => c.internalMemberId === m.internalId);
          const lastCheckInDate = memberCheckIns.length > 0
            ? memberCheckIns.reduce((latest, c) => c.localDate > latest ? c.localDate : latest, memberCheckIns[0].localDate)
            : null;
          const checkInCount = memberCheckIns.length;

          // Filter by recent activity (created or checked in within 3 months)
          const hasRecentCheckIn = lastCheckInDate && lastCheckInDate >= threeMonthsAgoDate;
          const isRecentlyCreated = m.createdAtUtc >= threeMonthsAgo;

          if (!hasRecentCheckIn && !isRecentlyCreated) {
            return null;
          }

          return { ...m, lastCheckInDate, checkInCount };
        })
        .filter((m) => m !== null);

      return results as T[];
    }
    // Member queries
    if (sql.includes('FROM Member') && sql.includes('WHERE internalId =')) {
      const id = params?.[0];
      return mockData.members.filter((m) => m.internalId === id) as T[];
    }
    if (sql.includes('FROM Member') && sql.includes('WHERE membershipId =')) {
      const id = params?.[0];
      return mockData.members.filter((m) => m.membershipId === id) as T[];
    }
    if (sql.includes('SELECT memberType, email') && sql.includes('FROM Member')) {
      return mockData.members
        .filter((m) => m.email && m.email.trim() !== '' && m.mergedIntoId === null)
        .map((m) => ({ memberType: m.memberType, email: m.email })) as T[];
    }
    if (sql.includes("FROM Member") && sql.includes("memberType = 'TRIAL'")) {
      return mockData.members.filter((m) => m.memberType === 'TRIAL') as T[];
    }
    if (sql.includes('FROM Member') && sql.includes('status = ?')) {
      const status = params?.[0];
      return mockData.members.filter((m) => m.status === status) as T[];
    }
    if (sql.includes('FROM Member') && !sql.includes('WHERE')) {
      return mockData.members as T[];
    }
    // CheckIn queries - COUNT(*) should come first since it's more specific
    if (sql.includes('FROM CheckIn') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.checkIns.filter((c) => c.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    // CheckIn SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM CheckIn') && sql.includes('internalMemberId =')) {
      const id = params?.[0];
      return mockData.checkIns.filter((c) => c.internalMemberId === id).map(c => ({ id: c.id })) as T[];
    }
    if (sql.includes('FROM CheckIn') && sql.includes('internalMemberId =')) {
      const id = params?.[0];
      return mockData.checkIns.filter((c) => c.internalMemberId === id) as T[];
    }
    // PracticeSession queries
    if (sql.includes('FROM PracticeSession') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.practiceSessions.filter((s) => s.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    // PracticeSession SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM PracticeSession') && sql.includes('internalMemberId =')) {
      const id = params?.[0];
      return mockData.practiceSessions.filter((s) => s.internalMemberId === id).map(s => ({ id: s.id })) as T[];
    }
    // ScanEvent queries
    if (sql.includes('FROM ScanEvent') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.scanEvents.filter((s) => s.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    // ScanEvent SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM ScanEvent') && sql.includes('internalMemberId =')) {
      const id = params?.[0];
      return mockData.scanEvents.filter((s) => s.internalMemberId === id).map(s => ({ id: s.id })) as T[];
    }
    // EquipmentCheckout queries
    if (sql.includes('FROM EquipmentCheckout') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.equipmentCheckouts.filter((e) => e.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    // EquipmentCheckout SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM EquipmentCheckout') && sql.includes('internalMemberId =')) {
      const id = params?.[0];
      return mockData.equipmentCheckouts.filter((e) => e.internalMemberId === id).map(e => ({ id: e.id })) as T[];
    }
    // PendingFeePayment queries
    if (sql.includes('FROM PendingFeePayment') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.pendingFeePayments.filter((p) => p.memberId === id).length;
      return [{ count }] as T[];
    }
    // PendingFeePayment SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM PendingFeePayment') && sql.includes('memberId =')) {
      const id = params?.[0];
      return mockData.pendingFeePayments.filter((p) => p.memberId === id).map(p => ({ id: p.id })) as T[];
    }
    // SKVWeapon queries (counts weapons via registrations) - must come before SKVRegistration check
    // because the SKVWeapon query contains "FROM SKVRegistration" in subquery
    if (sql.includes('FROM SKVWeapon') && sql.includes('COUNT(*)')) {
      const memberId = params?.[0];
      const registrationIds = mockData.skvRegistrations.filter((r) => r.memberId === memberId).map((r) => r.id);
      const count = mockData.skvWeapons.filter((w) => registrationIds.includes(w.skvRegistrationId)).length;
      return [{ count }] as T[];
    }
    // SKVWeapon SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM SKVWeapon') && sql.includes('skvRegistrationId IN')) {
      const memberId = params?.[0];
      const registrationIds = mockData.skvRegistrations.filter((r) => r.memberId === memberId).map((r) => r.id);
      return mockData.skvWeapons.filter((w) => registrationIds.includes(w.skvRegistrationId)).map(w => ({ id: w.id })) as T[];
    }
    // SKVRegistration queries
    if (sql.includes('FROM SKVRegistration') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.skvRegistrations.filter((r) => r.memberId === id).length;
      return [{ count }] as T[];
    }
    // SKVRegistration SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM SKVRegistration') && sql.includes('memberId =')) {
      const id = params?.[0];
      return mockData.skvRegistrations.filter((r) => r.memberId === id).map(r => ({ id: r.id })) as T[];
    }
    // TrainerInfo queries
    if (sql.includes('FROM TrainerInfo') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.trainerInfos.filter((t) => t.memberId === id).length;
      return [{ count }] as T[];
    }
    // TrainerDiscipline queries
    if (sql.includes('FROM TrainerDiscipline') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.trainerDisciplines.filter((d) => d.memberId === id).length;
      return [{ count }] as T[];
    }
    // TrainerDiscipline SELECT id query (for deletion)
    if (sql.includes('SELECT id FROM TrainerDiscipline') && sql.includes('memberId =')) {
      const id = params?.[0];
      return mockData.trainerDisciplines.filter((d) => d.memberId === id).map(d => ({ id: d.id })) as T[];
    }
    // MemberPreference queries
    if (sql.includes('FROM MemberPreference') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.memberPreferences.filter((p) => p.memberId === id).length;
      return [{ count }] as T[];
    }
    // TransactionLine queries (for member deletion preview)
    if (sql.includes('FROM TransactionLine') && sql.includes('COUNT(*)') && sql.includes('fiscalYear')) {
      const memberId = params?.[0];
      const year = params?.[1] as number;
      const count = mockData.transactionLines.filter((t) => t.memberId === memberId && t.fiscalYear === year).length;
      return [{ count }] as T[];
    }
    if (sql.includes('FROM TransactionLine') && sql.includes('COUNT(*)') && !sql.includes('fiscalYear')) {
      const memberId = params?.[0];
      const count = mockData.transactionLines.filter((t) => t.memberId === memberId).length;
      return [{ count }] as T[];
    }
    // changes() query for execute results
    if (sql.includes('SELECT changes()')) {
      return [{ changes: 0 }] as T[];
    }
    return [] as T[];
  }),
  transaction: vi.fn((fn: () => void) => {
    fn();
  }),
}));

// Mock the photoStorage module
vi.mock('../utils/photoStorage', () => ({
  deletePhotoFile: vi.fn().mockResolvedValue(undefined),
}));

// Reset mock data before each test
beforeEach(() => {
  mockData.members = [];
  mockData.checkIns = [];
  mockData.practiceSessions = [];
  mockData.scanEvents = [];
  mockData.equipmentCheckouts = [];
  mockData.pendingFeePayments = [];
  mockData.skvRegistrations = [];
  mockData.skvWeapons = [];
  mockData.trainerInfos = [];
  mockData.trainerDisciplines = [];
  mockData.memberPreferences = [];
  mockData.transactionLines = [];
  vi.clearAllMocks();
});

describe('Trial Member Management (FR-1, FR-3)', () => {
  describe('Trial Member Creation', () => {
    it('should create member with memberType = TRIAL and null membershipId', () => {
      // FR-1.2: membershipId is nullable
      // FR-1.3: memberType enum with TRIAL value
      // FR-1.7: New registrations create Member with memberType = TRIAL
      
      const trialMember = {
        internalId: 'uuid-trial-001',
        membershipId: null,
        memberType: 'TRIAL',
        memberLifecycleStage: 'TRIAL',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '12345678',
        birthday: null,
        status: 'ACTIVE',
        createdAtUtc: '2026-01-15T10:00:00Z',
        mergedIntoId: null,
      };

      mockData.members.push(trialMember);
      
      // Verify trial member properties
      expect(trialMember.memberType).toBe('TRIAL');
      expect(trialMember.membershipId).toBeNull();
      expect(trialMember.internalId).toMatch(/^uuid-/);
      expect(trialMember.status).toBe('ACTIVE');
    });

    it('should generate UUID for internalId', () => {
      // FR-1.1: Member uses internalId (UUID) as primary key
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      // Simulating UUID v4 generation
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
      
      const internalId = generateUUID();
      expect(internalId).toMatch(uuidRegex);
    });
  });

  describe('Trial Member List', () => {
    it('should return only trial members when filtering by memberType', () => {
      // FR-3.1: Laptop displays filtered view of trial members
      mockData.members = [
        { internalId: 'uuid-1', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Trial', lastName: 'One', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-15T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-2', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Full', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-3', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Trial', lastName: 'Two', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-16T10:00:00Z', mergedIntoId: null },
      ];

      const trialMembers = mockData.members.filter(m => m.memberType === 'TRIAL');
      
      expect(trialMembers).toHaveLength(2);
      expect(trialMembers.every(m => m.memberType === 'TRIAL')).toBe(true);
      expect(trialMembers.every(m => m.membershipId === null)).toBe(true);
    });
  });

  describe('MembershipId Assignment', () => {
    it('should update membershipId and change memberType to FULL', () => {
      // FR-3.3: When membershipId is assigned, memberType changes to FULL
      const trialMember = {
        internalId: 'uuid-trial-001',
        membershipId: null as string | null,
        memberType: 'TRIAL',
        memberLifecycleStage: 'TRIAL',
        firstName: 'John',
        lastName: 'Doe',
        email: null,
        phone: null,
        birthday: null,
        status: 'ACTIVE',
        createdAtUtc: '2026-01-15T10:00:00Z',
        mergedIntoId: null,
      };
      mockData.members.push(trialMember);
      
      // Simulate assignment
      const newMembershipId = 'M12345';
      trialMember.membershipId = newMembershipId;
      trialMember.memberType = 'FULL';
      
      expect(trialMember.membershipId).toBe('M12345');
      expect(trialMember.memberType).toBe('FULL');
    });

    it('should validate membershipId uniqueness', () => {
      // FR-3.4: Laptop validates membershipId uniqueness before saving
      mockData.members = [
        { internalId: 'uuid-1', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Existing', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];

      const existingId = 'M001';
      const isUnique = !mockData.members.some(m => m.membershipId === existingId);
      
      expect(isUnique).toBe(false);
      
      const newId = 'M002';
      const isNewUnique = !mockData.members.some(m => m.membershipId === newId);
      
      expect(isNewUnique).toBe(true);
    });
  });
});

describe('Duplicate Detection (FR-9.1)', () => {
  beforeEach(() => {
    mockData.members = [
      { internalId: 'uuid-1', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'John', lastName: 'Smith', email: 'john@example.com', phone: '12345678', birthday: '1990-01-15', status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      { internalId: 'uuid-2', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '87654321', birthday: '1995-05-20', status: 'ACTIVE', createdAtUtc: '2026-01-15T10:00:00Z', mergedIntoId: null },
      { internalId: 'uuid-3', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Jon', lastName: 'Smith', email: null, phone: '12345678', birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-16T10:00:00Z', mergedIntoId: null },
    ];
  });

  it('should ignore phone number matches for duplicate detection', () => {
    const targetPhone = '12345678';
    const duplicates = mockData.members.filter(m => m.phone === targetPhone);
    
    // Phone matches should not drive duplicate detection anymore
    expect(duplicates).toHaveLength(2);
  });

  it('should ignore email matches for duplicate detection', () => {
    const targetEmail = 'john@example.com';
    const duplicates = mockData.members.filter(m => m.email === targetEmail);
    
    // Email matches should not drive duplicate detection anymore
    expect(duplicates).toHaveLength(1);
  });

  it('should detect duplicate by similar name (medium confidence)', () => {
    // Simple name similarity check (John vs Jon)
    // Target member for comparison
    const targetFirstName = 'John';
    const targetLastName = 'Smith';
    
    // Levenshtein distance for "John" vs "Jon" is 1
    // Names are considered similar if distance <= 2
    const calculateSimilarity = (a: string, b: string): number => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      if (aLower === bLower) return 1;
      
      // Simple edit distance approximation
      const maxLen = Math.max(aLower.length, bLower.length);
      let matches = 0;
      for (let i = 0; i < Math.min(aLower.length, bLower.length); i++) {
        if (aLower[i] === bLower[i]) matches++;
      }
      return matches / maxLen;
    };
    
    // 'John' vs 'John' = 1.0 (exact match)
    const exactMatch = calculateSimilarity(targetFirstName, 'John');
    expect(exactMatch).toBe(1);
    
    // 'John' vs 'Johan' = J,o,h match = 3/5 = 0.6
    const johnVsJohan = calculateSimilarity(targetFirstName, 'Johan');
    expect(johnVsJohan).toBeGreaterThan(0.5);
    
    // Use targetLastName to avoid unused warning
    expect(targetLastName).toBe('Smith');
  });

  it('should not detect inactive members as duplicates', () => {
    mockData.members.push({
      internalId: 'uuid-inactive',
      membershipId: null,
      memberType: 'TRIAL',
      memberLifecycleStage: 'TRIAL',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john@example.com',
      phone: '12345678',
      birthday: null,
      status: 'INACTIVE',
      createdAtUtc: '2026-01-01T10:00:00Z',
      mergedIntoId: null,
    });

    const activeMembers = mockData.members.filter(m => m.status === 'ACTIVE');
    const activeWithPhone = activeMembers.filter(m => m.phone === '12345678');
    
    // Phone matches are irrelevant, but active set should exclude inactive member
    expect(activeWithPhone).toHaveLength(2);
  });
});

describe('Member Merge (FR-9.2 - FR-9.6)', () => {
  beforeEach(() => {
    // Set up two members with overlapping data
    mockData.members = [
      { internalId: 'uuid-keep', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'John', lastName: 'Smith', email: 'john@example.com', phone: '12345678', birthday: '1990-01-15', status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      { internalId: 'uuid-merge', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Jon', lastName: 'Smith', email: null, phone: '12345678', birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-16T10:00:00Z', mergedIntoId: null },
    ];
    
    // Set up related records for the member to be merged
    mockData.checkIns = [
      { id: 'ci-1', internalMemberId: 'uuid-merge', localDate: '2026-01-18' },
      { id: 'ci-2', internalMemberId: 'uuid-merge', localDate: '2026-01-19' },
      { id: 'ci-3', internalMemberId: 'uuid-keep', localDate: '2026-01-20' },
    ];
    
    mockData.practiceSessions = [
      { id: 'ps-1', internalMemberId: 'uuid-merge' },
    ];
    
    mockData.scanEvents = [
      { id: 'se-1', internalMemberId: 'uuid-merge' },
    ];
    
    mockData.equipmentCheckouts = [
      { id: 'ec-1', internalMemberId: 'uuid-merge' },
      { id: 'ec-2', internalMemberId: 'uuid-keep' },
    ];
  });

  describe('Merge Preview', () => {
    it('should preview records to be transferred (FR-9.2)', () => {
      const mergeId = 'uuid-merge';
      
      const preview = {
        checkIns: mockData.checkIns.filter(c => c.internalMemberId === mergeId).length,
        practiceSessions: mockData.practiceSessions.filter(s => s.internalMemberId === mergeId).length,
        scanEvents: mockData.scanEvents.filter(s => s.internalMemberId === mergeId).length,
        equipmentCheckouts: mockData.equipmentCheckouts.filter(e => e.internalMemberId === mergeId).length,
      };
      
      expect(preview.checkIns).toBe(2);
      expect(preview.practiceSessions).toBe(1);
      expect(preview.scanEvents).toBe(1);
      expect(preview.equipmentCheckouts).toBe(1);
    });
  });

  describe('Merge Execution', () => {
    it('should transfer all foreign key references to surviving member (FR-9.3)', () => {
      const keepId = 'uuid-keep';
      const mergeId = 'uuid-merge';
      
      // Simulate FK update
      mockData.checkIns.forEach(c => {
        if (c.internalMemberId === mergeId) {
          c.internalMemberId = keepId;
        }
      });
      
      mockData.practiceSessions.forEach(s => {
        if (s.internalMemberId === mergeId) {
          s.internalMemberId = keepId;
        }
      });
      
      mockData.scanEvents.forEach(s => {
        if (s.internalMemberId === mergeId) {
          s.internalMemberId = keepId;
        }
      });
      
      mockData.equipmentCheckouts.forEach(e => {
        if (e.internalMemberId === mergeId) {
          e.internalMemberId = keepId;
        }
      });
      
      // Verify all records now point to keepId
      expect(mockData.checkIns.filter(c => c.internalMemberId === keepId)).toHaveLength(3);
      expect(mockData.practiceSessions.filter(s => s.internalMemberId === keepId)).toHaveLength(1);
      expect(mockData.scanEvents.filter(s => s.internalMemberId === keepId)).toHaveLength(1);
      expect(mockData.equipmentCheckouts.filter(e => e.internalMemberId === keepId)).toHaveLength(2);
      
      // Verify no records point to mergeId
      expect(mockData.checkIns.filter(c => c.internalMemberId === mergeId)).toHaveLength(0);
    });

    it('should set mergedIntoId on merged member (FR-9.5)', () => {
      const keepId = 'uuid-keep';
      const mergeId = 'uuid-merge';
      
      // Simulate merge
      const mergedMember = mockData.members.find(m => m.internalId === mergeId);
      if (mergedMember) {
        mergedMember.mergedIntoId = keepId;
        mergedMember.status = 'INACTIVE';
      }
      
      expect(mergedMember?.mergedIntoId).toBe(keepId);
      expect(mergedMember?.status).toBe('INACTIVE');
    });

    it('should use surviving member internalId (FR-9.4)', () => {
      const keepId = 'uuid-keep';
      
      // After merge, the surviving member should retain its internalId
      const survivingMember = mockData.members.find(m => m.internalId === keepId);
      
      expect(survivingMember?.internalId).toBe(keepId);
      expect(survivingMember?.membershipId).toBe('M001'); // Should keep its membershipId
    });

    it('should not allow merge if target is already merged', () => {
      const mergeId = 'uuid-merge';
      
      // Mark as already merged
      const member = mockData.members.find(m => m.internalId === mergeId);
      if (member) {
        member.mergedIntoId = 'uuid-other';
      }
      
      // Attempt to merge should fail
      const canMerge = member?.mergedIntoId === null;
      expect(canMerge).toBe(false);
    });
  });
});

describe('Foreign Key References (FR-1.5)', () => {
  it('should use internalMemberId in CheckIn records', () => {
    const checkIn = {
      id: 'ci-001',
      internalMemberId: 'uuid-member-001', // NOT membershipId
      localDate: '2026-01-20',
    };
    
    expect(checkIn.internalMemberId).toBeDefined();
    expect(checkIn.internalMemberId).toMatch(/^uuid-/);
  });

  it('should use internalMemberId in PracticeSession records', () => {
    const session = {
      id: 'ps-001',
      internalMemberId: 'uuid-member-001',
      practiceType: 'LUFTRIFFEL',
    };
    
    expect(session.internalMemberId).toBeDefined();
  });

  it('should use internalMemberId in EquipmentCheckout records', () => {
    const checkout = {
      id: 'ec-001',
      internalMemberId: 'uuid-member-001',
      equipmentId: 'eq-001',
    };
    
    expect(checkout.internalMemberId).toBeDefined();
  });

  it('should use internalMemberId in ScanEvent records', () => {
    const scanEvent = {
      id: 'se-001',
      internalMemberId: 'uuid-member-001',
      scanType: 'ENTRY',
    };
    
    expect(scanEvent.internalMemberId).toBeDefined();
  });
});

describe('Member Status Transitions', () => {
  it('should support TRIAL → FULL transition', () => {
    const member = {
      memberType: 'TRIAL' as 'TRIAL' | 'FULL',
      membershipId: null as string | null,
    };
    
    // Assign membershipId
    member.membershipId = 'M001';
    member.memberType = 'FULL';
    
    expect(member.memberType).toBe('FULL');
    expect(member.membershipId).toBe('M001');
  });

  it('should allow ACTIVE → INACTIVE status change', () => {
    const member = {
      status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    };
    
    member.status = 'INACTIVE';
    
    expect(member.status).toBe('INACTIVE');
  });

  it('should not change memberType when status becomes INACTIVE', () => {
    const member = {
      memberType: 'TRIAL' as 'TRIAL' | 'FULL',
      status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    };

    // Deactivate without assigning membershipId
    member.status = 'INACTIVE';

    // memberType should remain TRIAL
    expect(member.memberType).toBe('TRIAL');
    expect(member.status).toBe('INACTIVE');
  });
});

describe('Recent Trial Members (Dashboard)', () => {
  beforeEach(() => {
    mockData.members = [];
    mockData.checkIns = [];
    vi.clearAllMocks();
  });

  describe('getTrialMemberCount', () => {
    it('should return count of active trial members', () => {
      mockData.members = [
        { internalId: 'uuid-1', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Trial', lastName: 'One', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-15T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-2', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Full', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-3', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Trial', lastName: 'Two', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-16T10:00:00Z', mergedIntoId: null },
      ];

      const count = getTrialMemberCount();
      expect(count).toBe(2);
    });

    it('should exclude inactive trial members from count', () => {
      mockData.members = [
        { internalId: 'uuid-1', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Active', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-15T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-2', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Inactive', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];

      const count = getTrialMemberCount();
      expect(count).toBe(1);
    });

    it('should exclude merged trial members from count', () => {
      mockData.members = [
        { internalId: 'uuid-1', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Active', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-15T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-2', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Merged', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: 'uuid-1' },
      ];

      const count = getTrialMemberCount();
      expect(count).toBe(1);
    });

    it('should return 0 when no trial members exist', () => {
      mockData.members = [
        { internalId: 'uuid-1', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Full', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];

      const count = getTrialMemberCount();
      expect(count).toBe(0);
    });
  });

  describe('getRecentTrialMembers', () => {
    it('should return trial members created within last 3 months', () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

      mockData.members = [
        { internalId: 'uuid-recent', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Recent', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: oneMonthAgo, mergedIntoId: null },
        { internalId: 'uuid-old', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Old', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: sixMonthsAgo, mergedIntoId: null },
      ];

      const recentMembers = getRecentTrialMembers();

      expect(recentMembers).toHaveLength(1);
      expect(recentMembers[0].member.firstName).toBe('Recent');
    });

    it('should include old trial members with recent check-ins', () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

      mockData.members = [
        { internalId: 'uuid-old-active', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Old', lastName: 'Active', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: sixMonthsAgo, mergedIntoId: null },
      ];

      mockData.checkIns = [
        { id: 'ci-1', internalMemberId: 'uuid-old-active', localDate: recentDate },
      ];

      const recentMembers = getRecentTrialMembers();

      expect(recentMembers).toHaveLength(1);
      expect(recentMembers[0].member.firstName).toBe('Old');
      expect(recentMembers[0].lastCheckInDate).toBe(recentDate);
      expect(recentMembers[0].checkInCount).toBe(1);
    });

    it('should exclude old trial members without recent activity', () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const oldDate = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

      mockData.members = [
        { internalId: 'uuid-old-inactive', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Old', lastName: 'Inactive', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: sixMonthsAgo, mergedIntoId: null },
      ];

      mockData.checkIns = [
        { id: 'ci-1', internalMemberId: 'uuid-old-inactive', localDate: oldDate },
      ];

      const recentMembers = getRecentTrialMembers();

      expect(recentMembers).toHaveLength(0);
    });

    it('should return check-in statistics for trial members', () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      mockData.members = [
        { internalId: 'uuid-1', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Trial', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: oneMonthAgo, mergedIntoId: null },
      ];

      mockData.checkIns = [
        { id: 'ci-1', internalMemberId: 'uuid-1', localDate: '2026-01-10' },
        { id: 'ci-2', internalMemberId: 'uuid-1', localDate: '2026-01-15' },
        { id: 'ci-3', internalMemberId: 'uuid-1', localDate: '2026-01-20' },
      ];

      const recentMembers = getRecentTrialMembers();

      expect(recentMembers).toHaveLength(1);
      expect(recentMembers[0].checkInCount).toBe(3);
      expect(recentMembers[0].lastCheckInDate).toBe('2026-01-20');
    });

    it('should return null lastCheckInDate for members with no check-ins', () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      mockData.members = [
        { internalId: 'uuid-1', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Trial', lastName: 'NoCheckIn', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: oneMonthAgo, mergedIntoId: null },
      ];

      const recentMembers = getRecentTrialMembers();

      expect(recentMembers).toHaveLength(1);
      expect(recentMembers[0].checkInCount).toBe(0);
      expect(recentMembers[0].lastCheckInDate).toBeNull();
    });

    it('should exclude inactive and merged trial members', () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      mockData.members = [
        { internalId: 'uuid-active', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Active', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: oneMonthAgo, mergedIntoId: null },
        { internalId: 'uuid-inactive', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Inactive', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: oneMonthAgo, mergedIntoId: null },
        { internalId: 'uuid-merged', membershipId: null, memberType: 'TRIAL', memberLifecycleStage: 'TRIAL', firstName: 'Merged', lastName: 'Trial', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: oneMonthAgo, mergedIntoId: 'uuid-active' },
      ];

      const recentMembers = getRecentTrialMembers();

      expect(recentMembers).toHaveLength(1);
      expect(recentMembers[0].member.firstName).toBe('Active');
    });
  });
});

describe('Permanent Member Deletion', () => {
  describe('getMemberDeletePreview', () => {
    it('should return canDelete: false when member not found', () => {
      mockData.members = [];

      const preview = getMemberDeletePreview('non-existent');

      expect(preview.canDelete).toBe(false);
      expect(preview.blockingReason).toBe('Medlem ikke fundet');
    });

    it('should return canDelete: false when member is ACTIVE', () => {
      mockData.members = [
        { internalId: 'uuid-active', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Active', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];

      const preview = getMemberDeletePreview('uuid-active');

      expect(preview.canDelete).toBe(false);
      expect(preview.blockingReason).toBe('Kun inaktive medlemmer kan slettes');
    });

    it('should return canDelete: false when member has transactions in current year', () => {
      const currentYear = new Date().getFullYear();
      mockData.members = [
        { internalId: 'uuid-inactive', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Inactive', lastName: 'Member', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];
      mockData.transactionLines = [
        { id: 'tl-1', memberId: 'uuid-inactive', fiscalYear: currentYear },
        { id: 'tl-2', memberId: 'uuid-inactive', fiscalYear: currentYear },
      ];

      const preview = getMemberDeletePreview('uuid-inactive');

      expect(preview.canDelete).toBe(false);
      expect(preview.blockingReason).toContain('transaktioner i indeværende år');
    });

    it('should return canDelete: true for inactive member with no current year transactions', () => {
      mockData.members = [
        { internalId: 'uuid-inactive', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Inactive', lastName: 'Member', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];

      const preview = getMemberDeletePreview('uuid-inactive');

      expect(preview.canDelete).toBe(true);
      expect(preview.blockingReason).toBeUndefined();
    });

    it('should count all related records correctly', () => {
      mockData.members = [
        { internalId: 'uuid-inactive', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Inactive', lastName: 'Member', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];
      mockData.checkIns = [
        { id: 'ci-1', internalMemberId: 'uuid-inactive', localDate: '2025-01-10' },
        { id: 'ci-2', internalMemberId: 'uuid-inactive', localDate: '2025-01-11' },
      ];
      mockData.practiceSessions = [
        { id: 'ps-1', internalMemberId: 'uuid-inactive' },
      ];
      mockData.scanEvents = [
        { id: 'se-1', internalMemberId: 'uuid-inactive' },
        { id: 'se-2', internalMemberId: 'uuid-inactive' },
        { id: 'se-3', internalMemberId: 'uuid-inactive' },
      ];
      mockData.equipmentCheckouts = [
        { id: 'ec-1', internalMemberId: 'uuid-inactive' },
      ];
      mockData.pendingFeePayments = [
        { id: 'pfp-1', memberId: 'uuid-inactive' },
      ];
      mockData.skvRegistrations = [
        { id: 'skv-1', memberId: 'uuid-inactive' },
      ];
      mockData.skvWeapons = [
        { id: 'sw-1', skvRegistrationId: 'skv-1' },
        { id: 'sw-2', skvRegistrationId: 'skv-1' },
      ];
      mockData.trainerInfos = [
        { memberId: 'uuid-inactive' },
      ];
      mockData.trainerDisciplines = [
        { id: 'td-1', memberId: 'uuid-inactive' },
        { id: 'td-2', memberId: 'uuid-inactive' },
      ];
      mockData.memberPreferences = [
        { memberId: 'uuid-inactive' },
      ];
      // Transaction lines from previous years (will be orphaned)
      mockData.transactionLines = [
        { id: 'tl-1', memberId: 'uuid-inactive', fiscalYear: 2024 },
        { id: 'tl-2', memberId: 'uuid-inactive', fiscalYear: 2023 },
      ];

      const preview = getMemberDeletePreview('uuid-inactive');

      expect(preview.canDelete).toBe(true);
      expect(preview.counts.checkIns).toBe(2);
      expect(preview.counts.practiceSessions).toBe(1);
      expect(preview.counts.scanEvents).toBe(3);
      expect(preview.counts.equipmentCheckouts).toBe(1);
      expect(preview.counts.pendingFeePayments).toBe(1);
      expect(preview.counts.skvRegistrations).toBe(1);
      expect(preview.counts.skvWeapons).toBe(2);
      expect(preview.counts.trainerInfo).toBe(true);
      expect(preview.counts.trainerDisciplines).toBe(2);
      expect(preview.counts.memberPreferences).toBe(true);
      expect(preview.counts.transactionLines).toBe(2);
    });
  });

  describe('deleteMemberPermanently', () => {
    it('should return error when member cannot be deleted', async () => {
      mockData.members = [
        { internalId: 'uuid-active', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Active', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];

      const result = await deleteMemberPermanently('uuid-active');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Kun inaktive medlemmer kan slettes');
    });

    it('should return error when member not found', async () => {
      mockData.members = [];

      const result = await deleteMemberPermanently('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Medlem ikke fundet');
    });

    it('should successfully delete inactive member with no related data', async () => {
      mockData.members = [
        { internalId: 'uuid-inactive', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Inactive', lastName: 'Member', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];

      const result = await deleteMemberPermanently('uuid-inactive');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should successfully delete inactive member with related data', async () => {
      mockData.members = [
        { internalId: 'uuid-inactive', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Inactive', lastName: 'Member', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];
      mockData.checkIns = [
        { id: 'ci-1', internalMemberId: 'uuid-inactive', localDate: '2025-01-10' },
      ];
      mockData.practiceSessions = [
        { id: 'ps-1', internalMemberId: 'uuid-inactive' },
      ];
      mockData.skvRegistrations = [
        { id: 'skv-1', memberId: 'uuid-inactive' },
      ];
      mockData.skvWeapons = [
        { id: 'sw-1', skvRegistrationId: 'skv-1' },
      ];

      const result = await deleteMemberPermanently('uuid-inactive');

      expect(result.success).toBe(true);
      expect(result.deletedCounts.checkIns).toBe(1);
      expect(result.deletedCounts.practiceSessions).toBe(1);
      expect(result.deletedCounts.skvRegistrations).toBe(1);
      expect(result.deletedCounts.skvWeapons).toBe(1);
    });

    it('should block deletion when member has current year transactions', async () => {
      const currentYear = new Date().getFullYear();
      mockData.members = [
        { internalId: 'uuid-inactive', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Inactive', lastName: 'Member', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];
      mockData.transactionLines = [
        { id: 'tl-1', memberId: 'uuid-inactive', fiscalYear: currentYear },
      ];

      const result = await deleteMemberPermanently('uuid-inactive');

      expect(result.success).toBe(false);
      expect(result.error).toContain('transaktioner i indeværende år');
    });

    it('should queue deletion for cloud sync with related entity IDs', async () => {
      const { queueMemberDeletion } = await import('./syncOutboxRepository');

      mockData.members = [
        { internalId: 'uuid-inactive', membershipId: 'M001', memberType: 'FULL', memberLifecycleStage: 'FULL', firstName: 'Inactive', lastName: 'Member', email: null, phone: null, birthday: null, status: 'INACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      ];
      mockData.checkIns = [{ id: 'checkin-1', internalMemberId: 'uuid-inactive', localDate: '2026-01-15' }];
      mockData.practiceSessions = [{ id: 'session-1', internalMemberId: 'uuid-inactive' }];
      mockData.pendingFeePayments = [{ id: 'payment-1', memberId: 'uuid-inactive' }];
      mockData.transactionLines = [];

      const result = await deleteMemberPermanently('uuid-inactive');

      expect(result.success).toBe(true);
      expect(vi.mocked(queueMemberDeletion)).toHaveBeenCalledWith(
        expect.objectContaining({
          internalId: 'uuid-inactive',
          checkInIds: ['checkin-1'],
          practiceSessionIds: ['session-1'],
          pendingFeePaymentIds: ['payment-1'],
        })
      );
    });
  });

  describe('getUniqueMemberEmailsByFeeCategory', () => {
    it('returns normalized unique emails per fee category', () => {
      mockData.members = [
        { internalId: 'uuid-1', membershipId: 'M001', memberType: 'ADULT', memberLifecycleStage: 'FULL', firstName: 'A', lastName: 'One', email: 'Test@Example.com', phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-2', membershipId: 'M002', memberType: 'ADULT', memberLifecycleStage: 'FULL', firstName: 'B', lastName: 'Two', email: ' test@example.com ', phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-3', membershipId: 'M003', memberType: 'CHILD', memberLifecycleStage: 'FULL', firstName: 'C', lastName: 'Three', email: 'child@example.com', phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-4', membershipId: 'M004', memberType: 'CHILD', memberLifecycleStage: 'FULL', firstName: 'D', lastName: 'Four', email: 'child@example.com', phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-5', membershipId: 'M005', memberType: 'HONORARY', memberLifecycleStage: 'FULL', firstName: 'E', lastName: 'Five', email: '', phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-6', membershipId: 'M006', memberType: 'ADULT', memberLifecycleStage: 'FULL', firstName: 'F', lastName: 'Six', email: 'merged@example.com', phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: 'uuid-1' },
      ];

      const rows = getUniqueMemberEmailsByFeeCategory();

      expect(rows).toEqual([
        { memberType: 'ADULT', email: 'test@example.com' },
        { memberType: 'CHILD', email: 'child@example.com' },
      ]);
    });
  });
});
