/**
 * Dashboard page - main landing page.
 * Shows quick stats and recent activity.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Package,
  Laptop,
  CheckCircle,
  AlertTriangle,
  WifiOff,
  Baby,
  UserCheck,
} from 'lucide-react';
import { getMemberCountByStatus, getTrialMemberCount, getRecentTrialMembers, getAllMembers, query, type TrialMemberWithActivity } from '../database';
import { useAppStore } from '../store';
import { calculateAge } from '../utils/feeCategory';
import type { Member } from '../types';

interface Stats {
  activeMembers: number;
  inactiveMembers: number;
  trialMemberCount: number;
  recentTrialMembers: TrialMemberWithActivity[];
  equipmentOut: number;
  onlineDevices: number;
  pendingConflicts: number;
}

interface MemberDemographics {
  // Based on today's date
  adultsToday: number;
  childrenToday: number;
  // Based on Jan 1 of current year
  adultsJan1: number;
  childrenJan1: number;
  // Gender breakdown
  male: number;
  female: number;
  other: number;
  unspecified: number;
  // Total
  total: number;
}

function calculateMemberDemographics(members: Member[]): MemberDemographics {
  const today = new Date();
  const jan1 = new Date(today.getFullYear(), 0, 1);

  // Only count active full members
  const activeMembers = members.filter(m => m.status === 'ACTIVE' && m.memberLifecycleStage === 'FULL');

  let adultsToday = 0;
  let childrenToday = 0;
  let adultsJan1 = 0;
  let childrenJan1 = 0;
  let male = 0;
  let female = 0;
  let other = 0;
  let unspecified = 0;

  for (const member of activeMembers) {
    // Age calculations
    if (member.birthDate) {
      const ageToday = calculateAge(member.birthDate, today);
      const ageJan1 = calculateAge(member.birthDate, jan1);

      if (ageToday >= 18) adultsToday++;
      else childrenToday++;

      if (ageJan1 >= 18) adultsJan1++;
      else childrenJan1++;
    } else {
      // No birthdate - count as adult
      adultsToday++;
      adultsJan1++;
    }

    // Gender
    switch (member.gender) {
      case 'MALE': male++; break;
      case 'FEMALE': female++; break;
      case 'OTHER': other++; break;
      default: unspecified++; break;
    }
  }

  return {
    adultsToday,
    childrenToday,
    adultsJan1,
    childrenJan1,
    male,
    female,
    other,
    unspecified,
    total: activeMembers.length,
  };
}

function getInitialStats(): Stats {
  const memberCounts = getMemberCountByStatus();

  // Count active equipment checkouts (checked out but not checked in)
  let equipmentOutCount = 0;
  try {
    const result = query<{ count: number }>(
      'SELECT COUNT(*) as count FROM EquipmentCheckout WHERE checkedInAtUtc IS NULL'
    );
    equipmentOutCount = result[0]?.count ?? 0;
  } catch {
    // Table may not exist yet
  }

  // Count pending sync conflicts
  let conflictCount = 0;
  try {
    const result = query<{ count: number }>(
      'SELECT COUNT(*) as count FROM SyncConflict WHERE resolvedAtUtc IS NULL'
    );
    conflictCount = result[0]?.count ?? 0;
  } catch {
    // Table may not exist yet
  }

  return {
    activeMembers: memberCounts.ACTIVE,
    inactiveMembers: memberCounts.INACTIVE,
    trialMemberCount: getTrialMemberCount(),
    recentTrialMembers: getRecentTrialMembers(),
    equipmentOut: equipmentOutCount,
    onlineDevices: 0, // Set dynamically from pairedDevices in component
    pendingConflicts: conflictCount,
  };
}

// Device search timeout in milliseconds
const DEVICE_SEARCH_TIMEOUT_MS = 10000;

export function DashboardPage() {
  const { setCurrentPage, pairedDevices } = useAppStore();
  const [stats] = useState<Stats>(getInitialStats);
  const [deviceSearchTimedOut, setDeviceSearchTimedOut] = useState(false);

  // Calculate member demographics
  const demographics = useMemo(() => {
    const allMembers = getAllMembers();
    return calculateMemberDemographics(allMembers);
  }, []);

  // Track online devices from store
  const onlineDevices = pairedDevices.filter(d => d.isOnline);

  // Set timeout for device search
  useEffect(() => {
    // If we already have devices, no need for timeout
    if (pairedDevices.length > 0) {
      setDeviceSearchTimedOut(false);
      return;
    }

    // Start timeout
    const timer = setTimeout(() => {
      setDeviceSearchTimedOut(true);
    }, DEVICE_SEARCH_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [pairedDevices.length]);

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
          label="Prøvemedlemmer"
          value={stats.trialMemberCount}
          color={stats.trialMemberCount > 0 ? 'amber' : 'green'}
          highlight={stats.trialMemberCount > 0}
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
          value={onlineDevices.length}
          color="green"
        />
      </div>

      {/* Member Demographics */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Medlemsoversigt
          </h2>
          <span className="text-sm text-gray-600">
            {demographics.total} aktive fuldgyldige medlemmer
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Age breakdown - Today */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Alder i dag
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Voksne (18+)</span>
                <span className="font-semibold text-gray-900">{demographics.adultsToday}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Børn (&lt;18)</span>
                <span className="font-semibold text-gray-900">{demographics.childrenToday}</span>
              </div>
            </div>
          </div>

          {/* Age breakdown - Jan 1 */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
              <Baby className="w-4 h-4" />
              Alder pr. 1. januar {new Date().getFullYear()}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Voksne (18+)</span>
                <span className="font-semibold text-gray-900">{demographics.adultsJan1}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Børn (&lt;18)</span>
                <span className="font-semibold text-gray-900">{demographics.childrenJan1}</span>
              </div>
            </div>
          </div>

          {/* Gender breakdown */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Køn
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Mænd</span>
                <span className="font-semibold text-gray-900">{demographics.male}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Kvinder</span>
                <span className="font-semibold text-gray-900">{demographics.female}</span>
              </div>
              {demographics.other > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Andet</span>
                  <span className="font-semibold text-gray-900">{demographics.other}</span>
                </div>
              )}
              {demographics.unspecified > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Ikke angivet</span>
                  <span className="font-semibold text-gray-500">{demographics.unspecified}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => setCurrentPage('statistics')}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            Se detaljeret statistik →
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trial Members */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Prøvemedlemmer
            </h2>
            {stats.trialMemberCount > 0 && (
              <span className="bg-amber-100 text-amber-700 text-sm font-medium px-3 py-1 rounded-full">
                {stats.trialMemberCount} mangler medlemsnummer
              </span>
            )}
          </div>

          {stats.recentTrialMembers.length === 0 ? (
            <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Ingen aktive prøvemedlemmer</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-600 text-sm mb-3">
                Seneste 3 måneder (oprettet eller aktiv)
              </p>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {stats.recentTrialMembers.slice(0, 5).map(({ member, lastCheckInDate, checkInCount }) => (
                  <div key={member.internalId} className="py-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {checkInCount > 0
                          ? `${checkInCount} check-in${checkInCount > 1 ? 's' : ''} - senest ${lastCheckInDate}`
                          : `Oprettet ${member.createdAtUtc.substring(0, 10)}`
                        }
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {stats.recentTrialMembers.length > 5 && (
                <p className="text-sm text-gray-500">
                  + {stats.recentTrialMembers.length - 5} flere...
                </p>
              )}
              <button
                onClick={() => setCurrentPage('members')}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Se alle medlemmer →
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
            {pairedDevices.length > 0 && (
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                onlineDevices.length > 0
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {onlineDevices.length} / {pairedDevices.length} online
              </span>
            )}
          </div>

          <div className="space-y-3">
            {pairedDevices.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {pairedDevices.map((device) => (
                  <div key={device.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        device.isOnline ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                      <div>
                        <p className="font-medium text-gray-900">{device.name}</p>
                        <p className="text-sm text-gray-500">{device.type}</p>
                      </div>
                    </div>
                    <span className={`text-sm ${
                      device.isOnline ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {device.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                ))}
              </div>
            ) : deviceSearchTimedOut ? (
              <div className="flex flex-col items-center gap-2 text-gray-500 py-8 justify-center">
                <WifiOff className="w-8 h-8 text-gray-300" />
                <span>Ingen enheder fundet</span>
                <p className="text-sm text-gray-400 text-center">
                  Sørg for at tablets er tændt og på samme netværk
                </p>
                <button
                  onClick={() => setCurrentPage('devices')}
                  className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Gå til Enheder →
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                <span>Søger efter enheder...</span>
              </div>
            )}
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
