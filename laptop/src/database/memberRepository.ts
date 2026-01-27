/**
 * Member repository - data access layer for members.
 */

import { query, execute, transaction } from './db';
import type { Member, MemberStatus, MemberListItem } from '../types';
import { deletePhotoFile } from '../utils/photoStorage';
import { queueMember } from './syncOutboxRepository';

/**
 * Get all members.
 */
export function getAllMembers(): Member[] {
  return query<Member>('SELECT * FROM Member ORDER BY lastName, firstName');
}

/**
 * Get members for list views (lightweight - only essential fields).
 * Uses photoThumbnail instead of full photoPath for performance.
 */
export function getMembersForList(): MemberListItem[] {
  return query<MemberListItem>(`
    SELECT
      internalId, membershipId, memberLifecycleStage, status,
      firstName, lastName, photoThumbnail, createdAtUtc
    FROM Member
    ORDER BY lastName, firstName
  `);
}

/**
 * Get members by status.
 */
export function getMembersByStatus(status: MemberStatus): Member[] {
  return query<Member>(
    'SELECT * FROM Member WHERE status = ? ORDER BY lastName, firstName',
    [status]
  );
}

/**
 * Get a member by internalId (UUID primary key).
 */
export function getMemberByInternalId(internalId: string): Member | null {
  const results = query<Member>(
    'SELECT * FROM Member WHERE internalId = ?',
    [internalId]
  );
  return results[0] || null;
}

/**
 * Get a member by membershipId (club-assigned ID).
 * Note: membershipId can be null for trial members.
 */
export function getMemberByMembershipId(membershipId: string): Member | null {
  const results = query<Member>(
    'SELECT * FROM Member WHERE membershipId = ?',
    [membershipId]
  );
  return results[0] || null;
}

/**
 * @deprecated Use getMemberByMembershipId or getMemberByInternalId
 */
export function getMemberById(membershipId: string): Member | null {
  return getMemberByMembershipId(membershipId);
}

/**
 * Search members by name or ID.
 */
export function searchMembers(searchQuery: string): Member[] {
  const pattern = `%${searchQuery}%`;
  return query<Member>(
    `SELECT * FROM Member 
     WHERE firstName LIKE ? OR lastName LIKE ? OR membershipId LIKE ? OR internalId LIKE ?
     ORDER BY lastName, firstName
     LIMIT 50`,
    [pattern, pattern, pattern, pattern]
  );
}

/**
 * Get all trial members (those without a membershipId assigned).
 */
export function getTrialMembers(): Member[] {
  return query<Member>(
    `SELECT * FROM Member
     WHERE memberLifecycleStage = 'TRIAL'
     ORDER BY createdAtUtc DESC`
  );
}

/**
 * Trial member with activity information for dashboard display.
 */
export interface TrialMemberWithActivity {
  member: Member;
  lastCheckInDate: string | null;
  checkInCount: number;
}

/**
 * Get recent trial members - those created or active in the last 3 months.
 * Returns trial members with their last check-in date and total check-in count.
 */
export function getRecentTrialMembers(): TrialMemberWithActivity[] {
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Get trial members with check-in stats
  const results = query<Member & { lastCheckInDate: string | null; checkInCount: number }>(
    `SELECT m.*,
            MAX(c.localDate) as lastCheckInDate,
            COUNT(c.id) as checkInCount
     FROM Member m
     LEFT JOIN CheckIn c ON c.internalMemberId = m.internalId
     WHERE m.memberLifecycleStage = 'TRIAL'
       AND m.status = 'ACTIVE'
       AND m.mergedIntoId IS NULL
       AND (m.createdAtUtc >= ? OR c.localDate >= ?)
     GROUP BY m.internalId
     ORDER BY COALESCE(MAX(c.localDate), m.createdAtUtc) DESC`,
    [threeMonthsAgo, threeMonthsAgo.substring(0, 10)]
  );

  return results.map(row => ({
    member: row,
    lastCheckInDate: row.lastCheckInDate,
    checkInCount: row.checkInCount
  }));
}

/**
 * Get count of trial members (for stats display).
 */
