/**
 * Type definitions matching Android Room entities.
 * These types mirror the Kotlin data classes in the Android app.
 * 
 * @see /app/src/main/java/com/club/medlems/data/entity/Entities.kt
 */

// ===== Member Types =====

/** Member lifecycle stage: TRIAL (no membershipId) or FULL (has membershipId) */
export type MemberLifecycleStage = 'TRIAL' | 'FULL';

/** Member operational status */
export type MemberStatus = 'ACTIVE' | 'INACTIVE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

/** Fee category for membership dues calculation */
export type FeeCategoryType = 'ADULT' | 'CHILD' | 'CHILD_PLUS';

export interface Member {
  /** Immutable UUID, primary key across all devices */
  internalId: string;

  /** Club-assigned ID, null for trial members */
  membershipId: string | null;

  /** Lifecycle stage: TRIAL or FULL */
  memberLifecycleStage: MemberLifecycleStage;

  /** Operational status: ACTIVE or INACTIVE */
  status: MemberStatus;

  // Personal Information
  firstName: string;
  lastName: string;
  birthDate: string | null; // ISO date string YYYY-MM-DD (DB column name)
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zipCode: string | null;
  city: string | null;

  // Guardian info for members under 18
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;

  // Member type for fee calculation (ADULT/CHILD/CHILD_PLUS) - DB column: memberType
  memberType: FeeCategoryType;

  // Membership details
  expiresOn: string | null;
  /** @deprecated Use photoPath and photoThumbnail instead */
  registrationPhotoPath: string | null;
  /** Path to full-resolution photo file on disk */
  photoPath: string | null;
  /** Small 150x150 thumbnail as data URL for list views */
  photoThumbnail: string | null;

  // Merge tracking (per DD-10)
  mergedIntoId: string | null;

  // Timestamps
  createdAtUtc: string; // ISO datetime
  updatedAtUtc: string; // ISO datetime

  // Sync metadata
  syncedAtUtc: string | null;
  syncVersion: number;
}

// NOTE: MemberForTabletSync removed per DD-9
// All sync operations now use full Member type directly

/**
 * Lightweight member type for list views.
 * Only includes fields needed for rendering member lists.
 * Uses photoThumbnail instead of full photo for performance.
 */
export interface MemberListItem {
  internalId: string;
  membershipId: string | null;
  memberLifecycleStage: MemberLifecycleStage;
  status: MemberStatus;
  firstName: string;
  lastName: string;
  photoThumbnail: string | null;
  createdAtUtc: string;
}

// ===== Check-in Types =====

export interface CheckIn {
  id: string;
  internalMemberId: string; // FK to Member.internalId
  /** @deprecated Use internalMemberId. Retained for backward compatibility. */
  membershipId: string | null;
  localDate: string; // ISO date YYYY-MM-DD
  createdAtUtc: string;
  syncedAtUtc: string | null;
  syncVersion: number;
}

// ===== Practice Session Types =====

export type PracticeType = 'RIFLE' | 'PISTOL';

export interface PracticeSession {
  id: string;
  internalMemberId: string; // FK to Member.internalId
  /** @deprecated Use internalMemberId. Retained for backward compatibility. */
  membershipId: string | null;
  localDate: string;
  practiceType: PracticeType;
  classification: string;
  points: number;
  krydser: number | null;
  notes: string | null;
  createdAtUtc: string;
  syncedAtUtc: string | null;
  syncVersion: number;
}

// ===== Scan Event Types =====

export type ScanType = 'FIRST_SCAN' | 'REPEAT_SCAN';

export interface ScanEvent {
  id: string;
  internalMemberId: string; // FK to Member.internalId
  /** @deprecated Use internalMemberId. Retained for backward compatibility. */
  membershipId: string | null;
  scanType: ScanType;
  linkedCheckInId: string | null;
  linkedSessionId: string | null;
  canceledFlag: boolean;
  createdAtUtc: string;
  syncedAtUtc: string | null;
  syncVersion: number;
}

// ===== Member Preference Types =====

export interface MemberPreference {
  memberId: string;
  lastPracticeType: string | null;
  lastClassification: string | null;
  modifiedAtUtc: string;
}

