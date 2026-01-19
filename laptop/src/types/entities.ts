/**
 * Type definitions matching Android Room entities.
 * These types mirror the Kotlin data classes in the Android app.
 * 
 * @see /app/src/main/java/com/club/medlems/data/entity/Entities.kt
 */

// ===== Member Types =====

export type MemberStatus = 'ACTIVE' | 'INACTIVE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface Member {
  membershipId: string;
  firstName: string;
  lastName: string;
  birthday: string | null; // ISO date string YYYY-MM-DD
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
  // Member type for fee calculation
  memberType: 'ADULT' | 'CHILD' | 'CHILD_PLUS';
  status: MemberStatus;
  photoUri: string | null;
  createdAtUtc: string; // ISO datetime
  updatedAtUtc: string; // ISO datetime
  syncedAtUtc: string | null;
  syncVersion: number;
}

/**
 * Member data that is safe to sync to tablets.
 * Excludes sensitive personal contact info and guardian details.
 */
export interface MemberForTabletSync {
  membershipId: string;
  firstName: string;
  lastName: string;
  birthday: string | null;
  gender: Gender | null;
  status: MemberStatus;
  photoUri: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  syncedAtUtc: string | null;
  syncVersion: number;
}

/**
 * Strip sensitive fields from a member for tablet sync.
 * Removes: email, phone, address, zipCode, city, guardian info
 */
export function toTabletMember(member: Member): MemberForTabletSync {
  return {
    membershipId: member.membershipId,
    firstName: member.firstName,
    lastName: member.lastName,
    birthday: member.birthday,
    gender: member.gender,
    status: member.status,
    photoUri: member.photoUri,
    createdAtUtc: member.createdAtUtc,
    updatedAtUtc: member.updatedAtUtc,
    syncedAtUtc: member.syncedAtUtc,
    syncVersion: member.syncVersion,
  };
}

// ===== Check-in Types =====

export interface CheckIn {
  id: string;
  membershipId: string;
  localDate: string; // ISO date YYYY-MM-DD
  createdAtUtc: string;
  syncedAtUtc: string | null;
  syncVersion: number;
}

// ===== Practice Session Types =====

export type PracticeType = 'RIFLE' | 'PISTOL';

export interface PracticeSession {
  id: string;
  membershipId: string;
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
  membershipId: string;
  scanType: ScanType;
  linkedCheckInId: string | null;
  linkedSessionId: string | null;
  canceledFlag: boolean;
  createdAtUtc: string;
  syncedAtUtc: string | null;
  syncVersion: number;
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
  membershipId: string;
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
 * Payload for outgoing sync to tablets (filtered member data).
 * Members array uses MemberForTabletSync to exclude sensitive info.
 */
export interface SyncPayloadOutgoing {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  schemaVersion: string;
  timestamp: string;
  members?: MemberForTabletSync[];
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
