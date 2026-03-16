/**
 * Sync service for processing incoming sync payloads from tablets.
 * Handles registration sync with photo storage.
 * Implements initial full sync for first-time device pairing.
 * 
 * FR-7.3: NewMemberRegistration sync deprecated - incoming registrations
 * are auto-converted to trial members for backward compatibility.
 * 
 * @see [design.md FR-18] - Sync Protocol Specification
 * @see [design.md FR-23] - Initial Data Migration Strategy
 */

import { execute, query } from './db';
import type { NewMemberRegistration } from '../types/entities';
import { getAllMembers } from './memberRepository';
import { processPhoto } from '../utils/photoStorage';
import { getFeeCategoryFromBirthDate } from '../utils/feeCategory';
import { hasPendingMemberDeletion, isMessageProcessed, recordProcessedMessage, queuePracticeSessionDeletion } from './syncOutboxRepository';

// ===== Sync Schema Version =====
// Must match Android SyncSchemaVersion (same major = compatible)
export const SYNC_SCHEMA_VERSION = '1.7.0'; // 1.7.0: Added practice session deletions to sync payload
export const SYNC_SCHEMA_MAJOR = 1;

/**
 * Check if a schema version is compatible with ours.
 * Same major version = compatible (backward compatible within major).
 */
export function isSchemaCompatible(otherVersion: string): boolean {
  const parts = otherVersion.split('.');
  if (parts.length < 1) return false;
  const otherMajor = parseInt(parts[0], 10);
  if (isNaN(otherMajor)) return false;
  return otherMajor === SYNC_SCHEMA_MAJOR;
}

/**
 * Incoming sync payload from tablet/admin devices.
 */
export interface SyncPayload {
  schemaVersion: string;
  deviceId: string;
  deviceType: string;
  timestamp: string;
  /** Unique message ID for idempotency (FR-3) */
  messageId?: string;
  /** Outbox entry IDs from sender for acknowledgment */
  outboxIds?: string[];
  entities: {
    members?: SyncableMember[];
    memberDeletions?: SyncableMemberDeletion[];
    checkIns?: SyncableCheckIn[];
    practiceSessions?: SyncablePracticeSession[];
    practiceSessionDeletions?: SyncablePracticeSessionDeletion[];
    newMemberRegistrations?: SyncableNewMemberRegistration[];
    equipmentItems?: SyncableEquipmentItem[];
    equipmentCheckouts?: SyncableEquipmentCheckout[];
    memberPreferences?: SyncableMemberPreference[];
    trainerInfos?: SyncableTrainerInfo[];
    trainerDisciplines?: SyncableTrainerDiscipline[];
  };
}

interface SyncableMember {
  /** Immutable UUID, primary key across all devices */
  internalId: string;
  /** Club-assigned ID, null for trial members */
  membershipId?: string | null;
  /** Lifecycle stage: TRIAL or FULL (Android sends as memberType) */
  memberType?: 'TRIAL' | 'FULL';
  /** @deprecated Use memberType. Kept for backward compatibility. */
  memberLifecycleStage?: 'TRIAL' | 'FULL';
  /** Operational status: ACTIVE or INACTIVE */
  status?: string;
  // Personal Information
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  zipCode?: string | null;
  city?: string | null;
  // Guardian Information
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  // Membership
  expiresOn?: string | null;
  registrationPhotoPath?: string | null;
  /** Profile photo as base64 for sync transfer */
  photoBase64?: string | null;
  /** ID photo as base64 for sync transfer (adults only) */
  idPhotoBase64?: string | null;
  mergedIntoId?: string | null;
  // Sync metadata
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
}

interface SyncableMemberDeletion {
  internalId: string;
}

interface SyncablePracticeSessionDeletion {
  id: string;
}

interface SyncableCheckIn {
  id: string;
  internalMemberId: string; // FK to Member.internalId
  membershipId?: string | null; // Deprecated, retained for backward compatibility
  localDate: string;
  firstOfDayFlag: boolean;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
}

