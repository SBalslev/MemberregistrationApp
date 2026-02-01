/**
 * Sidebar navigation component.
 * Provides main navigation for the laptop app.
 * 
 * @see [design.md FR-15] - Push Confirmation
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  Laptop,
  Package,
  Wallet,
  AlertTriangle,
  Settings,
  RefreshCw,
  Upload,
  GraduationCap,
  Activity,
  BarChart3,
  Search,
} from 'lucide-react';
import { useAppStore } from '../store';
import { PushConfirmationDialog } from './PushConfirmationDialog';
import { query } from '../database';
import { getPendingCount, getFailedCount } from '../database/syncOutboxRepository';
import type { DeviceInfo } from '../types/entities';
import { isElectron, getElectronAPI } from '../types/electron';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'conflicts'; // Key to look up badge count from store
}

// NOTE: 'registrations' page removed - approval workflow deprecated per FR-7.2
// Trial members are now created directly on tablets and synced as Member entities
const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Medlemmer', icon: Users },
  { id: 'statistics', label: 'Statistik', icon: BarChart3 },
  { id: 'member-activity', label: 'Aktivitet', icon: Activity },
  { id: 'trainers', label: 'Trænere', icon: GraduationCap },
  { id: 'minidraet-search', label: 'DGI søgning', icon: Search },
  { id: 'equipment', label: 'Udstyr', icon: Package },
  { id: 'finance', label: 'Økonomi', icon: Wallet },
  { id: 'devices', label: 'Enheder', icon: Laptop },
  { id: 'conflicts', label: 'Konflikter', icon: AlertTriangle },
  { id: 'import', label: 'Importer CSV', icon: Upload },
  { id: 'settings', label: 'Indstillinger', icon: Settings },
];

export function Sidebar() {
  const { currentPage, setCurrentPage, hasPendingChanges, isSyncing, pairedDevices, setPairedDevices, updateDeviceStatus } = useAppStore();
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [outboxPending, setOutboxPending] = useState(0);
  const [outboxFailed, setOutboxFailed] = useState(0);

  // Load paired devices from database into store on mount
  useEffect(() => {
    try {
      const dbDevices = query<DeviceInfo>(
        'SELECT id, name, type, lastSeenUtc, pairingDateUtc, ipAddress, port, isTrusted FROM TrustedDevice ORDER BY name ASC'
      );
      setPairedDevices(dbDevices.map(d => ({
        ...d,
        isOnline: false, // Will be updated by discovery
        isTrusted: Boolean(d.isTrusted)
      })));
    } catch {
      setPairedDevices([]);
    }
  }, [setPairedDevices]);

  // Subscribe to device discovery events and trigger initial scan
  useEffect(() => {
    if (!isElectron()) return;

    const api = getElectronAPI();
    if (!api) return;

    const upsertDiscoveredDevice = (device: { name: string; host: string; port: number; txt?: Record<string, string> }) => {
      const deviceId = device.txt?.deviceId || device.name;
      const currentDevices = useAppStore.getState().pairedDevices;
      const existingIndex = currentDevices.findIndex((d) => d.id === deviceId);
      const nextDevice: DeviceInfo = {
        id: deviceId,
        name: device.name,
        type: (device.txt?.deviceType as DeviceInfo['type']) || 'MEMBER_TABLET',
        ipAddress: device.host,
        port: device.port || 8085,
        isOnline: true,
        isTrusted: existingIndex >= 0 ? currentDevices[existingIndex].isTrusted : false,
        lastSeenUtc: new Date().toISOString(),
        pairingDateUtc: existingIndex >= 0 ? currentDevices[existingIndex].pairingDateUtc : new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        const updated = [...currentDevices];
        updated[existingIndex] = { ...updated[existingIndex], ...nextDevice };
        setPairedDevices(updated);
      } else {
        setPairedDevices([...currentDevices, nextDevice]);
      }
    };

    // Subscribe to device discovery events to update online status
    api.onDeviceDiscovered((device) => {
      console.log('[Sidebar] Device discovered:', device.txt?.deviceId || device.name, device.host);
      upsertDiscoveredDevice(device);
    });

    // Trigger a subnet scan to discover currently online devices
    api.scanSubnet?.().then((foundDevices) => {
      console.log('[Sidebar] Subnet scan found', foundDevices?.length || 0, 'devices');
      if (foundDevices) {
        foundDevices.forEach((device) => upsertDiscoveredDevice(device));
      }
    }).catch((err) => {
      console.error('[Sidebar] Subnet scan failed:', err);
    });
  }, [updateDeviceStatus]);

  // Track if we've done initial probe
  const hasProbed = useRef(false);
  const devicesRef = useRef(pairedDevices);
  devicesRef.current = pairedDevices;

  // Probe function using ref to avoid dependency on pairedDevices
  const probeDevices = useCallback(async () => {
    const devices = devicesRef.current;
    for (const device of devices) {
      if (!device.ipAddress) continue;

      const baseUrl = `http://${device.ipAddress}:${device.port || 8085}`;
      try {
        const response = await fetch(`${baseUrl}/api/sync/status`, {
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          console.log('[Sidebar] Device', device.name, 'is online at', baseUrl);
          updateDeviceStatus(device.id, true);
        } else {
          console.log('[Sidebar] Device', device.name, 'returned error:', response.status);
          updateDeviceStatus(device.id, false);
        }
      } catch {
        console.log('[Sidebar] Device', device.name, 'is offline (connection failed)');
        updateDeviceStatus(device.id, false);
      }
    }
  }, [updateDeviceStatus]);

  // Probe devices on initial load and periodically
  useEffect(() => {
    // Do initial probe once devices are loaded
    if (pairedDevices.length > 0 && !hasProbed.current) {
      hasProbed.current = true;
      probeDevices();
    }

    // Re-probe every 30 seconds
    const interval = setInterval(probeDevices, 30000);

    return () => clearInterval(interval);
  }, [pairedDevices.length, probeDevices]);

  // Use devices from store
  const devices = pairedDevices;

  // Load outbox counts and refresh periodically
  useEffect(() => {
    function refreshOutboxCounts() {
      try {
        setOutboxPending(getPendingCount());
        setOutboxFailed(getFailedCount());
      } catch {
        // Database may not be initialized yet
      }
    }
    refreshOutboxCounts();
    const interval = setInterval(refreshOutboxCounts, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Get badge count for a nav item
  // NOTE: 'registrations' badge removed - approval workflow deprecated per FR-7.2
  function getBadgeCount(_badgeKey?: string): number {
    return 0;
  }

  function handleSyncClick() {
    setShowPushDialog(true);
  }

  return (
    <>
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      {/* Logo/Header */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">ISS</span>
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">Medlems Admin</h1>
            <p className="text-xs text-gray-600">Master Laptop</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4" aria-label="Hovednavigation">
        <ul className="space-y-1 px-3" role="list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const badgeCount = getBadgeCount(item.badgeKey);

            return (
              <li key={item.id}>
                <button
                  onClick={() => setCurrentPage(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} aria-hidden="true" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-medium px-2 py-0.5 rounded-full" aria-label={`${badgeCount} afventende`}>
                      {badgeCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sync Status */}
      <div className="p-4 border-t border-gray-200" role="status" aria-live="polite">
        <button
          disabled={isSyncing}
          onClick={handleSyncClick}
          aria-label={isSyncing ? 'Synkroniserer data' : outboxFailed > 0 ? `${outboxFailed} synkroniseringer fejlet, klik for at prøve igen` : outboxPending > 0 ? `${outboxPending} ændringer afventer synkronisering` : 'Synkroniser data med enheder'}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            outboxFailed > 0
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : outboxPending > 0 || hasPendingChanges
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isSyncing
            ? 'Synkroniserer...'
            : outboxFailed > 0
              ? `${outboxFailed} fejlet`
              : outboxPending > 0
                ? `${outboxPending} afventer`
                : hasPendingChanges
                  ? 'Push ændringer'
                  : 'Synkronisér'}
        </button>
        {(outboxPending > 0 || outboxFailed > 0) && (
          <div className="text-xs text-center mt-2 space-y-1">
            {outboxPending > 0 && (
              <p className="text-amber-600">{outboxPending} afventer synkronisering</p>
            )}
            {outboxFailed > 0 && (
              <p className="text-red-600">{outboxFailed} fejlet - klik for at prøve igen</p>
            )}
          </div>
        )}
        {!outboxPending && !outboxFailed && hasPendingChanges && (
          <p className="text-xs text-amber-600 text-center mt-2">
            Usendte ændringer venter
          </p>
        )}
      </div>
    </aside>

    {/* Push Confirmation Dialog */}
    <PushConfirmationDialog
      isOpen={showPushDialog}
      onClose={() => setShowPushDialog(false)}
      devices={devices}
    />
  </>
  );
}