// ===== New Member Registration Types =====

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface NewMemberRegistration {
  id: string;
  firstName: string;
  lastName: string;
  birthday: string | null;
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zipCode: string | null;
  city: string | null;
  notes: string | null;
  // Photo path - stored locally after sync receives base64 data
  photoPath: string | null;
  // Guardian info for under-18 registrations
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  // Source device info
  sourceDeviceId: string;
  sourceDeviceName: string | null;
  // Approval workflow
  approvalStatus: ApprovalStatus;
  approvedAtUtc: string | null;
  rejectedAtUtc: string | null;
  rejectionReason: string | null;
  createdMemberId: string | null;
  createdAtUtc: string;
  // Sync metadata
  syncedAtUtc: string | null;
  syncVersion: number;
}

// ===== Equipment Types =====

// Sync-compatible equipment status - matches Android sync types
export type EquipmentStatus = 'AVAILABLE' | 'CHECKED_OUT' | 'MAINTENANCE' | 'RETIRED';
// Sync-compatible equipment type - matches Android sync types
export type EquipmentType = 'TRAINING_MATERIAL';
export type ConflictStatus = 'PENDING' | 'RESOLVED' | 'CANCELLED';

export interface EquipmentItem {
  id: string;
  serialNumber: string;
  name: string;
  description: string | null;
  type: EquipmentType; // Sync field - maps to equipmentType in DB
  equipmentType?: EquipmentType; // DB field - for local queries
  status: EquipmentStatus;
  notes?: string | null;
  deviceId?: string; // Sync field
  createdByDeviceId?: string; // DB field
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
  syncedAtUtc: string | null;
}

export interface EquipmentCheckout {
  id: string;
  equipmentId: string;
  internalMemberId: string; // FK to Member.internalId
  /** @deprecated Use internalMemberId. Retained for backward compatibility. */
  membershipId: string | null;
  checkedOutAtUtc: string;
  checkedInAtUtc: string | null;
  checkedOutByDeviceId: string;
  checkedInByDeviceId: string | null;
  checkoutNotes: string | null;
  checkinNotes: string | null;
  conflictStatus: ConflictStatus | null;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
  syncedAtUtc: string | null;
}

// ===== Device Types =====

export type DeviceType = 'MEMBER_TABLET' | 'TRAINER_TABLET' | 'DISPLAY_EQUIPMENT' | 'DISPLAY_PRACTICE' | 'LAPTOP';

export interface DeviceInfo {
  id: string;
  name: string;
  type: DeviceType;
  lastSeenUtc: string | null;
  pairingDateUtc: string;
  ipAddress: string | null;
  port: number | null;
  isTrusted: boolean;
  isOnline: boolean;
}

// ===== Sync Types =====

export interface SyncConflict {
  id: string;
  conflictType: string;
  entityType: string;
  entityId: string;
  conflictingEntityId: string | null;
  localDeviceId: string;
  localDeviceName: string | null;
  localTimestamp: string;
  localSyncVersion: number;
  remoteDeviceId: string;
  remoteDeviceName: string | null;
  remoteTimestamp: string;
  remoteSyncVersion: number;
  status: 'PENDING' | 'RESOLVED' | 'SYNCED';
  resolution: string | null;
  resolvedByDeviceId: string | null;
  resolvedAtUtc: string | null;
  context: string | null;
  detectedAtUtc: string;
}

/**
 * Payload for incoming sync from tablets (full member data).
 */
export interface SyncPayloadIncoming {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  schemaVersion: string;
  timestamp: string;
  members?: Member[];
  checkIns?: CheckIn[];
  practiceSessions?: PracticeSession[];
  scanEvents?: ScanEvent[];
  registrations?: NewMemberRegistration[];
  equipmentItems?: EquipmentItem[];
  equipmentCheckouts?: EquipmentCheckout[];
}

/**
 * Payload for outgoing sync to tablets (full member data per DD-9).
 * All member fields are now synced bidirectionally.
 */
export interface SyncPayloadOutgoing {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  schemaVersion: string;
  timestamp: string;
  members?: Member[];
  checkIns?: CheckIn[];
  practiceSessions?: PracticeSession[];
  scanEvents?: ScanEvent[];
  registrations?: NewMemberRegistration[];
  equipmentItems?: EquipmentItem[];
  equipmentCheckouts?: EquipmentCheckout[];
}

/** @deprecated Use SyncPayloadIncoming or SyncPayloadOutgoing */
export interface SyncPayload {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  schemaVersion: string;
  timestamp: string;
  members?: Member[];
  checkIns?: CheckIn[];
  practiceSessions?: PracticeSession[];
  scanEvents?: ScanEvent[];
  registrations?: NewMemberRegistration[];
  equipmentItems?: EquipmentItem[];
  equipmentCheckouts?: EquipmentCheckout[];
}
