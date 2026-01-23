/**
 * Sidebar navigation component.
 * Provides main navigation for the laptop app.
 * 
 * @see [design.md FR-15] - Push Confirmation
 */

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAppStore } from '../store';
import { PushConfirmationDialog } from './PushConfirmationDialog';
import { query } from '../database';
import { getPendingCount, getFailedCount } from '../database/syncOutboxRepository';
import type { DeviceInfo } from '../types/entities';

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
  { id: 'trainers', label: 'Trænere', icon: GraduationCap },
  { id: 'equipment', label: 'Udstyr', icon: Package },
  { id: 'finance', label: 'Økonomi', icon: Wallet },
  { id: 'devices', label: 'Enheder', icon: Laptop },
  { id: 'conflicts', label: 'Konflikter', icon: AlertTriangle },
  { id: 'import', label: 'Importer CSV', icon: Upload },
  { id: 'settings', label: 'Indstillinger', icon: Settings },
];

export function Sidebar() {
  const { currentPage, setCurrentPage, hasPendingChanges, isSyncing } = useAppStore();
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [outboxPending, setOutboxPending] = useState(0);
  const [outboxFailed, setOutboxFailed] = useState(0);

  // Load paired devices for the push dialog
  useEffect(() => {
    try {
      const dbDevices = query<DeviceInfo>(
        'SELECT id, name, type, lastSeenUtc, pairingDateUtc, ipAddress, port, isTrusted FROM TrustedDevice ORDER BY name ASC'
      );
      setDevices(dbDevices.map(d => ({
        ...d,
        isOnline: false, // Will be updated by discovery
        isTrusted: Boolean(d.isTrusted)
      })));
    } catch {
      setDevices([]);
    }
  }, [showPushDialog]);

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
            <p className="text-xs text-gray-500">Master Laptop</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const badgeCount = getBadgeCount(item.badgeKey);

            return (
              <li key={item.id}>
                <button
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
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
      <div className="p-4 border-t border-gray-200">
        <button
          disabled={isSyncing}
          onClick={handleSyncClick}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            outboxFailed > 0
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : outboxPending > 0 || hasPendingChanges
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
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
