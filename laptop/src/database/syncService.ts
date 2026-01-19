/**
 * Sync service for processing incoming sync payloads from tablets.
 * Handles registration sync with photo storage.
 * Implements initial full sync for first-time device pairing.
 * 
 * @see [design.md FR-18] - Sync Protocol Specification
 * @see [design.md FR-23] - Initial Data Migration Strategy
 */

import { execute, query } from './db';
import type { NewMemberRegistration, ApprovalStatus } from '../types/entities';
import { getAllMembers } from './memberRepository';

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
    equipmentItems?: SyncableEquipmentItem[];
    equipmentCheckouts?: SyncableEquipmentCheckout[];
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

interface SyncableEquipmentItem {
  id: string;
  serialNumber: string;
  type: string;
  description?: string | null;
  status: string;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
  syncedAtUtc?: string | null;
}

interface SyncableEquipmentCheckout {
  id: string;
  equipmentId: string;
  membershipId: string;
  checkedOutAtUtc: string;
  checkedInAtUtc?: string | null;
  checkedOutByDeviceId: string;
  checkedInByDeviceId?: string | null;
  checkoutNotes?: string | null;
  checkinNotes?: string | null;
  conflictStatus?: string | null;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
  syncedAtUtc?: string | null;
}

export interface SyncResult {
  registrationsAdded: number;
  registrationsUpdated: number;
  checkInsAdded: number;
  sessionsAdded: number;
  photosStored: number;
  equipmentItemsProcessed: number;
  equipmentCheckoutsProcessed: number;
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
    equipmentItemsProcessed: 0,
    equipmentCheckoutsProcessed: 0,
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

