/**
 * Type definitions for Electron API exposed via preload.
 */

export interface DeviceInfo {
  deviceId: string;
  deviceType: string;
  deviceName: string;
  schemaVersion: string;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  mdnsAdvertising: boolean;
}

export interface DiscoveredDevice {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
}

export interface PairingRequest {
  deviceId: string;
  deviceType: string;
  deviceName: string;
  pairingCode?: string;
}

export interface SyncPullParams {
  since: string;
}

export interface ElectronAPI {
  getDeviceInfo: () => Promise<DeviceInfo>;
  getServerStatus: () => Promise<ServerStatus>;
  onIncomingPush: (callback: (payload: unknown) => void) => void;
  onPullRequest: (callback: (params: SyncPullParams) => void) => void;
  onPairingRequest: (callback: (device: PairingRequest) => void) => void;
  onDeviceDiscovered: (callback: (device: DiscoveredDevice) => void) => void;
  sendPullResponse: (data: unknown) => void;
  sendDevicesList: (devices: unknown[]) => void;
  
  // FR-23: Initial sync support
  onInitialSyncRequest: (callback: (payload: unknown) => void) => void;
  onMembersRequest: (callback: () => void) => void;
  sendInitialSyncResult: (result: InitialSyncResultPayload) => void;
  sendMemberData: (data: MemberDataPayload) => void;
  
  // Subnet scanning for device discovery
  scanSubnet?: () => Promise<DiscoveredDevice[]>;

  // Device name management
  getDeviceName?: () => Promise<{ name: string }>;
  setDeviceName?: (name: string) => Promise<{ success: boolean; name?: string; error?: string }>;

  // Promise-based IPC for sync data requests
  onGetMembersRequest?: (handler: (data: { since?: string; deviceType?: string }) => Promise<MemberDataPayload> | MemberDataPayload) => void;
  onProcessPushRequest?: (handler: (payload: SyncPushPayload) => Promise<SyncProcessResult> | SyncProcessResult) => void;

  // ===== SEC-1, SEC-2: Pairing Session Management =====
  
  /** Start a new pairing session, returns 6-digit code and expiration */
  startPairingSession?: (deviceType?: string, deviceName?: string) => Promise<{ code: string; expiresAt: string }>;
  
  /** Cancel the current pairing session */
  cancelPairingSession?: () => Promise<{ success: boolean }>;
  
  /** Get current pairing session status */
  getPairingSession?: () => Promise<{ code: string; expiresAt: string; isExpired: boolean } | null>;
  
  /** Sync trusted devices from database to main process cache */
  syncTrustedDevices?: (devices: TrustedDeviceCache[]) => Promise<{ success: boolean; count: number }>;
  
  /** Revoke a device from the trusted cache */
  revokeDevice?: (deviceId: string) => Promise<{ success: boolean }>;

  /** Listen for successful pairing completion (to save to database) */
  onPairingComplete?: (callback: (deviceData: PairingCompleteData) => void) => void;

  // ===== Photo Processing API =====

  /** Process a photo: save full resolution and generate thumbnail */
  processPhoto?: (internalId: string, base64Data: string) => Promise<PhotoProcessResult>;

  /** Delete a member's photo file */
  deletePhoto?: (internalId: string) => Promise<{ success: boolean; deleted?: boolean; error?: string }>;

  /** Get the path to a member's photo file */
  getPhotoPath?: (internalId: string) => Promise<{ photoPath: string | null; exists: boolean }>;

  /** Show a save dialog and return the selected path */
  showSaveDialog?: (options: { defaultPath: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath: string | null }>;

  /** Save a file from the renderer */
  saveFile?: (payload: { filePath: string; data: Uint8Array }) => Promise<{ success: boolean; error?: string }>;
}

/** Result of photo processing */
export interface PhotoProcessResult {
  success: boolean;
  photoPath?: string;
  photoThumbnail?: string;
  error?: string;
}

/** Device data for trusted devices cache sync */
export interface TrustedDeviceCache {
  id: string;
  name: string;
  type: string;
  authToken: string | null;
  tokenExpiresAt: string | null;
  isTrusted: boolean;
}

/** Data returned when pairing completes successfully */
export interface PairingCompleteData {
  id: string;
  name: string;
  type: string;
  token: string;
  tokenExpiresAt: string;
  pairingDateUtc: string;
  lastSeenUtc: string;
  isTrusted: boolean;
}

export interface SyncPushPayload {
  schemaVersion: string;
  deviceId: string;
  deviceType?: string;
  timestamp: string;
  entities: {
    members?: SyncableMemberData[];
    checkIns?: SyncableCheckIn[];
    practiceSessions?: SyncablePracticeSession[];
    newMemberRegistrations?: SyncableNewMemberRegistration[];
  };
}

export interface SyncableCheckIn {
  id: string;
  membershipId: string;
  localDate: string;
  firstOfDayFlag: boolean;
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
}

export interface SyncablePracticeSession {
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

export interface SyncableNewMemberRegistration {
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

export interface SyncProcessResult {
  accepted: number;
  errors: string[];
}

export interface InitialSyncResultPayload {
  success: boolean;
  checkInsAdded: number;
  sessionsAdded: number;
  registrationsAdded: number;
  membersReceived: number;
  memberConflicts: number;
  errors: string[];
}

export interface MemberDataPayload {
  members: SyncableMemberData[];
  registrations?: unknown[];
  equipmentItems?: unknown[];
  equipmentCheckouts?: unknown[];
  memberPreferences?: SyncableMemberPreference[];
  count: number;
  timestamp: string;
}

export interface SyncableMemberPreference {
  memberId: string;
  lastPracticeType?: string | null;
  lastClassification?: string | null;
  updatedAtUtc: string;
}

export interface SyncableMemberData {
  /** Immutable UUID, primary key across all devices */
  internalId: string;
  /** Club-assigned ID, null for trial members */
  membershipId?: string | null;
  /** Lifecycle stage: TRIAL or FULL (Android sends as memberType) */
  memberType?: 'TRIAL' | 'FULL';
  /** @deprecated Use memberType. Kept for backward compatibility. */
  memberLifecycleStage?: 'TRIAL' | 'FULL';
  /** Operational status */
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
  photoBase64?: string | null;
  mergedIntoId?: string | null;
  // Sync metadata
  deviceId?: string | null;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
}

export interface Platform {
  isElectron: boolean;
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    platform?: Platform;
  }
}

/**
 * Check if running in Electron.
 */
export function isElectron(): boolean {
  return window.platform?.isElectron === true;
}

/**
 * Get the Electron API (or undefined if not in Electron).
 */
export function getElectronAPI(): ElectronAPI | undefined {
  return window.electronAPI;
}
