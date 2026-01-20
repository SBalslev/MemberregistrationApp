/**
 * Application store using Zustand.
 * Manages global application state.
 */

import { create } from 'zustand';
import type { DeviceInfo, Member, NewMemberRegistration } from '../types';
import { getMemberDataForFullSync, processSyncPayload, type SyncPayload } from '../database';

// Sync result callback for UI notifications
let syncResultCallback: ((result: SyncResultNotification) => void) | null = null;

export interface SyncResultNotification {
  success: boolean;
  message: string;
  membersPushed: number;
  checkInsReceived: number;
  sessionsReceived: number;
  registrationsReceived: number;
}

export function setSyncResultCallback(callback: (result: SyncResultNotification) => void) {
  syncResultCallback = callback;
}

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

  // @deprecated - Approval workflow removed per FR-7.2
  // Kept for backward compatibility, will be removed in future release
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
  triggerSync: () => Promise<void>;

  // @deprecated - Approval workflow removed per FR-7.2
  // Kept for backward compatibility, will be removed in future release
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
  triggerSync: async () => {
    const state = useAppStore.getState();
    if (state.isSyncing) return;
    
    set({ isSyncing: true });
    console.log('[Sync] Triggering bidirectional sync with all online devices...');
    
    const result: SyncResultNotification = {
      success: true,
      message: '',
      membersPushed: 0,
      checkInsReceived: 0,
      sessionsReceived: 0,
      registrationsReceived: 0
    };
    
    try {
      // Get all paired devices with IP addresses
      const devices = state.pairedDevices.filter(d => d.ipAddress);
      
      if (devices.length === 0) {
        console.log('[Sync] No devices with IP addresses to sync with');
        result.message = 'Ingen enheder at synkronisere med';
        result.success = false;
        syncResultCallback?.(result);
        set({ isSyncing: false });
        return;
      }

      // Get member data to push to tablets
      const memberData = getMemberDataForFullSync();
      console.log(`[Sync] Prepared ${memberData.length} members to push`);
      
      // Sync with each online device
      for (const device of devices) {
        const baseUrl = `http://${device.ipAddress}:${device.port || 8085}`;
        
        try {
          // Step 1: Check if device is online
          console.log('[Sync] Checking device:', device.name, 'at', baseUrl);
          const statusResponse = await fetch(`${baseUrl}/api/sync/status`, { 
            signal: AbortSignal.timeout(3000) 
          });
          
          if (!statusResponse.ok) {
            console.log('[Sync] Device', device.name, 'returned error:', statusResponse.status);
            state.updateDeviceStatus(device.id, false);
            continue;
          }
          
          state.updateDeviceStatus(device.id, true);
          console.log('[Sync] Device', device.name, 'is online');

          // Step 2: Push members to tablet
          console.log('[Sync] Pushing', memberData.length, 'members to', device.name);
          const pushPayload = {
            schemaVersion: '1.0.0',
            deviceId: 'laptop-master',
            deviceType: 'LAPTOP', // Must match Android DeviceType enum
            timestamp: new Date().toISOString(),
            entities: {
              members: memberData,
              checkIns: [],
              practiceSessions: [],
              newMemberRegistrations: []
            }
          };
          
          const pushResponse = await fetch(`${baseUrl}/api/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pushPayload),
            signal: AbortSignal.timeout(30000) // 30 second timeout for large payloads
          });
          
          if (pushResponse.ok) {
            const pushResult = await pushResponse.json();
            console.log('[Sync] Push result:', pushResult);
            result.membersPushed += memberData.length;
          } else {
            console.warn('[Sync] Push failed:', pushResponse.status);
          }

          // Step 3: Pull data from tablet (check-ins, sessions, registrations)
          console.log('[Sync] Pulling data from', device.name);
          const pullResponse = await fetch(`${baseUrl}/api/sync/pull?since=${encodeURIComponent('1970-01-01T00:00:00Z')}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000)
          });
          
          if (pullResponse.ok) {
            const pullData = await pullResponse.json() as SyncPayload;
            console.log('[Sync] Pull result:', 
              `${pullData.entities?.checkIns?.length || 0} check-ins, ` +
              `${pullData.entities?.practiceSessions?.length || 0} sessions, ` +
              `${pullData.entities?.newMemberRegistrations?.length || 0} registrations`
            );
            
            // Process the pulled data into our database
            if (pullData.entities) {
              const syncResult = await processSyncPayload(pullData);
              result.checkInsReceived += syncResult.checkInsAdded || 0;
              result.sessionsReceived += syncResult.sessionsAdded || 0;
              result.registrationsReceived += (syncResult.registrationsAdded || 0) + (syncResult.registrationsUpdated || 0);
            }
          } else {
            console.warn('[Sync] Pull failed:', pullResponse.status);
          }
          
        } catch (err) {
          console.log('[Sync] Error syncing with', device.name, ':', err);
          state.updateDeviceStatus(device.id, false);
        }
      }
      
      result.message = `Synkroniseret: ${result.membersPushed} medlemmer sendt, ` +
        `${result.checkInsReceived} check-ins, ${result.sessionsReceived} sessioner, ` +
        `${result.registrationsReceived} registreringer modtaget`;
      
      set({ lastSyncTime: new Date().toISOString() });
      syncResultCallback?.(result);
      
    } catch (err) {
      console.error('[Sync] Unexpected error:', err);
      result.success = false;
      result.message = err instanceof Error ? err.message : 'Ukendt fejl';
      syncResultCallback?.(result);
    } finally {
      set({ isSyncing: false });
    }
  },

  // Pending registrations
  pendingRegistrationCount: 0,
  setPendingRegistrationCount: (count) => set({ pendingRegistrationCount: count }),
}));
