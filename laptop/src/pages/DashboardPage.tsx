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
import { hasMemberPaidFee } from '../services/idPhotoLifecycleService';
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
  ageToday0To12: number;
  ageToday13To18: number;
  ageToday19To24: number;
  ageToday25To59: number;
  ageToday60Plus: number;
  ageTodayUnknown: number;
  ageToday0To12Paid: number;
  ageToday0To12Unpaid: number;
  ageToday13To18Paid: number;
  ageToday13To18Unpaid: number;
  ageToday19To24Paid: number;
  ageToday19To24Unpaid: number;
  ageToday25To59Paid: number;
  ageToday25To59Unpaid: number;
  ageToday60PlusPaid: number;
  ageToday60PlusUnpaid: number;
  ageTodayUnknownPaid: number;
  ageTodayUnknownUnpaid: number;
  // Based on Jan 1 of current year
  ageJan10To12: number;
  ageJan113To18: number;
  ageJan119To24: number;
  ageJan125To59: number;
  ageJan160Plus: number;
  ageJan1Unknown: number;
  ageJan10To12Paid: number;
  ageJan10To12Unpaid: number;
  ageJan113To18Paid: number;
  ageJan113To18Unpaid: number;
  ageJan119To24Paid: number;
  ageJan119To24Unpaid: number;
  ageJan125To59Paid: number;
  ageJan125To59Unpaid: number;
  ageJan160PlusPaid: number;
  ageJan160PlusUnpaid: number;
  ageJan1UnknownPaid: number;
  ageJan1UnknownUnpaid: number;
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

  // Only count active members
  const activeMembers = members.filter(m => m.status === 'ACTIVE');

  let ageToday0To12 = 0;
  let ageToday13To18 = 0;
  let ageToday19To24 = 0;
  let ageToday25To59 = 0;
  let ageToday60Plus = 0;
  let ageTodayUnknown = 0;
  let ageToday0To12Paid = 0;
  let ageToday0To12Unpaid = 0;
  let ageToday13To18Paid = 0;
  let ageToday13To18Unpaid = 0;
  let ageToday19To24Paid = 0;
  let ageToday19To24Unpaid = 0;
  let ageToday25To59Paid = 0;
  let ageToday25To59Unpaid = 0;
  let ageToday60PlusPaid = 0;
  let ageToday60PlusUnpaid = 0;
  let ageTodayUnknownPaid = 0;
  let ageTodayUnknownUnpaid = 0;
  let ageJan10To12 = 0;
  let ageJan113To18 = 0;
  let ageJan119To24 = 0;
  let ageJan125To59 = 0;
  let ageJan160Plus = 0;
  let ageJan1Unknown = 0;
  let ageJan10To12Paid = 0;
  let ageJan10To12Unpaid = 0;
  let ageJan113To18Paid = 0;
  let ageJan113To18Unpaid = 0;
  let ageJan119To24Paid = 0;
  let ageJan119To24Unpaid = 0;
  let ageJan125To59Paid = 0;
  let ageJan125To59Unpaid = 0;
  let ageJan160PlusPaid = 0;
  let ageJan160PlusUnpaid = 0;
  let ageJan1UnknownPaid = 0;
  let ageJan1UnknownUnpaid = 0;
  let male = 0;
  let female = 0;
  let other = 0;
  let unspecified = 0;

  for (const member of activeMembers) {
    const hasPaidFee = hasMemberPaidFee(member.internalId);

    // Age calculations
    if (member.birthDate) {
      const ageToday = calculateAge(member.birthDate, today);
      const ageJan1 = calculateAge(member.birthDate, jan1);

      if (ageToday <= 12) {
        ageToday0To12++;
        if (hasPaidFee) ageToday0To12Paid++; else ageToday0To12Unpaid++;
      } else if (ageToday <= 18) {
        ageToday13To18++;
        if (hasPaidFee) ageToday13To18Paid++; else ageToday13To18Unpaid++;
      } else if (ageToday <= 24) {
        ageToday19To24++;
        if (hasPaidFee) ageToday19To24Paid++; else ageToday19To24Unpaid++;
      } else if (ageToday <= 59) {
        ageToday25To59++;
        if (hasPaidFee) ageToday25To59Paid++; else ageToday25To59Unpaid++;
      } else {
        ageToday60Plus++;
        if (hasPaidFee) ageToday60PlusPaid++; else ageToday60PlusUnpaid++;
      }

      if (ageJan1 <= 12) {
        ageJan10To12++;
        if (hasPaidFee) ageJan10To12Paid++; else ageJan10To12Unpaid++;
      } else if (ageJan1 <= 18) {
        ageJan113To18++;
        if (hasPaidFee) ageJan113To18Paid++; else ageJan113To18Unpaid++;
      } else if (ageJan1 <= 24) {
        ageJan119To24++;
        if (hasPaidFee) ageJan119To24Paid++; else ageJan119To24Unpaid++;
      } else if (ageJan1 <= 59) {
        ageJan125To59++;
        if (hasPaidFee) ageJan125To59Paid++; else ageJan125To59Unpaid++;
      } else {
        ageJan160Plus++;
        if (hasPaidFee) ageJan160PlusPaid++; else ageJan160PlusUnpaid++;
      }
    } else {
      // No birthdate - track as unknown
      ageTodayUnknown++;
      ageJan1Unknown++;
      if (hasPaidFee) ageTodayUnknownPaid++; else ageTodayUnknownUnpaid++;
      if (hasPaidFee) ageJan1UnknownPaid++; else ageJan1UnknownUnpaid++;
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
    ageToday0To12,
    ageToday13To18,
    ageToday19To24,
    ageToday25To59,
    ageToday60Plus,
    ageTodayUnknown,
    ageToday0To12Paid,
    ageToday0To12Unpaid,
    ageToday13To18Paid,
    ageToday13To18Unpaid,
    ageToday19To24Paid,
    ageToday19To24Unpaid,
    ageToday25To59Paid,
    ageToday25To59Unpaid,
    ageToday60PlusPaid,
    ageToday60PlusUnpaid,
    ageTodayUnknownPaid,
    ageTodayUnknownUnpaid,
    ageJan10To12,
    ageJan113To18,
    ageJan119To24,
    ageJan125To59,
    ageJan160Plus,
    ageJan1Unknown,
    ageJan10To12Paid,
    ageJan10To12Unpaid,
    ageJan113To18Paid,
    ageJan113To18Unpaid,
    ageJan119To24Paid,
    ageJan119To24Unpaid,
    ageJan125To59Paid,
    ageJan125To59Unpaid,
    ageJan160PlusPaid,
    ageJan160PlusUnpaid,
    ageJan1UnknownPaid,
    ageJan1UnknownUnpaid,
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

  const membersMissingBirthDate = useMemo(() => {
    const allMembers = getAllMembers();
    return allMembers
      .filter((m) => m.status === 'ACTIVE' && (m.memberLifecycleStage === 'FULL' || m.memberLifecycleStage === 'TRIAL') && !m.birthDate)
      .sort((a, b) => {
        const lastNameCompare = (a.lastName || '').localeCompare(b.lastName || '', 'da');
        if (lastNameCompare !== 0) return lastNameCompare;
        return (a.firstName || '').localeCompare(b.firstName || '', 'da');
      });
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
                <div>
                  <span className="text-sm text-gray-600">0-12 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageToday0To12Paid} · Ikke betalt {demographics.ageToday0To12Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageToday0To12}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">13-18 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageToday13To18Paid} · Ikke betalt {demographics.ageToday13To18Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageToday13To18}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">19-24 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageToday19To24Paid} · Ikke betalt {demographics.ageToday19To24Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageToday19To24}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">25-59 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageToday25To59Paid} · Ikke betalt {demographics.ageToday25To59Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageToday25To59}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">60+ år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageToday60PlusPaid} · Ikke betalt {demographics.ageToday60PlusUnpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageToday60Plus}</span>
              </div>
              {demographics.ageTodayUnknown > 0 && (
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm text-gray-600">Ukendt</span>
                    <div className="text-xs text-gray-500">
                      Betalt {demographics.ageTodayUnknownPaid} · Ikke betalt {demographics.ageTodayUnknownUnpaid}
                    </div>
                  </div>
                  <span className="font-semibold text-gray-500">{demographics.ageTodayUnknown}</span>
                </div>
              )}
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
                <div>
                  <span className="text-sm text-gray-600">0-12 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageJan10To12Paid} · Ikke betalt {demographics.ageJan10To12Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageJan10To12}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">13-18 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageJan113To18Paid} · Ikke betalt {demographics.ageJan113To18Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageJan113To18}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">19-24 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageJan119To24Paid} · Ikke betalt {demographics.ageJan119To24Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageJan119To24}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">25-59 år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageJan125To59Paid} · Ikke betalt {demographics.ageJan125To59Unpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageJan125To59}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-600">60+ år</span>
                  <div className="text-xs text-gray-500">
                    Betalt {demographics.ageJan160PlusPaid} · Ikke betalt {demographics.ageJan160PlusUnpaid}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{demographics.ageJan160Plus}</span>
              </div>
              {demographics.ageJan1Unknown > 0 && (
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm text-gray-600">Ukendt</span>
                    <div className="text-xs text-gray-500">
                      Betalt {demographics.ageJan1UnknownPaid} · Ikke betalt {demographics.ageJan1UnknownUnpaid}
                    </div>
                  </div>
                  <span className="font-semibold text-gray-500">{demographics.ageJan1Unknown}</span>
                </div>
              )}
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
        {/* Missing Birthdays */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Mangler fødselsdato
            </h2>
            {membersMissingBirthDate.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-sm font-medium px-3 py-1 rounded-full">
                {membersMissingBirthDate.length} mangler fødselsdato
              </span>
            )}
          </div>

          {membersMissingBirthDate.length === 0 ? (
            <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Alle aktive medlemmer har fødselsdato</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-600 text-sm mb-3">
                Kontakt medlemmerne og opdater deres oplysninger
              </p>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {membersMissingBirthDate.slice(0, 10).map((member) => (
                  <div key={member.internalId} className="py-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {member.membershipId ? `Medlemsnr. ${member.membershipId}` : 'Ingen medlemsnr.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {membersMissingBirthDate.length > 10 && (
                <p className="text-sm text-gray-500">
                  + {membersMissingBirthDate.length - 10} flere...
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
