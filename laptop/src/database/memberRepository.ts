/**
 * Member repository - data access layer for members.
 */

import { query, execute, transaction } from './db';
import type { Member, MemberStatus, MemberForTabletSync } from '../types';
import { toTabletMember } from '../types';

/**
 * Get all members.
 */
export function getAllMembers(): Member[] {
  return query<Member>('SELECT * FROM Member ORDER BY lastName, firstName');
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
 * Get a member by ID.
 */
export function getMemberById(membershipId: string): Member | null {
  const results = query<Member>(
    'SELECT * FROM Member WHERE membershipId = ?',
    [membershipId]
  );
  return results[0] || null;
}

/**
 * Search members by name or ID.
 */
export function searchMembers(searchQuery: string): Member[] {
  const pattern = `%${searchQuery}%`;
  return query<Member>(
    `SELECT * FROM Member 
     WHERE firstName LIKE ? OR lastName LIKE ? OR membershipId LIKE ?
     ORDER BY lastName, firstName
     LIMIT 50`,
    [pattern, pattern, pattern]
  );
}

/**
 * Insert or update a member.
 */
export function upsertMember(member: Member): void {
  const now = new Date().toISOString();
  
  execute(
    `INSERT INTO Member (
      membershipId, firstName, lastName, birthday, gender, email, phone, address,
      zipCode, city, guardianName, guardianPhone, guardianEmail,
      status, photoUri, createdAtUtc, updatedAtUtc, syncedAtUtc, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(membershipId) DO UPDATE SET
      firstName = excluded.firstName,
      lastName = excluded.lastName,
      birthday = excluded.birthday,
      gender = excluded.gender,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      zipCode = excluded.zipCode,
      city = excluded.city,
      guardianName = excluded.guardianName,
      guardianPhone = excluded.guardianPhone,
      guardianEmail = excluded.guardianEmail,
      status = excluded.status,
      photoUri = excluded.photoUri,
      updatedAtUtc = excluded.updatedAtUtc,
      syncVersion = syncVersion + 1`,
    [
      member.membershipId,
      member.firstName,
      member.lastName,
      member.birthday,
      member.gender,
      member.email,
      member.phone,
      member.address,
      member.zipCode,
      member.city,
      member.guardianName,
      member.guardianPhone,
      member.guardianEmail,
      member.status,
      member.photoUri,
      member.createdAtUtc || now,
      now,
      member.syncedAtUtc,
      member.syncVersion || 0
    ]
  );
}

/**
 * Update member status.
 */
export function updateMemberStatus(membershipId: string, status: MemberStatus): void {
  const now = new Date().toISOString();
  execute(
    'UPDATE Member SET status = ?, updatedAtUtc = ?, syncVersion = syncVersion + 1 WHERE membershipId = ?',
    [status, now, membershipId]
  );
}

/**
 * Delete a member.
 */
export function deleteMember(membershipId: string): void {
  execute('DELETE FROM Member WHERE membershipId = ?', [membershipId]);
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
 * Mark member as synced.
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
 * Get all members formatted for tablet sync.
 * Strips sensitive personal data (email, phone, address, guardian info).
 */
export function getMembersForTabletSync(): MemberForTabletSync[] {
  const members = getAllMembers();
  return members.map(toTabletMember);
}

/**
 * Get members updated since a specific time, formatted for tablet sync.
 */
export function getMembersForTabletSyncSince(sinceUtc: string): MemberForTabletSync[] {
  const members = query<Member>(
    'SELECT * FROM Member WHERE updatedAtUtc > ? ORDER BY updatedAtUtc',
    [sinceUtc]
  );
  return members.map(toTabletMember);
}
