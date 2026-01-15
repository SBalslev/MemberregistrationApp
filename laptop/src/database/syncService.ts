/**
 * Sync service for processing incoming sync payloads from tablets.
 * Handles registration sync with photo storage.
 * 
 * @see [design.md FR-18] - Sync Protocol Specification
 */

import { execute, query } from './db';
import type { NewMemberRegistration, ApprovalStatus } from '../types/entities';

/**
 * Incoming sync payload from tablet/admin devices.
 */
export interface SyncPayload {
  schemaVersion: string;
  deviceId: string;
  deviceType: string;
  timestamp: string;
  entities: {
    members?: SyncableMember[];
    checkIns?: SyncableCheckIn[];
    practiceSessions?: SyncablePracticeSession[];
    newMemberRegistrations?: SyncableNewMemberRegistration[];
    equipmentItems?: unknown[];
    equipmentCheckouts?: unknown[];
  };
}

interface SyncableMember {
  membershipId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  birthDate?: string | null;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
}

interface SyncableCheckIn {
  id: string;
  membershipId: string;
  localDate: string;
  firstOfDayFlag: boolean;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
}

interface SyncablePracticeSession {
  id: string;
  membershipId: string;
  localDate: string;
  practiceType: string;
  points: number;
  krydser?: number | null;
  classification?: string | null;
  source: string;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
}

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

export interface SyncResult {
  registrationsAdded: number;
  registrationsUpdated: number;
  checkInsAdded: number;
  sessionsAdded: number;
  photosStored: number;
  errors: string[];
}

/**
 * Process an incoming sync payload from a tablet.
 * Stores registrations with photos in the local database.
 */
export async function processSyncPayload(payload: SyncPayload): Promise<SyncResult> {
  const result: SyncResult = {
    registrationsAdded: 0,
    registrationsUpdated: 0,
    checkInsAdded: 0,
    sessionsAdded: 0,
    photosStored: 0,
    errors: []
  };

  console.log(`[SyncService] Processing payload from ${payload.deviceId}`);
  console.log(`[SyncService] Registrations: ${payload.entities.newMemberRegistrations?.length || 0}`);

  // Process new member registrations
  if (payload.entities.newMemberRegistrations) {
    for (const reg of payload.entities.newMemberRegistrations) {
      try {
        const added = await processRegistration(reg, payload.deviceId);
        if (added === 'added') {
          result.registrationsAdded++;
          if (reg.photoBase64) {
            result.photosStored++;
          }
        } else if (added === 'updated') {
          result.registrationsUpdated++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Registration ${reg.id}: ${msg}`);
        console.error(`[SyncService] Error processing registration ${reg.id}:`, error);
      }
    }
  }

  // TODO: Process check-ins when needed
  // TODO: Process practice sessions when needed

  console.log(`[SyncService] Sync complete: ${result.registrationsAdded} added, ${result.registrationsUpdated} updated`);
  return result;
}

/**
 * Process a single registration from sync payload.
 * Stores photo as base64 data URL in the database.
 */
async function processRegistration(
  reg: SyncableNewMemberRegistration,
  sourceDeviceId: string
): Promise<'added' | 'updated' | 'skipped'> {
  // Check if registration already exists
  const existing = query<{ id: string }>(
    'SELECT id FROM NewMemberRegistration WHERE id = ?',
    [reg.id]
  );

  if (existing.length > 0) {
    // Check if we should update (newer sync version)
    const current = query<{ syncVersion: number }>(
      'SELECT syncVersion FROM NewMemberRegistration WHERE id = ?',
      [reg.id]
    );
    
    if (current[0]?.syncVersion >= reg.syncVersion) {
      return 'skipped'; // Our version is same or newer
    }

    // Update existing registration
    execute(
      `UPDATE NewMemberRegistration SET
        firstName = ?, lastName = ?, birthday = ?, gender = ?,
        email = ?, phone = ?, address = ?, zipCode = ?, city = ?,
        guardianName = ?, guardianPhone = ?, guardianEmail = ?,
        photoPath = ?, sourceDeviceId = ?, syncVersion = ?, syncedAtUtc = ?
      WHERE id = ?`,
      [
        reg.firstName,
        reg.lastName,
        reg.birthDate ?? null,
        reg.gender ?? null,
        reg.email ?? null,
        reg.phone ?? null,
        reg.address ?? null,
        reg.zipCode ?? null,
        reg.city ?? null,
        reg.guardianName ?? null,
        reg.guardianPhone ?? null,
        reg.guardianEmail ?? null,
        reg.photoBase64 ? `data:image/jpeg;base64,${reg.photoBase64}` : reg.photoPath,
        sourceDeviceId,
        reg.syncVersion,
        new Date().toISOString(),
        reg.id
      ]
    );
    return 'updated';
  }

  // Map approval status
  let approvalStatus: ApprovalStatus = 'PENDING';
  if (reg.approvalStatus === 'APPROVED') approvalStatus = 'APPROVED';
  if (reg.approvalStatus === 'REJECTED') approvalStatus = 'REJECTED';

  // Convert photo to data URL if base64 is provided
  const photoPath = reg.photoBase64 
    ? `data:image/jpeg;base64,${reg.photoBase64}`
    : reg.photoPath;

  // Insert new registration
  execute(
    `INSERT INTO NewMemberRegistration (
      id, firstName, lastName, birthday, gender, email, phone,
      address, zipCode, city, notes, photoPath,
      guardianName, guardianPhone, guardianEmail,
      sourceDeviceId, sourceDeviceName, approvalStatus,
      approvedAtUtc, rejectedAtUtc, rejectionReason, createdMemberId,
      createdAtUtc, syncedAtUtc, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reg.id,
      reg.firstName,
      reg.lastName,
      reg.birthDate ?? null,
      reg.gender ?? null,
      reg.email ?? null,
      reg.phone ?? null,
      reg.address ?? null,
      reg.zipCode ?? null,
      reg.city ?? null,
      null, // notes
      photoPath,
      reg.guardianName ?? null,
      reg.guardianPhone ?? null,
      reg.guardianEmail ?? null,
      sourceDeviceId,
      null, // sourceDeviceName - we don't have it in the payload
      approvalStatus,
      null, // approvedAtUtc
      null, // rejectedAtUtc
      null, // rejectionReason
      null, // createdMemberId
      reg.createdAtUtc,
      new Date().toISOString(),
      reg.syncVersion
    ]
  );

  return 'added';
}

/**
 * Get registrations that need to be synced back to tablets.
 * Returns registrations that have been approved/rejected on the laptop.
 */
export function getRegistrationsForSync(): NewMemberRegistration[] {
  return query<NewMemberRegistration>(
    `SELECT * FROM NewMemberRegistration 
     WHERE approvalStatus != 'PENDING' 
     AND (syncedAtUtc IS NULL OR syncedAtUtc < updatedAtUtc)
     ORDER BY createdAtUtc DESC`
  );
}
