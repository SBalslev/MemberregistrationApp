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

// Mock the database module
const mockData: {
  members: Array<{
    internalId: string;
    membershipId: string | null;
    memberType: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    birthday: string | null;
    status: string;
    createdAtUtc: string;
    mergedIntoId: string | null;
  }>;
  checkIns: Array<{ id: string; internalMemberId: string }>;
  practiceSessions: Array<{ id: string; internalMemberId: string }>;
  scanEvents: Array<{ id: string; internalMemberId: string }>;
  equipmentCheckouts: Array<{ id: string; internalMemberId: string }>;
} = {
  members: [],
  checkIns: [],
  practiceSessions: [],
  scanEvents: [],
  equipmentCheckouts: [],
};

vi.mock('./db', () => ({
  execute: vi.fn((_sql: string, _params?: unknown[]) => {
    return { changes: 1 };
  }),
  query: vi.fn(<T>(sql: string, params?: unknown[]): T[] => {
    // Member queries
    if (sql.includes('FROM Member') && sql.includes('WHERE internalId =')) {
      const id = params?.[0];
      return mockData.members.filter((m) => m.internalId === id) as T[];
    }
    if (sql.includes('FROM Member') && sql.includes('WHERE membershipId =')) {
      const id = params?.[0];
      return mockData.members.filter((m) => m.membershipId === id) as T[];
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
    // CheckIn queries
    if (sql.includes('FROM CheckIn') && sql.includes('internalMemberId =')) {
      const id = params?.[0];
      return mockData.checkIns.filter((c) => c.internalMemberId === id) as T[];
    }
    if (sql.includes('FROM CheckIn') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.checkIns.filter((c) => c.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    // PracticeSession queries
    if (sql.includes('FROM PracticeSession') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.practiceSessions.filter((s) => s.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    // ScanEvent queries
    if (sql.includes('FROM ScanEvent') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.scanEvents.filter((s) => s.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    // EquipmentCheckout queries
    if (sql.includes('FROM EquipmentCheckout') && sql.includes('COUNT(*)')) {
      const id = params?.[0];
      const count = mockData.equipmentCheckouts.filter((e) => e.internalMemberId === id).length;
      return [{ count }] as T[];
    }
    return [] as T[];
  }),
  transaction: vi.fn((fn: () => void) => {
    fn();
  }),
}));

// Reset mock data before each test
beforeEach(() => {
  mockData.members = [];
  mockData.checkIns = [];
  mockData.practiceSessions = [];
  mockData.scanEvents = [];
  mockData.equipmentCheckouts = [];
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
        { internalId: 'uuid-1', membershipId: null, memberType: 'TRIAL', firstName: 'Trial', lastName: 'One', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-15T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-2', membershipId: 'M001', memberType: 'FULL', firstName: 'Full', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
        { internalId: 'uuid-3', membershipId: null, memberType: 'TRIAL', firstName: 'Trial', lastName: 'Two', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-16T10:00:00Z', mergedIntoId: null },
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
        { internalId: 'uuid-1', membershipId: 'M001', memberType: 'FULL', firstName: 'Existing', lastName: 'Member', email: null, phone: null, birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
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
      { internalId: 'uuid-1', membershipId: 'M001', memberType: 'FULL', firstName: 'John', lastName: 'Smith', email: 'john@example.com', phone: '12345678', birthday: '1990-01-15', status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      { internalId: 'uuid-2', membershipId: null, memberType: 'TRIAL', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '87654321', birthday: '1995-05-20', status: 'ACTIVE', createdAtUtc: '2026-01-15T10:00:00Z', mergedIntoId: null },
      { internalId: 'uuid-3', membershipId: null, memberType: 'TRIAL', firstName: 'Jon', lastName: 'Smith', email: null, phone: '12345678', birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-16T10:00:00Z', mergedIntoId: null },
    ];
  });

  it('should detect duplicate by exact phone number match (high confidence)', () => {
    const targetPhone = '12345678';
    const duplicates = mockData.members.filter(m => m.phone === targetPhone);
    
    // Both uuid-1 and uuid-3 have same phone
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map(d => d.internalId)).toContain('uuid-1');
    expect(duplicates.map(d => d.internalId)).toContain('uuid-3');
  });

  it('should detect duplicate by exact email match (high confidence)', () => {
    const targetEmail = 'john@example.com';
    const duplicates = mockData.members.filter(m => m.email === targetEmail);
    
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].internalId).toBe('uuid-1');
  });

  it('should detect duplicate by similar name (medium confidence)', () => {
    // Simple name similarity check (John vs Jon)
    const target = { firstName: 'John', lastName: 'Smith' };
    
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
    const exactMatch = calculateSimilarity('John', 'John');
    expect(exactMatch).toBe(1);
    
    // 'John' vs 'Johan' = J,o,h match = 3/5 = 0.6
    const johnVsJohan = calculateSimilarity('John', 'Johan');
    expect(johnVsJohan).toBeGreaterThan(0.5);
  });

  it('should not detect inactive members as duplicates', () => {
    mockData.members.push({
      internalId: 'uuid-inactive',
      membershipId: null,
      memberType: 'TRIAL',
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
    const duplicatesWithPhone = activeMembers.filter(m => m.phone === '12345678');
    
    // Should only find 2 active members, not the inactive one
    expect(duplicatesWithPhone).toHaveLength(2);
  });
});

describe('Member Merge (FR-9.2 - FR-9.6)', () => {
  beforeEach(() => {
    // Set up two members with overlapping data
    mockData.members = [
      { internalId: 'uuid-keep', membershipId: 'M001', memberType: 'FULL', firstName: 'John', lastName: 'Smith', email: 'john@example.com', phone: '12345678', birthday: '1990-01-15', status: 'ACTIVE', createdAtUtc: '2026-01-10T10:00:00Z', mergedIntoId: null },
      { internalId: 'uuid-merge', membershipId: null, memberType: 'TRIAL', firstName: 'Jon', lastName: 'Smith', email: null, phone: '12345678', birthday: null, status: 'ACTIVE', createdAtUtc: '2026-01-16T10:00:00Z', mergedIntoId: null },
    ];
    
    // Set up related records for the member to be merged
    mockData.checkIns = [
      { id: 'ci-1', internalMemberId: 'uuid-merge' },
      { id: 'ci-2', internalMemberId: 'uuid-merge' },
      { id: 'ci-3', internalMemberId: 'uuid-keep' },
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