interface SyncablePracticeSession {
  id: string;
  internalMemberId: string; // FK to Member.internalId
  membershipId?: string | null; // Deprecated, retained for backward compatibility
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
  internalMemberId: string; // FK to Member.internalId
  membershipId?: string | null; // Deprecated, retained for backward compatibility
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

/**
 * Member practice preferences for sync between tablets via laptop.
 * Allows preferences to transfer when replacing a member tablet.
 */
interface SyncableMemberPreference {
  memberId: string; // FK to Member.internalId
  lastPracticeType?: string | null; // PracticeType enum name
  lastClassification?: string | null;
  updatedAtUtc: string;
}

/**
 * Trainer info for sync between devices.
 * Tracks trainer designations and certifications.
 */
interface SyncableTrainerInfo {
  memberId: string; // FK to Member.internalId
  isTrainer: boolean;
  hasSkydelederCertificate: boolean;
  certifiedDate?: string | null;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
  syncedAtUtc?: string | null;
}

/**
 * Trainer discipline qualification for sync between devices.
 * Tracks which disciplines a trainer is qualified to supervise.
 */
interface SyncableTrainerDiscipline {
  id: string;
  memberId: string; // FK to Member.internalId
  discipline: string; // PracticeType enum name
  level: string; // TrainerLevel enum name: FULL or ASSISTANT
  certifiedDate?: string | null;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
  syncedAtUtc?: string | null;
}

export interface SyncResult {
  membersAdded: number;
  membersUpdated: number;
  registrationsAdded: number;
  registrationsUpdated: number;
  checkInsAdded: number;
  sessionsAdded: number;
  sessionsDeleted: number;
  photosStored: number;
  equipmentItemsProcessed: number;
  equipmentCheckoutsProcessed: number;
  trainerInfosProcessed: number;
  trainerDisciplinesProcessed: number;
  errors: string[];
  /** Acknowledged message ID for idempotency (FR-3) */
  acknowledgedMessageId?: string;
  /** Acknowledged outbox IDs from sender */
  acknowledgedOutboxIds?: string[];
  /** Whether this was a duplicate message (already processed) */
  isDuplicate?: boolean;
}

/**
 * Process an incoming sync payload from a tablet.
 * Stores registrations with photos in the local database.
 */
export async function processSyncPayload(payload: SyncPayload): Promise<SyncResult> {
  const result: SyncResult = {
    membersAdded: 0,
    membersUpdated: 0,
    registrationsAdded: 0,
    registrationsUpdated: 0,
    checkInsAdded: 0,
    sessionsAdded: 0,
    sessionsDeleted: 0,
    photosStored: 0,
    equipmentItemsProcessed: 0,
    equipmentCheckoutsProcessed: 0,
    trainerInfosProcessed: 0,
    trainerDisciplinesProcessed: 0,
    errors: [],
    acknowledgedMessageId: payload.messageId,
    acknowledgedOutboxIds: payload.outboxIds || []
  };

  console.log(`[SyncService] Processing payload from ${payload.deviceId}`);

  // FR-3: Idempotency check - skip if this message was already processed
  if (payload.messageId) {
    try {
      if (isMessageProcessed(payload.messageId)) {
        console.log(`[SyncService] Duplicate message ${payload.messageId} - already processed`);
        result.isDuplicate = true;
        return result;
      }
    } catch (e) {
      console.warn('[SyncService] Error checking message idempotency:', e);
    }
  }
  
  // Process members (especially trial members from tablets)
  if (payload.entities.members) {
    console.log(`[SyncService] Processing ${payload.entities.members.length} members`);
    for (const member of payload.entities.members) {
      try {
        if (hasPendingMemberDeletion(member.internalId)) {
          console.log(`[SyncService] Skipping member ${member.internalId} due to pending deletion`);
          continue;
        }
        const processed = await processMember(member);
        if (processed === 'added') {
          result.membersAdded++;
          if (member.photoBase64) {
            result.photosStored++;
          }
        } else if (processed === 'updated') {
          result.membersUpdated++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Member ${member.internalId}: ${msg}`);
        console.error(`[SyncService] Error processing member ${member.internalId}:`, error);
      }
    }
  }
  
  console.log(`[SyncService] Registrations: ${payload.entities.newMemberRegistrations?.length || 0}`);

  // Process new member registrations
  if (payload.entities.newMemberRegistrations) {
    for (const reg of payload.entities.newMemberRegistrations) {
      try {
        const added = await processRegistration(reg);
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

  // Process practice session deletions
  if (payload.entities.practiceSessionDeletions) {
    console.log(`[SyncService] Processing ${payload.entities.practiceSessionDeletions.length} practice session deletions`);
    for (const deletion of payload.entities.practiceSessionDeletions) {
      try {
        const deleted = processPracticeSessionDeletion(deletion, payload.deviceId);
        if (deleted) result.sessionsDeleted++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`SessionDeletion ${deletion.id}: ${msg}`);
        console.error(`[SyncService] Error processing session deletion ${deletion.id}:`, error);
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

  // Member preferences are now derived from PracticeSession — no separate processing needed

  // Process trainer infos
  if (payload.entities.trainerInfos) {
    console.log(`[SyncService] Processing ${payload.entities.trainerInfos.length} trainer infos`);
    for (const trainerInfo of payload.entities.trainerInfos) {
      try {
        const processed = await processTrainerInfo(trainerInfo);
        if (processed) result.trainerInfosProcessed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`TrainerInfo ${trainerInfo.memberId}: ${msg}`);
        console.error(`[SyncService] Error processing trainer info ${trainerInfo.memberId}:`, error);
      }
    }
  }

  // Process trainer disciplines
  if (payload.entities.trainerDisciplines) {
    console.log(`[SyncService] Processing ${payload.entities.trainerDisciplines.length} trainer disciplines`);
    for (const discipline of payload.entities.trainerDisciplines) {
      try {
        const processed = await processTrainerDiscipline(discipline);
        if (processed) result.trainerDisciplinesProcessed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`TrainerDiscipline ${discipline.id}: ${msg}`);
        console.error(`[SyncService] Error processing trainer discipline ${discipline.id}:`, error);
      }
    }
  }

  console.log(`[SyncService] Sync complete: ${result.membersAdded} members added, ${result.membersUpdated} members updated, ${result.registrationsAdded} registrations, ${result.checkInsAdded} check-ins, ${result.sessionsAdded} sessions added, ${result.sessionsDeleted} sessions deleted, ${result.equipmentItemsProcessed} equipment items, ${result.equipmentCheckoutsProcessed} checkouts, ${result.trainerInfosProcessed} trainer infos, ${result.trainerDisciplinesProcessed} trainer disciplines`);

  // FR-3: Record message as processed for idempotency
  if (payload.messageId) {
    try {
      recordProcessedMessage(payload.messageId, payload.deviceId);
    } catch (e) {
      console.warn('[SyncService] Error recording processed message:', e);
    }
  }

  return result;
}

/**
 * Process a single registration from sync payload.
 * 
 * FR-7.3: NewMemberRegistration is deprecated. Incoming registrations are now
 * auto-converted to trial members (Member with memberType = TRIAL).
 * 
 * This maintains backward compatibility with older tablets that still send
 * NewMemberRegistration entities instead of Member entities.
 */
async function processRegistration(
  reg: SyncableNewMemberRegistration
): Promise<'added' | 'updated' | 'skipped'> {
  const now = new Date().toISOString();
  
  // FR-7.3: Convert incoming registration to trial member
  // Use registration ID as the member's internalId for continuity
  const internalId = reg.id;
  
  // Check if a member already exists with this internalId (already converted)
  const existingMember = query<{ internalId: string; syncVersion: number }>(
    'SELECT internalId, syncVersion FROM Member WHERE internalId = ?',
    [internalId]
  );
  
  if (existingMember.length > 0) {
    // Member already exists - check syncVersion
    if (existingMember[0].syncVersion >= reg.syncVersion) {
      return 'skipped';
    }
    
    // Process photo if base64 provided
    let photoPath: string | null = null;
    let photoThumbnail: string | null = null;

    if (reg.photoBase64) {
      try {
        const photoResult = await processPhoto(internalId, reg.photoBase64);
        photoPath = photoResult.photoPath;
        photoThumbnail = photoResult.photoThumbnail;
        console.log(`[SyncService] Processed photo for registration ${reg.id}`);
      } catch (error) {
        console.error(`[SyncService] Photo processing failed for ${reg.id}:`, error);
        // Fall back to data URL if processing fails
        photoPath = null;
        photoThumbnail = `data:image/jpeg;base64,${reg.photoBase64}`;
      }
    }

    // Update existing member with registration data
    execute(
      `UPDATE Member SET
        firstName = ?, lastName = ?, birthDate = ?, gender = ?,
        email = ?, phone = ?, address = ?, zipCode = ?, city = ?,
        guardianName = ?, guardianPhone = ?, guardianEmail = ?,
        photoPath = ?, photoThumbnail = ?, updatedAtUtc = ?, syncVersion = ?
      WHERE internalId = ?`,
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
        photoPath,
        photoThumbnail,
        now,
        reg.syncVersion,
        internalId
      ]
    );
    console.log(`[SyncService] FR-7.3: Updated trial member from registration ${reg.id}`);
    return 'updated';
  }
  
  // Also check if we still have the old NewMemberRegistration record
  const existingReg = query<{ id: string }>(
    'SELECT id FROM NewMemberRegistration WHERE id = ?',
    [reg.id]
  );
  
  // If old registration exists, mark it as converted (for cleanup later)
  if (existingReg.length > 0) {
    execute(
      `UPDATE NewMemberRegistration SET 
        approvalStatus = 'APPROVED', 
        createdMemberId = ?,
        syncedAtUtc = ?
      WHERE id = ?`,
      [internalId, now, reg.id]
    );
  }
  
  // Process photo if base64 provided
  let newPhotoPath: string | null = null;
  let newPhotoThumbnail: string | null = null;

  if (reg.photoBase64) {
    try {
      const photoResult = await processPhoto(internalId, reg.photoBase64);
      newPhotoPath = photoResult.photoPath;
      newPhotoThumbnail = photoResult.photoThumbnail;
      console.log(`[SyncService] Processed photo for new member ${internalId}`);
    } catch (error) {
      console.error(`[SyncService] Photo processing failed for ${internalId}:`, error);
      // Fall back to thumbnail only if processing fails
      newPhotoThumbnail = `data:image/jpeg;base64,${reg.photoBase64}`;
    }
  }

  // FR-7.3: Create new trial member from registration data
  execute(
    `INSERT INTO Member (
      internalId, membershipId, memberLifecycleStage, status,
      firstName, lastName, birthDate, gender, email, phone, address, zipCode, city,
      guardianName, guardianPhone, guardianEmail,
      photoPath, photoThumbnail, memberType,
      createdAtUtc, updatedAtUtc, syncVersion, syncedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      internalId,
      null, // membershipId - to be assigned later
      'TRIAL', // memberLifecycleStage
      'ACTIVE', // status
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
      newPhotoPath,
      newPhotoThumbnail,
      getFeeCategoryFromBirthDate(reg.birthDate ?? null),
      reg.createdAtUtc,
      now,
      reg.syncVersion,
      now
    ]
  );

  console.log(`[SyncService] FR-7.3: Converted registration ${reg.id} to trial member`);
  return 'added';
}

/**
 * Process a member from sync payload.
 * Handles trial members from tablets - upserts by internalId.
 * For existing members, only updates if incoming syncVersion is higher.
 */
async function processMember(
  member: SyncableMember
): Promise<'added' | 'updated' | 'skipped'> {
  // Check if member already exists by internalId
  const existing = query<{ internalId: string; syncVersion: number }>(
    'SELECT internalId, syncVersion FROM Member WHERE internalId = ?',
    [member.internalId]
  );

  const now = new Date().toISOString();
  // Handle memberType from Android or memberLifecycleStage (deprecated)
  const memberLifecycleStage = member.memberType || member.memberLifecycleStage || 'FULL';
  const status = member.status || 'ACTIVE';

  // Process profile photo if base64 provided
  let photoPath: string | null = null;
  let photoThumbnail: string | null = null;

  if (member.photoBase64) {
    try {
      const photoResult = await processPhoto(member.internalId, member.photoBase64);
      photoPath = photoResult.photoPath;
      photoThumbnail = photoResult.photoThumbnail;
      console.log(`[SyncService] Processed profile photo for member ${member.internalId}`);
    } catch (error) {
      console.error(`[SyncService] Profile photo processing failed for ${member.internalId}:`, error);
      // Fall back to thumbnail only if processing fails
      photoThumbnail = `data:image/jpeg;base64,${member.photoBase64}`;
    }
  }

  // Process ID photo if base64 provided (for adult verification)
  let idPhotoPath: string | null = null;
  let idPhotoThumbnail: string | null = null;

  if (member.idPhotoBase64) {
    try {
      // Use suffix '_id' to distinguish from profile photo
      const idPhotoResult = await processPhoto(`${member.internalId}_id`, member.idPhotoBase64);
      idPhotoPath = idPhotoResult.photoPath;
      idPhotoThumbnail = idPhotoResult.photoThumbnail;
      console.log(`[SyncService] Processed ID photo for member ${member.internalId}`);
    } catch (error) {
      console.error(`[SyncService] ID photo processing failed for ${member.internalId}:`, error);
      // Fall back to thumbnail only if processing fails
      idPhotoThumbnail = `data:image/jpeg;base64,${member.idPhotoBase64}`;
    }
  }

  if (existing.length > 0) {
    // Member exists - check if we should update
    if (existing[0].syncVersion >= member.syncVersion) {
      return 'skipped'; // Our version is same or newer
    }

    // Update existing member
    execute(
      `UPDATE Member SET
        membershipId = ?, memberLifecycleStage = ?, status = ?,
        firstName = ?, lastName = ?, birthDate = ?, gender = ?,
        email = ?, phone = ?, address = ?, zipCode = ?, city = ?,
        guardianName = ?, guardianPhone = ?, guardianEmail = ?,
        expiresOn = ?, photoPath = ?, photoThumbnail = ?,
        idPhotoPath = ?, idPhotoThumbnail = ?, mergedIntoId = ?,
        syncVersion = ?, updatedAtUtc = ?, syncedAtUtc = ?
       WHERE internalId = ?`,
      [
        member.membershipId ?? null,
        memberLifecycleStage,
        status,
        member.firstName,
        member.lastName,
        member.birthDate ?? null,
        member.gender ?? null,
        member.email ?? null,
        member.phone ?? null,
        member.address ?? null,
        member.zipCode ?? null,
        member.city ?? null,
        member.guardianName ?? null,
        member.guardianPhone ?? null,
        member.guardianEmail ?? null,
        member.expiresOn ?? null,
        photoPath,
        photoThumbnail,
        idPhotoPath,
        idPhotoThumbnail,
        member.mergedIntoId ?? null,
        member.syncVersion,
        member.modifiedAtUtc,
        now,
        member.internalId
      ]
    );
    console.log(`[SyncService] Updated member ${member.internalId}: ${member.firstName} ${member.lastName}`);
    return 'updated';
  }

  // Insert new member
  execute(
    `INSERT INTO Member (
      internalId, membershipId, memberLifecycleStage, status,
      firstName, lastName, birthDate, gender, email, phone,
      address, zipCode, city, guardianName, guardianPhone, guardianEmail,
      expiresOn, photoPath, photoThumbnail, idPhotoPath, idPhotoThumbnail,
      mergedIntoId, memberType, createdAtUtc, updatedAtUtc, syncVersion, syncedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      member.internalId,
      member.membershipId ?? null,
      memberLifecycleStage,
      status,
      member.firstName,
      member.lastName,
      member.birthDate ?? null,
      member.gender ?? null,
      member.email ?? null,
      member.phone ?? null,
      member.address ?? null,
      member.zipCode ?? null,
      member.city ?? null,
      member.guardianName ?? null,
      member.guardianPhone ?? null,
      member.guardianEmail ?? null,
      member.expiresOn ?? null,
      photoPath,
      photoThumbnail,
      idPhotoPath,
      idPhotoThumbnail,
      member.mergedIntoId ?? null,
      getFeeCategoryFromBirthDate(member.birthDate ?? null),
      member.createdAtUtc,
      member.modifiedAtUtc,
      member.syncVersion,
      now
    ]
  );
  
  console.log(`[SyncService] Added member ${member.internalId}: ${member.firstName} ${member.lastName} (${memberLifecycleStage})`);
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
/**
 * Validate and sanitize a date string.
 * Returns null if the date is invalid (e.g., "1900-01-00" with day 0).
 */
function sanitizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  // Check for invalid dates like "1900-01-00" (day 0) or "1900-00-01" (month 0)
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  // Validate ranges
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  // Try to parse as a real date to catch things like Feb 30
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null; // Invalid date like Feb 30
  }

  return dateStr;
}

export function getCheckInsForSync(since?: string) {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 12);
  const cutoffIso = cutoffDate.toISOString();
  const sinceDate = since ? new Date(since) : null;
  const effectiveSince = sinceDate && !Number.isNaN(sinceDate.getTime()) && sinceDate > cutoffDate
    ? sinceDate.toISOString()
    : cutoffIso;
  const params: string[] = [effectiveSince];

  const rows = query<{
    id: string;
    internalMemberId: string;
    membershipId: string | null;
    localDate: string;
    createdAtUtc: string;
    syncedAtUtc: string | null;
    syncVersion: number;
  }>(
    `SELECT id, internalMemberId, membershipId, localDate, createdAtUtc, syncedAtUtc, syncVersion
     FROM CheckIn
     WHERE createdAtUtc > ?
     ORDER BY createdAtUtc ASC`,
    params
  );

  // Laptop DB does not store first-of-day flag, default to true.
  return rows.map(row => ({
    id: row.id,
    internalMemberId: row.internalMemberId,
    membershipId: row.membershipId ?? null,
    localDate: row.localDate,
    firstOfDayFlag: true,
    deviceId: 'laptop-master',
    syncVersion: row.syncVersion || 1,
    createdAtUtc: row.createdAtUtc,
    modifiedAtUtc: row.createdAtUtc,
    syncedAtUtc: row.syncedAtUtc ?? null
  }));
}

export function getPracticeSessionsForSync(since?: string) {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 12);
  const cutoffIso = cutoffDate.toISOString();
  const sinceDate = since ? new Date(since) : null;
  const effectiveSince = sinceDate && !Number.isNaN(sinceDate.getTime()) && sinceDate > cutoffDate
    ? sinceDate.toISOString()
    : cutoffIso;
  const params: string[] = [effectiveSince];

  const rows = query<{
    id: string;
    internalMemberId: string;
    membershipId: string | null;
    localDate: string;
    practiceType: string;
    classification: string;
    points: number;
    krydser: number | null;
    createdAtUtc: string;
    syncedAtUtc: string | null;
    syncVersion: number;
  }>(
    `SELECT id, internalMemberId, membershipId, localDate, practiceType, classification, points,
            krydser, createdAtUtc, syncedAtUtc, syncVersion
     FROM PracticeSession
     WHERE createdAtUtc > ?
     ORDER BY createdAtUtc ASC`,
    params
  );

  // Laptop DB does not store session source, default to kiosk.
  return rows.map(row => ({
    id: row.id,
    internalMemberId: row.internalMemberId,
    membershipId: row.membershipId ?? null,
    localDate: row.localDate,
    practiceType: row.practiceType,
    points: row.points,
    krydser: row.krydser ?? null,
    classification: row.classification || null,
    source: 'kiosk',
    deviceId: 'laptop-master',
    syncVersion: row.syncVersion || 1,
    createdAtUtc: row.createdAtUtc,
    modifiedAtUtc: row.createdAtUtc,
    syncedAtUtc: row.syncedAtUtc ?? null
  }));
}

export function getMemberDataForFullSync(): SyncableMember[] {
  const members = getAllMembers();
  const now = new Date().toISOString();

  return members.map(m => ({
    internalId: m.internalId,
    membershipId: m.membershipId,
    memberType: (m.memberLifecycleStage === 'TRIAL' ? 'TRIAL' : 'FULL') as 'TRIAL' | 'FULL', // Android expects memberType
    memberLifecycleStage: (m.memberLifecycleStage === 'TRIAL' ? 'TRIAL' : 'FULL') as 'TRIAL' | 'FULL', // Keep for backward compat
    status: m.status || 'ACTIVE',
    firstName: m.firstName || '',
    lastName: m.lastName || '',
    birthDate: sanitizeDate(m.birthDate), // LocalDate format: "1990-05-15", sanitized for invalid dates
    gender: m.gender,
    email: m.email,
    phone: m.phone,
    address: m.address,
    zipCode: m.zipCode,
    city: m.city,
    guardianName: m.guardianName,
    guardianPhone: m.guardianPhone,
    guardianEmail: m.guardianEmail,
    expiresOn: m.expiresOn,
    registrationPhotoPath: m.registrationPhotoPath,
    // Don't send photoBase64 from laptop - photos are stored as data URLs already
    mergedIntoId: m.mergedIntoId,
    deviceId: 'laptop-master',
    syncVersion: m.syncVersion || 1,
    createdAtUtc: m.createdAtUtc || now,
    modifiedAtUtc: m.updatedAtUtc || m.createdAtUtc || now
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
        const addResult = await processRegistration(reg);
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
  // Now uses internalId as the primary key
  if (payload.entities.members) {
    for (const tabletMember of payload.entities.members) {
      const existing = query<{ internalId: string }>(
        'SELECT internalId FROM Member WHERE internalId = ?',
        [tabletMember.internalId]
      );
      if (existing.length > 0) {
        result.memberConflicts++;
        console.log(`[InitialSync] Member conflict: ${tabletMember.internalId} - laptop version kept`);
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
    `INSERT INTO CheckIn (id, internalMemberId, membershipId, localDate, createdAtUtc, syncedAtUtc, syncVersion)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      checkIn.id,
      checkIn.internalMemberId,
      checkIn.membershipId ?? null,
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
      id, internalMemberId, membershipId, localDate, practiceType, classification,
      points, krydser, notes, createdAtUtc, syncedAtUtc, syncVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.internalMemberId,
      session.membershipId ?? null,
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
 * Process a practice session deletion from sync payload.
 * Deletes the session locally and tracks it for syncing to other devices.
 */
function processPracticeSessionDeletion(
  deletion: SyncablePracticeSessionDeletion,
  sourceDeviceId: string
): boolean {
  // Check if session exists
  const existing = query<{ id: string }>(
    'SELECT id FROM PracticeSession WHERE id = ?',
    [deletion.id]
  );

  if (existing.length === 0) {
    // Already deleted or never existed - still track to propagate
    trackPracticeSessionDeletion(deletion.id, sourceDeviceId);
    return false;
  }

  // Delete the session
  execute('DELETE FROM PracticeSession WHERE id = ?', [deletion.id]);

  // Track deletion for propagation to other tablets
  trackPracticeSessionDeletion(deletion.id, sourceDeviceId);

  console.log(`[SyncService] Deleted practice session ${deletion.id} (from device ${sourceDeviceId})`);
  return true;
}

/**
 * Track a practice session deletion for propagation to other devices.
 * Uses both PracticeSessionDeletion table (for full sync payloads) and
 * SyncOutbox (for reliable delivery to all devices).
 */
function trackPracticeSessionDeletion(sessionId: string, sourceDeviceId: string): void {
  const now = new Date().toISOString();

  // Check if we already have this deletion tracked
  const existing = query<{ sessionId: string }>(
    'SELECT sessionId FROM PracticeSessionDeletion WHERE sessionId = ?',
    [sessionId]
  );

  if (existing.length > 0) {
    return; // Already tracked
  }

  // Insert deletion record for propagation (used by getFullSyncPayload)
  execute(
    `INSERT OR IGNORE INTO PracticeSessionDeletion (sessionId, sourceDeviceId, deletedAtUtc)
     VALUES (?, ?, ?)`,
    [sessionId, sourceDeviceId, now]
  );

  // Also queue to outbox for reliable delivery to all tablets
  queuePracticeSessionDeletion(sessionId);
  console.log(`[SyncService] Queued practice session deletion ${sessionId} for sync to all devices`);
}

/**
 * Get practice session deletions for sync to tablets.
 * Returns deletions that should be propagated to other devices.
 */
export function getPracticeSessionDeletionsForSync(): SyncablePracticeSessionDeletion[] {
  const deletions = query<{ sessionId: string }>(
    'SELECT sessionId FROM PracticeSessionDeletion ORDER BY deletedAtUtc ASC'
  );

  return deletions.map(d => ({ id: d.sessionId }));
}

/**
 * Ensure the PracticeSessionDeletion tracking table exists.
 */
export function ensurePracticeSessionDeletionTable(): void {
  execute(`
    CREATE TABLE IF NOT EXISTS PracticeSessionDeletion (
      sessionId TEXT PRIMARY KEY,
      sourceDeviceId TEXT NOT NULL,
      deletedAtUtc TEXT NOT NULL
    )
  `);
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
        equipmentId = ?, internalMemberId = ?, membershipId = ?, checkedOutAtUtc = ?,
        checkedInAtUtc = ?, checkedOutByDeviceId = ?, checkedInByDeviceId = ?,
        checkoutNotes = ?, checkinNotes = ?, conflictStatus = ?,
        syncVersion = ?, modifiedAtUtc = ?, syncedAtUtc = ?
       WHERE id = ?`,
      [
        checkout.equipmentId,
        checkout.internalMemberId,
        checkout.membershipId ?? null,
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
      id, equipmentId, internalMemberId, membershipId, checkedOutAtUtc, checkedInAtUtc,
      checkedOutByDeviceId, checkedInByDeviceId, checkoutNotes, checkinNotes,
      conflictStatus, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      checkout.id,
      checkout.equipmentId,
      checkout.internalMemberId,
      checkout.membershipId ?? null,
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
    `SELECT id, equipmentId, internalMemberId, membershipId, checkedOutAtUtc, checkedInAtUtc,
            checkedOutByDeviceId, checkedInByDeviceId, checkoutNotes, checkinNotes,
            conflictStatus, checkedOutByDeviceId as deviceId, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc
     FROM EquipmentCheckout`
  );
  
  return { equipmentItems: syncItems, equipmentCheckouts: checkouts };
}

/**
 * Derive member preferences for sync to member tablets from last practice session.
 * No separate MemberPreference table needed — just look at the most recent session per member.
 */
export function getMemberPreferencesForSync(): SyncableMemberPreference[] {
  return query<SyncableMemberPreference>(
    `SELECT
       ps.internalMemberId as memberId,
       ps.practiceType as lastPracticeType,
       ps.classification as lastClassification,
       ps.createdAtUtc as updatedAtUtc
     FROM PracticeSession ps
     INNER JOIN (
       SELECT internalMemberId, MAX(createdAtUtc) as maxCreated
       FROM PracticeSession
       GROUP BY internalMemberId
     ) latest ON ps.internalMemberId = latest.internalMemberId
       AND ps.createdAtUtc = latest.maxCreated`
  );
}

/**
 * Process a trainer info record from sync payload.
 * Upserts trainer info - higher syncVersion wins.
 */
async function processTrainerInfo(trainerInfo: SyncableTrainerInfo): Promise<boolean> {
  // Check if already exists
  const existing = query<{ memberId: string; syncVersion: number }>(
    'SELECT memberId, syncVersion FROM TrainerInfo WHERE memberId = ?',
    [trainerInfo.memberId]
  );

  const now = new Date().toISOString();

  if (existing.length > 0) {
    // Only update if incoming has higher version
    if (existing[0].syncVersion >= trainerInfo.syncVersion) {
      return false; // Our version is same or newer
    }

    // Update existing trainer info
    execute(
      `UPDATE TrainerInfo SET
        isTrainer = ?, hasSkydelederCertificate = ?, certifiedDate = ?,
        modifiedAtUtc = ?, deviceId = ?, syncVersion = ?, syncedAtUtc = ?
       WHERE memberId = ?`,
      [
        trainerInfo.isTrainer ? 1 : 0,
        trainerInfo.hasSkydelederCertificate ? 1 : 0,
        trainerInfo.certifiedDate ?? null,
        trainerInfo.modifiedAtUtc,
        trainerInfo.deviceId,
        trainerInfo.syncVersion,
        now,
        trainerInfo.memberId
      ]
    );
    console.log(`[SyncService] Updated trainer info for ${trainerInfo.memberId}`);
    return true;
  }

  // Insert new trainer info
  execute(
    `INSERT INTO TrainerInfo (
      memberId, isTrainer, hasSkydelederCertificate, certifiedDate,
      createdAtUtc, modifiedAtUtc, deviceId, syncVersion, syncedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trainerInfo.memberId,
      trainerInfo.isTrainer ? 1 : 0,
      trainerInfo.hasSkydelederCertificate ? 1 : 0,
      trainerInfo.certifiedDate ?? null,
      trainerInfo.createdAtUtc,
      trainerInfo.modifiedAtUtc,
      trainerInfo.deviceId,
      trainerInfo.syncVersion,
      now
    ]
  );

  console.log(`[SyncService] Added trainer info for ${trainerInfo.memberId}`);
  return true;
}

/**
 * Process a trainer discipline record from sync payload.
 * Upserts trainer discipline - higher syncVersion wins.
 */
async function processTrainerDiscipline(discipline: SyncableTrainerDiscipline): Promise<boolean> {
  // Check if already exists
  const existing = query<{ id: string; syncVersion: number }>(
    'SELECT id, syncVersion FROM TrainerDiscipline WHERE id = ?',
    [discipline.id]
  );

  const now = new Date().toISOString();

  if (existing.length > 0) {
    // Only update if incoming has higher version
    if (existing[0].syncVersion >= discipline.syncVersion) {
      return false; // Our version is same or newer
    }

    // Update existing discipline
    execute(
      `UPDATE TrainerDiscipline SET
        memberId = ?, discipline = ?, level = ?, certifiedDate = ?,
        modifiedAtUtc = ?, deviceId = ?, syncVersion = ?, syncedAtUtc = ?
       WHERE id = ?`,
      [
        discipline.memberId,
        discipline.discipline,
        discipline.level,
        discipline.certifiedDate ?? null,
        discipline.modifiedAtUtc,
        discipline.deviceId,
        discipline.syncVersion,
        now,
        discipline.id
      ]
    );
    console.log(`[SyncService] Updated trainer discipline ${discipline.id}`);
    return true;
  }

  // Insert new discipline
  execute(
    `INSERT INTO TrainerDiscipline (
      id, memberId, discipline, level, certifiedDate,
      createdAtUtc, modifiedAtUtc, deviceId, syncVersion, syncedAtUtc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      discipline.id,
      discipline.memberId,
      discipline.discipline,
      discipline.level,
      discipline.certifiedDate ?? null,
      discipline.createdAtUtc,
      discipline.modifiedAtUtc,
      discipline.deviceId,
      discipline.syncVersion,
      now
    ]
  );

  console.log(`[SyncService] Added trainer discipline ${discipline.id}`);
  return true;
}

/**
 * Get trainer data for sync to tablets.
 * Returns all trainer infos and disciplines.
 */
export function getTrainerDataForSync(): { trainerInfos: SyncableTrainerInfo[], trainerDisciplines: SyncableTrainerDiscipline[] } {
  const normalizeDateToInstant = (value?: string | null): string | null => {
    if (!value) return null;
    return value.includes('T') ? value : `${value}T00:00:00Z`;
  };

  const trainerInfos = query<SyncableTrainerInfo>(
    `SELECT memberId, isTrainer, hasSkydelederCertificate, certifiedDate,
            deviceId, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc
     FROM TrainerInfo`
  ).map(info => ({
    ...info,
    isTrainer: Boolean(info.isTrainer),
    hasSkydelederCertificate: Boolean(info.hasSkydelederCertificate),
    certifiedDate: normalizeDateToInstant(info.certifiedDate ?? null)
  }));

  const trainerDisciplines = query<SyncableTrainerDiscipline>(
    `SELECT id, memberId, discipline, level, certifiedDate,
            deviceId, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc
     FROM TrainerDiscipline`
  ).map(discipline => ({
    ...discipline,
    certifiedDate: normalizeDateToInstant(discipline.certifiedDate ?? null)
  }));

  return { trainerInfos, trainerDisciplines };
}

/**
 * Get full sync payload for a device that is doing initial sync.
 * Returns all member data to be pushed to the tablet.
 * For MEMBER_TABLET devices, also includes member preferences (derived from last practice session).
 */
export function getFullSyncPayload(deviceType?: string): SyncPayload {
  const members = getMemberDataForFullSync();
  const { equipmentItems, equipmentCheckouts } = getEquipmentForSync();
  const { trainerInfos, trainerDisciplines } = getTrainerDataForSync();
  const practiceSessionDeletions = getPracticeSessionDeletionsForSync();

  // Only include member preferences for MEMBER_TABLET devices
  const memberPreferences = deviceType === 'MEMBER_TABLET'
    ? getMemberPreferencesForSync()
    : [];

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    deviceId: 'laptop-master',
    deviceType: 'LAPTOP', // Must match Android DeviceType enum
    timestamp: new Date().toISOString(),
    entities: {
      members,
      checkIns: [],
      practiceSessions: [],
      practiceSessionDeletions,
      newMemberRegistrations: [],
      equipmentItems,
      equipmentCheckouts,
      memberPreferences,
      trainerInfos,
      trainerDisciplines
    }
  };
}
