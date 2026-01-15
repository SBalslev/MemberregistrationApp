/**
 * Application store using Zustand.
 * Manages global application state.
 */

import { create } from 'zustand';
import type { DeviceInfo, Member, NewMemberRegistration } from '../types';

interface AppState {
  // Database initialization
  isDbInitialized: boolean;
  setDbInitialized: (initialized: boolean) => void;

  // Navigation
  currentPage: string;
  setCurrentPage: (page: string) => void;

  // Device info (this laptop)
  thisDevice: DeviceInfo | null;
  setThisDevice: (device: DeviceInfo) => void;

  // Paired devices
  pairedDevices: DeviceInfo[];
  setPairedDevices: (devices: DeviceInfo[]) => void;
  updateDeviceStatus: (deviceId: string, isOnline: boolean) => void;

  // Selected items for detail views
  selectedMember: Member | null;
  setSelectedMember: (member: Member | null) => void;

  selectedRegistration: NewMemberRegistration | null;
  setSelectedRegistration: (reg: NewMemberRegistration | null) => void;

  // Pending changes (unsent master data)
  hasPendingChanges: boolean;
  setHasPendingChanges: (pending: boolean) => void;

  // Sync status
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;
  lastSyncTime: string | null;
  setLastSyncTime: (time: string | null) => void;

  // Pending registrations count (for sidebar badge)
  pendingRegistrationCount: number;
  setPendingRegistrationCount: (count: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Database
  isDbInitialized: false,
  setDbInitialized: (initialized) => set({ isDbInitialized: initialized }),

  // Navigation
  currentPage: 'dashboard',
  setCurrentPage: (page) => set({ currentPage: page }),

  // Device
  thisDevice: null,
  setThisDevice: (device) => set({ thisDevice: device }),

  // Paired devices
  pairedDevices: [],
  setPairedDevices: (devices) => set({ pairedDevices: devices }),
  updateDeviceStatus: (deviceId, isOnline) =>
    set((state) => ({
      pairedDevices: state.pairedDevices.map((d) =>
        d.id === deviceId ? { ...d, isOnline } : d
      ),
    })),

  // Selections
  selectedMember: null,
  setSelectedMember: (member) => set({ selectedMember: member }),

  selectedRegistration: null,
  setSelectedRegistration: (reg) => set({ selectedRegistration: reg }),

  // Pending changes
  hasPendingChanges: false,
  setHasPendingChanges: (pending) => set({ hasPendingChanges: pending }),

  // Sync
  isSyncing: false,
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  lastSyncTime: null,
  setLastSyncTime: (time) => set({ lastSyncTime: time }),

  // Pending registrations
  pendingRegistrationCount: 0,
  setPendingRegistrationCount: (count) => set({ pendingRegistrationCount: count }),
}));
