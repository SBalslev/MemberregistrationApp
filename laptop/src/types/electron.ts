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

  // Promise-based IPC for sync data requests
  onGetMembersRequest?: (handler: (data: { since?: string }) => Promise<MemberDataPayload> | MemberDataPayload) => void;
  onProcessPushRequest?: (handler: (payload: SyncPushPayload) => Promise<SyncProcessResult> | SyncProcessResult) => void;
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
  count: number;
  timestamp: string;
}

export interface SyncableMemberData {
  membershipId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  birthDate?: string | null;
  syncVersion: number;
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