export function getTrialMemberCount(): number {
  const result = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM Member
     WHERE memberLifecycleStage = 'TRIAL'
       AND status = 'ACTIVE'
       AND mergedIntoId IS NULL`
  );
  return result[0]?.count || 0;
}

/**
 * Assign a membershipId to a trial member.
 * This also transitions them to FULL lifecycle stage.
 */
export function assignMembershipId(internalId: string, membershipId: string): void {
  const now = new Date().toISOString();
  execute(
    `UPDATE Member
     SET membershipId = ?, memberLifecycleStage = 'FULL', updatedAtUtc = ?, syncVersion = syncVersion + 1
     WHERE internalId = ?`,
    [membershipId, now, internalId]
  );

  // Queue to outbox for sync to tablets
  try {
    const updatedMember = getMemberByInternalId(internalId);
    if (updatedMember) {
      queueMember(updatedMember, 'UPDATE');
    }
  } catch (e) {
    console.warn('[MemberRepository] Failed to queue member to outbox:', e);
  }
}

/**
 * Insert or update a member.
 * Uses internalId as the primary key for upsert.
 */
export function upsertMember(member: Member, skipOutbox = false): void {
  const now = new Date().toISOString();

  // Check if this is an insert or update
  const existing = getMemberByInternalId(member.internalId);
  const isUpdate = !!existing;

  execute(
    `INSERT INTO Member (
      internalId, membershipId, memberLifecycleStage, status,
      firstName, lastName, birthDate, gender, email, phone, address,
      zipCode, city, guardianName, guardianPhone, guardianEmail,
      memberType, expiresOn, photoPath, mergedIntoId,
      createdAtUtc, updatedAtUtc, syncedAtUtc, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(internalId) DO UPDATE SET
      membershipId = excluded.membershipId,
      memberLifecycleStage = excluded.memberLifecycleStage,
      status = excluded.status,
      firstName = excluded.firstName,
      lastName = excluded.lastName,
      birthDate = excluded.birthDate,
      gender = excluded.gender,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      zipCode = excluded.zipCode,
      city = excluded.city,
      guardianName = excluded.guardianName,
      guardianPhone = excluded.guardianPhone,
      guardianEmail = excluded.guardianEmail,
      memberType = excluded.memberType,
      expiresOn = excluded.expiresOn,
      photoPath = excluded.photoPath,
      mergedIntoId = excluded.mergedIntoId,
      updatedAtUtc = excluded.updatedAtUtc,
      syncVersion = syncVersion + 1`,
    [
      member.internalId,
      member.membershipId,
      member.memberLifecycleStage,
      member.status,
      member.firstName,
      member.lastName,
      member.birthDate,
      member.gender,
      member.email,
      member.phone,
      member.address,
      member.zipCode,
      member.city,
      member.guardianName,
      member.guardianPhone,
      member.guardianEmail,
      member.memberType,
      member.expiresOn,
      member.photoPath,
      member.mergedIntoId,
      member.createdAtUtc || now,
      now,
      member.syncedAtUtc,
      member.syncVersion || 0
    ]
  );

  // Queue to outbox for sync to tablets (unless called from sync processing)
  if (!skipOutbox) {
    try {
      // Refresh member data with updated syncVersion
      const updatedMember = getMemberByInternalId(member.internalId);
      if (updatedMember) {
        queueMember(updatedMember, isUpdate ? 'UPDATE' : 'INSERT');
      }
    } catch (e) {
      console.warn('[MemberRepository] Failed to queue member to outbox:', e);
    }
  }
}

/**
 * Update member status by internalId.
 */
export function updateMemberStatusByInternalId(internalId: string, status: MemberStatus): void {
  const now = new Date().toISOString();
  execute(
    'UPDATE Member SET status = ?, updatedAtUtc = ?, syncVersion = syncVersion + 1 WHERE internalId = ?',
    [status, now, internalId]
  );

  // Queue to outbox for sync to tablets
  try {
    const updatedMember = getMemberByInternalId(internalId);
    if (updatedMember) {
      queueMember(updatedMember, 'UPDATE');
    }
  } catch (e) {
    console.warn('[MemberRepository] Failed to queue member to outbox:', e);
  }
}

/**
 * Update member status by membershipId.
 * @deprecated Use updateMemberStatusByInternalId
 */
export function updateMemberStatus(membershipId: string, status: MemberStatus): void {
  const now = new Date().toISOString();
  execute(
    'UPDATE Member SET status = ?, updatedAtUtc = ?, syncVersion = syncVersion + 1 WHERE membershipId = ?',
    [status, now, membershipId]
  );
}

/**
 * Soft delete a member by internalId (sets status to INACTIVE).
 */
export function deleteMemberByInternalId(internalId: string): void {
  updateMemberStatusByInternalId(internalId, 'INACTIVE');
}

/**
 * Delete a member by membershipId.
 * @deprecated Use deleteMemberByInternalId for soft delete or hardDeleteMember for permanent delete
 */
export function deleteMember(membershipId: string): void {
  execute('DELETE FROM Member WHERE membershipId = ?', [membershipId]);
}

/**
 * Permanently delete a member and their photo file.
 * Use with caution - this cannot be undone.
 */
export async function hardDeleteMember(internalId: string): Promise<void> {
  // Delete photo file from disk
  await deletePhotoFile(internalId);

  // Delete member record
  execute('DELETE FROM Member WHERE internalId = ?', [internalId]);
}

/**
 * Bulk insert members (for sync/import).
 */
export function bulkInsertMembers(members: Member[]): void {
  transaction(() => {
    for (const member of members) {
      upsertMember(member);
    }
  });
}

/**
 * Get unsynced members.
 */
export function getUnsyncedMembers(): Member[] {
  return query<Member>(
    'SELECT * FROM Member WHERE syncedAtUtc IS NULL OR syncedAtUtc < updatedAtUtc'
  );
}

/**
 * Mark member as synced by internalId.
 */
export function markMemberSyncedByInternalId(internalId: string): void {
  const now = new Date().toISOString();
  execute(
    'UPDATE Member SET syncedAtUtc = ? WHERE internalId = ?',
    [now, internalId]
  );
}

/**
 * Mark member as synced by membershipId.
 * @deprecated Use markMemberSyncedByInternalId
 */
export function markMemberSynced(membershipId: string): void {
  const now = new Date().toISOString();
  execute(
    'UPDATE Member SET syncedAtUtc = ?, syncVersion = syncVersion + 1 WHERE membershipId = ?',
    [now, membershipId]
  );
}

/**
 * Get member count by status.
 */
export function getMemberCountByStatus(): Record<MemberStatus, number> {
  const results = query<{ status: MemberStatus; count: number }>(
    'SELECT status, COUNT(*) as count FROM Member GROUP BY status'
  );
  
  const counts: Record<MemberStatus, number> = { ACTIVE: 0, INACTIVE: 0 };
  for (const row of results) {
    counts[row.status] = row.count;
  }
  return counts;
}

/**
 * Get all members for tablet sync.
 * Per DD-9: All member fields are now synced (no filtering).
 */
export function getMembersForTabletSync(): Member[] {
  return getAllMembers();
}

/**
 * Get members updated since a specific time for tablet sync.
 * Per DD-9: All member fields are now synced (no filtering).
 */
export function getMembersForTabletSyncSince(sinceUtc: string): Member[] {
  return query<Member>(
    'SELECT * FROM Member WHERE updatedAtUtc > ? ORDER BY updatedAtUtc',
    [sinceUtc]
  );
}

// ===== Duplicate Detection (FR-9.1) =====

/**
 * Potential duplicate match result.
 */
export interface DuplicateMatch {
  member: Member;
  matchType: 'phone' | 'email' | 'name';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Find potential duplicates for a given member.
 * Matches based on:
 * - Similar names registered within 30 days (medium/low confidence)
 * 
 * @param targetMember The member to find duplicates for
 * @returns Array of potential duplicate matches
 */
export function findPotentialDuplicates(targetMember: Member): DuplicateMatch[] {
  const duplicates: DuplicateMatch[] = [];
  
  // Skip if member is already merged
  if (targetMember.mergedIntoId) {
    return [];
  }
  
  // Match by similar name (medium/low confidence)
  // Only check trial members registered within 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const nameMatches = query<Member>(
    `SELECT * FROM Member 
     WHERE internalId != ? 
       AND mergedIntoId IS NULL 
       AND status = 'ACTIVE'
       AND LOWER(firstName) = LOWER(?) 
       AND LOWER(lastName) = LOWER(?)
       AND createdAtUtc > ?`,
    [targetMember.internalId, targetMember.firstName, targetMember.lastName, thirtyDaysAgo]
  );
  for (const match of nameMatches) {
      // High confidence if birthDate also matches
      const confidence = match.birthDate && match.birthDate === targetMember.birthDate
        ? 'high'
        : 'medium';
      duplicates.push({
        member: match,
        matchType: 'name',
        confidence
      });
  }
  
  return duplicates;
}

/**
 * Get all members with potential duplicates.
 * Returns members that have at least one potential duplicate.
 */
export function getMembersWithDuplicates(): Array<{ member: Member; duplicates: DuplicateMatch[] }> {
  const allMembers = query<Member>(
    `SELECT * FROM Member WHERE mergedIntoId IS NULL AND status = 'ACTIVE' ORDER BY createdAtUtc DESC`
  );
  
  const results: Array<{ member: Member; duplicates: DuplicateMatch[] }> = [];
  const processedPairs = new Set<string>(); // Track which pairs we've already reported
  
  for (const member of allMembers) {
    const duplicates = findPotentialDuplicates(member);
    if (duplicates.length > 0) {
      // Create a sorted pair key to avoid reporting A->B and B->A
      const filteredDuplicates = duplicates.filter(d => {
        const pairKey = [member.internalId, d.member.internalId].sort().join(':');
        if (processedPairs.has(pairKey)) {
          return false;
        }
        processedPairs.add(pairKey);
        return true;
      });
      
      if (filteredDuplicates.length > 0) {
        results.push({ member, duplicates: filteredDuplicates });
      }
    }
  }
  
  return results;
}

// ===== Member Merge (FR-9.2 - FR-9.6) =====

/**
 * Result of a merge operation.
 */
export interface MergeResult {
  success: boolean;
  survivingMemberId: string;
  mergedMemberId: string;
  recordsUpdated: {
    checkIns: number;
    practiceSessions: number;
    scanEvents: number;
    equipmentCheckouts: number;
  };
  error?: string;
}

/**
 * Preview what will happen if two members are merged.
 * Does not modify any data.
 */
export function previewMerge(keepMemberId: string, mergeMemberId: string): {
  keepMember: Member | null;
  mergeMember: Member | null;
  recordCounts: {
    checkIns: number;
    practiceSessions: number;
    scanEvents: number;
    equipmentCheckouts: number;
  };
} {
  const keepMember = getMemberByInternalId(keepMemberId);
  const mergeMember = getMemberByInternalId(mergeMemberId);
  
  const checkIns = query<{ count: number }>(
    'SELECT COUNT(*) as count FROM CheckIn WHERE internalMemberId = ?',
    [mergeMemberId]
  )[0]?.count || 0;
  
  const practiceSessions = query<{ count: number }>(
    'SELECT COUNT(*) as count FROM PracticeSession WHERE internalMemberId = ?',
    [mergeMemberId]
  )[0]?.count || 0;
  
  const scanEvents = query<{ count: number }>(
    'SELECT COUNT(*) as count FROM ScanEvent WHERE internalMemberId = ?',
    [mergeMemberId]
  )[0]?.count || 0;
  
  const equipmentCheckouts = query<{ count: number }>(
    'SELECT COUNT(*) as count FROM EquipmentCheckout WHERE internalMemberId = ?',
    [mergeMemberId]
  )[0]?.count || 0;
  
  return {
    keepMember,
    mergeMember,
    recordCounts: {
      checkIns,
      practiceSessions,
      scanEvents,
      equipmentCheckouts
    }
  };
}

/**
 * Merge two member records.
 * All history from mergeMember is transferred to keepMember.
 * mergeMember is marked with mergedIntoId and set to INACTIVE.
 * 
 * Per FR-9.3, FR-9.4, FR-9.5, FR-9.6
 * 
 * @param keepMemberId The internalId of the member to keep (survivor)
 * @param mergeMemberId The internalId of the member to merge (will be marked merged)
 * @returns MergeResult with operation details
 */
export function mergeMembers(keepMemberId: string, mergeMemberId: string): MergeResult {
  const now = new Date().toISOString();
  
  // Validate both members exist
  const keepMember = getMemberByInternalId(keepMemberId);
  const mergeMember = getMemberByInternalId(mergeMemberId);
  
  if (!keepMember) {
    return {
      success: false,
      survivingMemberId: keepMemberId,
      mergedMemberId: mergeMemberId,
      recordsUpdated: { checkIns: 0, practiceSessions: 0, scanEvents: 0, equipmentCheckouts: 0 },
      error: `Keep member not found: ${keepMemberId}`
    };
  }
  
  if (!mergeMember) {
    return {
      success: false,
      survivingMemberId: keepMemberId,
      mergedMemberId: mergeMemberId,
      recordsUpdated: { checkIns: 0, practiceSessions: 0, scanEvents: 0, equipmentCheckouts: 0 },
      error: `Merge member not found: ${mergeMemberId}`
    };
  }
  
  if (mergeMember.mergedIntoId) {
    return {
      success: false,
      survivingMemberId: keepMemberId,
      mergedMemberId: mergeMemberId,
      recordsUpdated: { checkIns: 0, practiceSessions: 0, scanEvents: 0, equipmentCheckouts: 0 },
      error: `Member ${mergeMemberId} is already merged into ${mergeMember.mergedIntoId}`
    };
  }
  
  // Get record counts before merge (for reporting)
  const preview = previewMerge(keepMemberId, mergeMemberId);
  
  try {
    // Use transaction for atomic operation (FR-9.6)
    transaction(() => {
      // Update CheckIn records
      execute(
        `UPDATE CheckIn SET internalMemberId = ? WHERE internalMemberId = ?`,
        [keepMemberId, mergeMemberId]
      );
      
      // Update PracticeSession records
      execute(
        `UPDATE PracticeSession SET internalMemberId = ? WHERE internalMemberId = ?`,
        [keepMemberId, mergeMemberId]
      );
      
      // Update ScanEvent records
      execute(
        `UPDATE ScanEvent SET internalMemberId = ? WHERE internalMemberId = ?`,
        [keepMemberId, mergeMemberId]
      );
      
      // Update EquipmentCheckout records
      execute(
        `UPDATE EquipmentCheckout SET internalMemberId = ? WHERE internalMemberId = ?`,
        [keepMemberId, mergeMemberId]
      );
      
      // Mark merged member as INACTIVE with mergedIntoId reference (FR-9.5)
      execute(
        `UPDATE Member SET 
           status = 'INACTIVE', 
           mergedIntoId = ?, 
           updatedAtUtc = ?, 
           syncVersion = syncVersion + 1 
         WHERE internalId = ?`,
        [keepMemberId, now, mergeMemberId]
      );
      
      // Update surviving member's syncVersion to trigger sync
      execute(
        `UPDATE Member SET 
           updatedAtUtc = ?, 
           syncVersion = syncVersion + 1 
         WHERE internalId = ?`,
        [now, keepMemberId]
      );
    });
    
    return {
      success: true,
      survivingMemberId: keepMemberId,
      mergedMemberId: mergeMemberId,
      recordsUpdated: preview.recordCounts
    };
  } catch (error) {
    return {
      success: false,
      survivingMemberId: keepMemberId,
      mergedMemberId: mergeMemberId,
      recordsUpdated: { checkIns: 0, practiceSessions: 0, scanEvents: 0, equipmentCheckouts: 0 },
      error: error instanceof Error ? error.message : 'Unknown error during merge'
    };
  }
}
