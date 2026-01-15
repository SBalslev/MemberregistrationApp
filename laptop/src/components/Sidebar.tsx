/**
 * Sidebar navigation component.
 * Provides main navigation for the laptop app.
 */

import {
  LayoutDashboard,
  Users,
  UserPlus,
  Laptop,
  Package,
  AlertTriangle,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../store';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'registrations' | 'conflicts'; // Key to look up badge count from store
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Medlemmer', icon: Users },
  { id: 'registrations', label: 'Tilmeldinger', icon: UserPlus, badgeKey: 'registrations' },
  { id: 'equipment', label: 'Udstyr', icon: Package },
  { id: 'devices', label: 'Enheder', icon: Laptop },
  { id: 'conflicts', label: 'Konflikter', icon: AlertTriangle },
  { id: 'settings', label: 'Indstillinger', icon: Settings },
];

export function Sidebar() {
  const { currentPage, setCurrentPage, hasPendingChanges, isSyncing, pendingRegistrationCount } = useAppStore();

  // Get badge count for a nav item
  function getBadgeCount(badgeKey?: string): number {
    if (badgeKey === 'registrations') return pendingRegistrationCount;
    return 0;
  }

  return (
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
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            hasPendingChanges
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing
            ? 'Synkroniserer...'
            : hasPendingChanges
              ? 'Push ændringer'
              : 'Synkronisér'}
        </button>
        {hasPendingChanges && (
          <p className="text-xs text-amber-600 text-center mt-2">
            Usendte ændringer venter
          </p>
        )}
      </div>
    </aside>
  );
}
