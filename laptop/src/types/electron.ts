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