  // Process check-ins
  if (payload.entities.checkIns) {
    console.log(`[SyncService] Processing ${payload.entities.checkIns.length} check-ins`);
    for (const checkIn of payload.entities.checkIns) {
      try {
        const added = await processCheckIn(checkIn);
        if (added) result.checkInsAdded++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`CheckIn ${checkIn.id}: ${msg}`);
        console.error(`[SyncService] Error processing check-in ${checkIn.id}:`, error);
      }
    }
  }

  // Process practice sessions
  if (payload.entities.practiceSessions) {
    console.log(`[SyncService] Processing ${payload.entities.practiceSessions.length} practice sessions`);
    for (const session of payload.entities.practiceSessions) {
      try {
        const added = await processPracticeSession(session);
        if (added) result.sessionsAdded++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Session ${session.id}: ${msg}`);
        console.error(`[SyncService] Error processing session ${session.id}:`, error);
      }
    }
  }

  // Process equipment items
  if (payload.entities.equipmentItems) {
    console.log(`[SyncService] Processing ${payload.entities.equipmentItems.length} equipment items`);
    for (const item of payload.entities.equipmentItems) {
      try {
        const processed = await processEquipmentItem(item);
        if (processed) result.equipmentItemsProcessed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`EquipmentItem ${item.id}: ${msg}`);
        console.error(`[SyncService] Error processing equipment item ${item.id}:`, error);
      }
    }
  }

  // Process equipment checkouts
  if (payload.entities.equipmentCheckouts) {
    console.log(`[SyncService] Processing ${payload.entities.equipmentCheckouts.length} equipment checkouts`);
    for (const checkout of payload.entities.equipmentCheckouts) {
      try {
        const processed = await processEquipmentCheckout(checkout);
        if (processed) result.equipmentCheckoutsProcessed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`EquipmentCheckout ${checkout.id}: ${msg}`);
        console.error(`[SyncService] Error processing equipment checkout ${checkout.id}:`, error);
      }
    }
  }

  console.log(`[SyncService] Sync complete: ${result.registrationsAdded} registrations, ${result.checkInsAdded} check-ins, ${result.sessionsAdded} sessions, ${result.equipmentItemsProcessed} equipment items, ${result.equipmentCheckoutsProcessed} checkouts`);
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

// ===== Initial Sync / Migration Support =====

/**
 * Check if a device has completed initial sync.
 */
export function hasCompletedInitialSync(deviceId: string): boolean {
  const result = query<{ initialSyncCompleted: number }>(
    'SELECT 1 as initialSyncCompleted FROM TrustedDevice WHERE id = ? AND isTrusted = 1',
    [deviceId]
  );
  
  // For now, check if device exists in trusted list
  // A more sophisticated check would track initialSyncCompleted separately
  return result.length > 0;
}

/**
 * Mark device as having completed initial sync.
 */
export function markInitialSyncComplete(deviceId: string): void {
  const now = new Date().toISOString();
  execute(
    'UPDATE TrustedDevice SET lastSeenUtc = ? WHERE id = ?',
    [now, deviceId]
  );
}

/**
 * Get all member data for full sync to a new device.
 * This is used during initial pairing to push all master data to tablets.
 * 
 * @see FR-23.5 - When existing Member Tablet pairs for first time, laptop pushes master member data
 */
export function getMemberDataForFullSync(): SyncableMember[] {
  const members = getAllMembers();
  
  return members.map(m => ({
    membershipId: m.membershipId,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone,
    status: m.status,
    birthDate: m.birthday,
    deviceId: 'laptop-master',
    syncVersion: m.syncVersion,
    createdAtUtc: m.createdAtUtc,
    modifiedAtUtc: m.updatedAtUtc
  }));
}

/**
 * Process initial sync payload from a tablet.
 * This handles the first-time sync where:
 * - Laptop's member data takes precedence (FR-23.6)
 * - Tablet's historical CheckIn/PracticeSession data is preserved (FR-23.7, FR-23.8)
 */
export async function processInitialSyncPayload(payload: SyncPayload): Promise<InitialSyncResult> {
  const result: InitialSyncResult = {
    membersReceived: 0,
    memberConflicts: 0,
    checkInsAdded: 0,
    sessionsAdded: 0,
    registrationsAdded: 0,
    success: true,
    errors: []
  };

  console.log(`[InitialSync] Processing initial sync from ${payload.deviceId}`);

  // Process check-ins from tablet (preserve all - FR-23.8)
  if (payload.entities.checkIns) {
    for (const checkIn of payload.entities.checkIns) {
      try {
        const added = await processCheckIn(checkIn);
        if (added) result.checkInsAdded++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`CheckIn ${checkIn.id}: ${msg}`);
      }
    }
  }

  // Process practice sessions from tablet (preserve all - FR-23.8)
  if (payload.entities.practiceSessions) {
    for (const session of payload.entities.practiceSessions) {
      try {
        const added = await processPracticeSession(session);
        if (added) result.sessionsAdded++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Session ${session.id}: ${msg}`);
      }
    }
  }

  // Process registrations from tablet
  if (payload.entities.newMemberRegistrations) {
    for (const reg of payload.entities.newMemberRegistrations) {
      try {
        const addResult = await processRegistration(reg, payload.deviceId);
        if (addResult === 'added') result.registrationsAdded++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Registration ${reg.id}: ${msg}`);
      }
    }
  }

  // Member data from tablet is NOT imported - laptop is master (FR-23.6)
  // We just count them for reporting
  result.membersReceived = payload.entities.members?.length || 0;
  
  // Log any member conflicts (where tablet has different data)
  if (payload.entities.members) {
    for (const tabletMember of payload.entities.members) {
      const existing = query<{ membershipId: string }>(
        'SELECT membershipId FROM Member WHERE membershipId = ?',
        [tabletMember.membershipId]
      );
      if (existing.length > 0) {
        result.memberConflicts++;
        console.log(`[InitialSync] Member conflict: ${tabletMember.membershipId} - laptop version kept`);
      }
    }
  }

  // Mark initial sync complete for this device
  markInitialSyncComplete(payload.deviceId);

  console.log(`[InitialSync] Complete: ${result.checkInsAdded} check-ins, ${result.sessionsAdded} sessions added`);
  return result;
}

export interface InitialSyncResult {
  membersReceived: number;
  memberConflicts: number;
  checkInsAdded: number;
  sessionsAdded: number;
  registrationsAdded: number;
  success: boolean;
  errors: string[];
}

/**
 * Process a check-in record from tablet (for initial sync).
 * Check-ins are always preserved (FR-23.8).
 */
async function processCheckIn(checkIn: SyncableCheckIn): Promise<boolean> {
  // Check if already exists
  const existing = query<{ id: string }>(
    'SELECT id FROM CheckIn WHERE id = ?',
    [checkIn.id]
  );
  
  if (existing.length > 0) {
    return false; // Already exists
  }

  execute(
    `INSERT INTO CheckIn (id, membershipId, localDate, createdAtUtc, syncedAtUtc, syncVersion)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      checkIn.id,
      checkIn.membershipId,
      checkIn.localDate,
      checkIn.createdAtUtc,
      new Date().toISOString(),
      checkIn.syncVersion
    ]
  );
  
  return true;
}

