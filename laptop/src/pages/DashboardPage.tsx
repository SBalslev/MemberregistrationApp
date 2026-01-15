/**
 * Dashboard page - main landing page.
 * Shows quick stats and recent activity.
 */

import { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Package,
  Laptop,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { getMemberCountByStatus, getRegistrationCounts } from '../database';
import { useAppStore } from '../store';

interface Stats {
  activeMembers: number;
  inactiveMembers: number;
  pendingRegistrations: number;
  approvedRegistrations: number;
  equipmentOut: number;
  onlineDevices: number;
  pendingConflicts: number;
}

export function DashboardPage() {
  const { setCurrentPage } = useAppStore();
  const [stats, setStats] = useState<Stats>({
    activeMembers: 0,
    inactiveMembers: 0,
    pendingRegistrations: 0,
    approvedRegistrations: 0,
    equipmentOut: 0,
    onlineDevices: 0,
    pendingConflicts: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const memberCounts = getMemberCountByStatus();
    const regCounts = getRegistrationCounts();

    setStats({
      activeMembers: memberCounts.ACTIVE,
      inactiveMembers: memberCounts.INACTIVE,
      pendingRegistrations: regCounts.PENDING,
      approvedRegistrations: regCounts.APPROVED,
      equipmentOut: 0, // TODO: Load from equipment repo
      onlineDevices: 0, // TODO: Load from device discovery
      pendingConflicts: 0, // TODO: Load from conflicts
    });
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overblik over medlemssystemet</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Users}
          label="Aktive medlemmer"
          value={stats.activeMembers}
          color="blue"
        />
        <StatCard
          icon={UserPlus}
          label="Afventende tilmeldinger"
          value={stats.pendingRegistrations}
          color={stats.pendingRegistrations > 0 ? 'amber' : 'green'}
          highlight={stats.pendingRegistrations > 0}
        />
        <StatCard
          icon={Package}
          label="Udstyr udlånt"
          value={stats.equipmentOut}
          color="purple"
        />
        <StatCard
          icon={Laptop}
          label="Enheder online"
          value={stats.onlineDevices}
          color="green"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Registrations */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Afventende tilmeldinger
            </h2>
            {stats.pendingRegistrations > 0 && (
              <span className="bg-amber-100 text-amber-700 text-sm font-medium px-3 py-1 rounded-full">
                {stats.pendingRegistrations} afventer
              </span>
            )}
          </div>

          {stats.pendingRegistrations === 0 ? (
            <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Ingen afventende tilmeldinger</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-600">
                Der er {stats.pendingRegistrations} tilmeldinger der venter på godkendelse.
              </p>
              <button 
                onClick={() => setCurrentPage('registrations')}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Gå til tilmeldinger →
              </button>
            </div>
          )}
        </div>

        {/* Device Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Enhedsstatus
            </h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
              <Clock className="w-5 h-5" />
              <span>Søger efter enheder...</span>
            </div>
          </div>
        </div>

        {/* Sync Conflicts */}
        {stats.pendingConflicts > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-semibold text-red-900">
                Synkroniseringskonflikter
              </h2>
            </div>
            <p className="text-red-700">
              Der er {stats.pendingConflicts} konflikter der kræver manuel løsning.
            </p>
            <button 
              onClick={() => setCurrentPage('conflicts')}
              className="mt-4 text-red-600 hover:text-red-700 font-medium text-sm"
            >
              Løs konflikter →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'amber' | 'purple' | 'red';
  highlight?: boolean;
}

function StatCard({ icon: Icon, label, value, color, highlight }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div
      className={`bg-white rounded-xl border p-6 ${
        highlight ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-600">{label}</p>
        </div>
      </div>
    </div>
  );
}
