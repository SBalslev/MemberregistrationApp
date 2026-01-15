/**
 * Registration repository - data access for new member registrations.
 */

import { query, execute, transaction } from './db';
import type { NewMemberRegistration, ApprovalStatus } from '../types';

/**
 * Get all registrations.
 */
export function getAllRegistrations(): NewMemberRegistration[] {
  return query<NewMemberRegistration>(
    'SELECT * FROM NewMemberRegistration ORDER BY createdAtUtc DESC'
  );
}

/**
 * Get registrations by status.
 */
export function getRegistrationsByStatus(status: ApprovalStatus): NewMemberRegistration[] {
  return query<NewMemberRegistration>(
    'SELECT * FROM NewMemberRegistration WHERE approvalStatus = ? ORDER BY createdAtUtc ASC',
    [status]
  );
}

/**
 * Get pending registrations.
 */
export function getPendingRegistrations(): NewMemberRegistration[] {
  return getRegistrationsByStatus('PENDING');
}

/**
 * Get a registration by ID.
 */
export function getRegistrationById(id: string): NewMemberRegistration | null {
  const results = query<NewMemberRegistration>(
    'SELECT * FROM NewMemberRegistration WHERE id = ?',
    [id]
  );
  return results[0] || null;
}

/**
 * Insert a registration.
 */
export function insertRegistration(registration: NewMemberRegistration): void {
  execute(
    `INSERT INTO NewMemberRegistration (
      id, firstName, lastName, birthday, gender, email, phone, address, zipCode, city,
      notes, photoPath, guardianName, guardianPhone, guardianEmail,
      sourceDeviceId, sourceDeviceName, approvalStatus, approvedAtUtc, rejectedAtUtc,
      rejectionReason, createdMemberId, createdAtUtc, syncedAtUtc, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      registration.id,
      registration.firstName,
      registration.lastName,
      registration.birthday,
      registration.gender,
      registration.email,
      registration.phone,
      registration.address,
      registration.zipCode,
      registration.city,
      registration.notes,
      registration.photoPath,
      registration.guardianName,
      registration.guardianPhone,
      registration.guardianEmail,
      registration.sourceDeviceId,
      registration.sourceDeviceName,
      registration.approvalStatus,
      registration.approvedAtUtc,
      registration.rejectedAtUtc,
      registration.rejectionReason,
      registration.createdMemberId,
      registration.createdAtUtc,
      registration.syncedAtUtc,
      registration.syncVersion
    ]
  );
}

/**
 * Approve a registration and create a member.
 */
export function approveRegistration(
  registrationId: string,
  membershipId: string
): void {
  const now = new Date().toISOString();
  
  transaction(() => {
    // Get the registration
    const registration = getRegistrationById(registrationId);
    if (!registration) {
      throw new Error('Registration not found');
    }
    
    // Create the member with all fields from registration
    execute(
      `INSERT INTO Member (
        membershipId, firstName, lastName, birthday, gender, email, phone, 
        address, zipCode, city, guardianName, guardianPhone, guardianEmail,
        status, photoUri, createdAtUtc, updatedAtUtc, syncedAtUtc, syncVersion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        membershipId,
        registration.firstName,
        registration.lastName,
        registration.birthday,
        registration.gender,
        registration.email,
        registration.phone,
        registration.address,
        registration.zipCode,
        registration.city,
        registration.guardianName,
        registration.guardianPhone,
        registration.guardianEmail,
        'ACTIVE',
        registration.photoPath,
        now,
        now,
        null, // syncedAtUtc
        0     // syncVersion
      ]
    );
    
    // Delete the registration record since member is now created
    execute('DELETE FROM NewMemberRegistration WHERE id = ?', [registrationId]);
  });
}

/**
 * Reject a registration.
 */
export function rejectRegistration(registrationId: string, reason?: string): void {
  const now = new Date().toISOString();
  execute(
    `UPDATE NewMemberRegistration 
     SET approvalStatus = 'REJECTED', rejectedAtUtc = ?, rejectionReason = ?
     WHERE id = ?`,
    [now, reason || null, registrationId]
  );
}

/**
 * Delete a registration.
 */
export function deleteRegistration(registrationId: string): void {
  execute('DELETE FROM NewMemberRegistration WHERE id = ?', [registrationId]);
}

/**
 * Restore a rejected registration to pending.
 */
export function restoreRegistration(registrationId: string): void {
  execute(
    `UPDATE NewMemberRegistration 
     SET approvalStatus = 'PENDING', rejectedAtUtc = NULL, rejectionReason = NULL
     WHERE id = ?`,
    [registrationId]
  );
}

/**
 * Get registration counts by status.
 */
export function getRegistrationCounts(): Record<ApprovalStatus, number> {
  const results = query<{ approvalStatus: ApprovalStatus; count: number }>(
    'SELECT approvalStatus, COUNT(*) as count FROM NewMemberRegistration GROUP BY approvalStatus'
  );
  
  const counts: Record<ApprovalStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const row of results) {
    counts[row.approvalStatus] = row.count;
  }
  return counts;
}

/**
 * Bulk insert registrations (for sync).
 */
export function bulkInsertRegistrations(registrations: NewMemberRegistration[]): void {
  transaction(() => {
    for (const reg of registrations) {
      // Use INSERT OR REPLACE for idempotent sync
      execute(
        `INSERT OR REPLACE INTO NewMemberRegistration (
          id, firstName, lastName, birthday, gender, email, phone, address, zipCode, city,
          notes, photoPath, guardianName, guardianPhone, guardianEmail,
          sourceDeviceId, sourceDeviceName, approvalStatus, approvedAtUtc, rejectedAtUtc,
          rejectionReason, createdMemberId, createdAtUtc, syncedAtUtc, syncVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reg.id,
          reg.firstName,
          reg.lastName,
          reg.birthday,
          reg.gender,
          reg.email,
          reg.phone,
          reg.address,
          reg.zipCode,
          reg.city,
          reg.notes,
          reg.photoPath,
          reg.guardianName,
          reg.guardianPhone,
          reg.guardianEmail,
          reg.sourceDeviceId,
          reg.sourceDeviceName,
          reg.approvalStatus,
          reg.approvedAtUtc,
          reg.rejectedAtUtc,
          reg.rejectionReason,
          reg.createdMemberId,
          reg.createdAtUtc,
          reg.syncedAtUtc,
          reg.syncVersion
        ]
      );
    }
  });
}