/**
 * Process a practice session from tablet (for initial sync).
 * Practice sessions are always preserved (FR-23.8).
 */
async function processPracticeSession(session: SyncablePracticeSession): Promise<boolean> {
  // Check if already exists
  const existing = query<{ id: string }>(
    'SELECT id FROM PracticeSession WHERE id = ?',
    [session.id]
  );
  
  if (existing.length > 0) {
    return false; // Already exists
  }

  execute(
    `INSERT INTO PracticeSession (
      id, membershipId, localDate, practiceType, classification, 
      points, krydser, notes, createdAtUtc, syncedAtUtc, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.membershipId,
      session.localDate,
      session.practiceType,
      session.classification || '',
      session.points,
      session.krydser ?? null,
      null, // notes not in sync payload
      session.createdAtUtc,
      new Date().toISOString(),
      session.syncVersion
    ]
  );
  
  return true;
}

/**
 * Process an equipment item from sync payload.
 * Updates existing items when incoming syncVersion is higher.
 * Maps sync fields to database schema columns.
 */
async function processEquipmentItem(item: SyncableEquipmentItem): Promise<boolean> {
  // Check if already exists
  const existing = query<{ id: string; syncVersion: number }>(
    'SELECT id, syncVersion FROM EquipmentItem WHERE id = ?',
    [item.id]
  );
  
  const now = new Date().toISOString();
  
  if (existing.length > 0) {
    // Check if we should update (newer sync version)
    if (existing[0].syncVersion >= item.syncVersion) {
      return false; // Our version is same or newer
    }
    
    // Update existing item - map sync fields to DB schema
    execute(
      `UPDATE EquipmentItem SET
        serialNumber = ?, name = ?, equipmentType = ?, description = ?, status = ?,
        createdByDeviceId = ?, syncVersion = ?, modifiedAtUtc = ?, syncedAtUtc = ?
       WHERE id = ?`,
      [
        item.serialNumber,
        item.serialNumber, // Use serialNumber as name if not provided
        item.type,
        item.description ?? null,
        item.status,
        item.deviceId,
        item.syncVersion,
        item.modifiedAtUtc,
        now,
        item.id
      ]
    );
    console.log(`[SyncService] Updated equipment item ${item.id}: version=${item.syncVersion}`);
    return true;
  }

  // Insert new item - map sync fields to DB schema
  execute(
    `INSERT INTO EquipmentItem (
      id, serialNumber, name, equipmentType, description, status,
      createdByDeviceId, createdAtUtc, modifiedAtUtc, syncedAtUtc, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.serialNumber,
      item.serialNumber, // Use serialNumber as name if not provided
      item.type,
      item.description ?? null,
      item.status,
      item.deviceId,
      item.createdAtUtc,
      item.modifiedAtUtc,
      now,
      item.syncVersion
    ]
  );
  
  return true;
}

/**
 * Process an equipment checkout from sync payload.
 * Updates existing checkouts when incoming syncVersion is higher.
 * Handles check-in updates from other devices.
 * Maps sync fields to database schema columns.
 */
async function processEquipmentCheckout(checkout: SyncableEquipmentCheckout): Promise<boolean> {
  // Check if already exists
  const existing = query<{ id: string; syncVersion: number }>(
    'SELECT id, syncVersion FROM EquipmentCheckout WHERE id = ?',
    [checkout.id]
  );
  
  const now = new Date().toISOString();
  
  if (existing.length > 0) {
    // Check if we should update (newer sync version)
    if (existing[0].syncVersion >= checkout.syncVersion) {
      return false; // Our version is same or newer
    }
    
    // Update existing checkout - map sync fields to DB schema
    execute(
      `UPDATE EquipmentCheckout SET
        equipmentId = ?, membershipId = ?, checkedOutAtUtc = ?,
        checkedInAtUtc = ?, checkedOutByDeviceId = ?, checkedInByDeviceId = ?,
        checkoutNotes = ?, checkinNotes = ?, conflictStatus = ?,
        syncVersion = ?, modifiedAtUtc = ?, syncedAtUtc = ?
       WHERE id = ?`,
      [
        checkout.equipmentId,
        checkout.membershipId,
        checkout.checkedOutAtUtc,
        checkout.checkedInAtUtc ?? null,
        checkout.checkedOutByDeviceId,
        checkout.checkedInByDeviceId ?? null,
        checkout.checkoutNotes ?? null,
        checkout.checkinNotes ?? null,
        checkout.conflictStatus ?? 'None',
        checkout.syncVersion,
        checkout.modifiedAtUtc,
        now,
        checkout.id
      ]
    );
    console.log(`[SyncService] Updated checkout ${checkout.id}: checkedIn=${checkout.checkedInAtUtc != null}, version=${checkout.syncVersion}`);
    return true;
  }

  // Insert new checkout - map sync fields to DB schema
  execute(
    `INSERT INTO EquipmentCheckout (
      id, equipmentId, membershipId, checkedOutAtUtc, checkedInAtUtc,
      checkedOutByDeviceId, checkedInByDeviceId, checkoutNotes, checkinNotes,
      conflictStatus, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      checkout.id,
      checkout.equipmentId,
      checkout.membershipId,
      checkout.checkedOutAtUtc,
      checkout.checkedInAtUtc ?? null,
      checkout.checkedOutByDeviceId,
      checkout.checkedInByDeviceId ?? null,
      checkout.checkoutNotes ?? null,
      checkout.checkinNotes ?? null,
      checkout.conflictStatus ?? 'None',
      checkout.syncVersion,
      checkout.createdAtUtc,
      checkout.modifiedAtUtc,
      now
    ]
  );
  
  return true;
}

/**
 * Get equipment items for sync (to send to tablets).
 * Maps database schema columns to sync interface fields.
 */
export function getEquipmentForSync(): { equipmentItems: SyncableEquipmentItem[], equipmentCheckouts: SyncableEquipmentCheckout[] } {
  // Map DB columns to sync fields - equipmentType -> type, createdByDeviceId -> deviceId
  const items = query<{
    id: string;
    serialNumber: string;
    equipmentType: string;
    description: string | null;
    status: string;
    createdByDeviceId: string;
    syncVersion: number;
    createdAtUtc: string;
    modifiedAtUtc: string;
    syncedAtUtc: string | null;
  }>(
    `SELECT id, serialNumber, equipmentType, description, status, 
            createdByDeviceId, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc 
     FROM EquipmentItem`
  );
  
  // Convert to sync format
  const syncItems: SyncableEquipmentItem[] = items.map(item => ({
    id: item.id,
    serialNumber: item.serialNumber,
    type: item.equipmentType,
    description: item.description,
    status: item.status,
    deviceId: item.createdByDeviceId,
    syncVersion: item.syncVersion,
    createdAtUtc: item.createdAtUtc,
    modifiedAtUtc: item.modifiedAtUtc,
    syncedAtUtc: item.syncedAtUtc
  }));
  
  const checkouts = query<SyncableEquipmentCheckout>(
    `SELECT id, equipmentId, membershipId, checkedOutAtUtc, checkedInAtUtc,
            checkedOutByDeviceId, checkedInByDeviceId, checkoutNotes, checkinNotes,
            conflictStatus, checkedOutByDeviceId as deviceId, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc
     FROM EquipmentCheckout`
  );
  
  return { equipmentItems: syncItems, equipmentCheckouts: checkouts };
}

/**
 * Get full sync payload for a device that is doing initial sync.
 * Returns all member data to be pushed to the tablet.
 */
export function getFullSyncPayload(): SyncPayload {
  const members = getMemberDataForFullSync();
  const { equipmentItems, equipmentCheckouts } = getEquipmentForSync();
  
  return {
    schemaVersion: '9.0.0',
    deviceId: 'laptop-master',
    deviceType: 'LAPTOP', // Must match Android DeviceType enum
    timestamp: new Date().toISOString(),
    entities: {
      members,
      checkIns: [],
      practiceSessions: [],
      newMemberRegistrations: [],
      equipmentItems,
      equipmentCheckouts
    }
  };
}
