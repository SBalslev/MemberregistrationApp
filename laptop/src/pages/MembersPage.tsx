/**
 * Members page - list and manage members.
 */

import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Filter, ChevronRight, User, X, Camera, Trash2, UserPlus, AlertTriangle, GitMerge, Edit2 } from 'lucide-react';
import { getAllMembers, searchMembers, upsertMember, assignMembershipId, getMemberByMembershipId, getMembersWithDuplicates, previewMerge, mergeMembers, getSkvRegistration, getSkvWeaponsByRegistrationId, upsertSkvRegistration, ensureSkvRegistration, addSkvWeapon, updateSkvWeapon, deleteSkvWeapon, getDefaultSkvRegistration, SKV_WEAPON_TYPES, SKV_CALIBERS, getMemberActivityTimeline, getSeasonDateRange, type ActivityType } from '../database';
import type { Member, Gender } from '../types';
import type { SkvRegistration, SkvWeapon, SkvStatus } from '../database/skvRepository';
import type { MergeResult } from '../database/memberRepository';
import { useAppStore } from '../store';
import { getPhotoSrc } from '../utils/photoStorage';

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>(() => getAllMembers());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('all');
  const [memberTypeFilter, setMemberTypeFilter] = useState<'all' | 'TRIAL' | 'FULL'>('all');
  const [viewMode, setViewMode] = useState<'members' | 'duplicates'>('members');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ member: Member; duplicate: Member } | null>(null);
  const { selectedMember, setSelectedMember } = useAppStore();

  function loadMembers() {
    const allMembers = getAllMembers();
    setMembers(allMembers);
  }

  // Get duplicates data
  const duplicatesData = useMemo(() => {
    if (viewMode !== 'duplicates') return [];
    return getMembersWithDuplicates();
  }, [viewMode, members]);

  const filteredMembers = useMemo(() => {
    let result = members;

    // Apply search
    if (searchQuery.trim()) {
      result = searchMembers(searchQuery);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((m) => m.status === statusFilter);
    }

    // Apply member type filter
    if (memberTypeFilter !== 'all') {
      result = result.filter((m) => m.memberLifecycleStage === memberTypeFilter);
    }

    return result;
  }, [members, searchQuery, statusFilter, memberTypeFilter]);

  // Count trial members for badge
  const trialMemberCount = useMemo(() => {
    return members.filter((m) => m.memberLifecycleStage === 'TRIAL').length;
  }, [members]);

  // Count duplicates for badge
  const duplicateCount = useMemo(() => {
    return getMembersWithDuplicates().length;
  }, [members]);

  return (
    <div className="flex h-full">
      {/* Member List */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Medlemmer</h1>
              <p className="text-gray-600 mt-1">
                {viewMode === 'members' ? `${filteredMembers.length} medlemmer` : `${duplicatesData.length} potentielle dubletter`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setViewMode('members')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'members'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Alle medlemmer
                </button>
                <button
                  onClick={() => setViewMode('duplicates')}
                  className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                    viewMode === 'duplicates'
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Dubletter
                  {duplicateCount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      viewMode === 'duplicates' ? 'bg-orange-500' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {duplicateCount}
                    </span>
                  )}
                </button>
              </div>
              <button 
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                Tilføj medlem
              </button>
            </div>
          </div>

          {/* Search and Filter - only show in members view */}
          {viewMode === 'members' && (
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Søg efter navn eller medlemsnummer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="relative">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={memberTypeFilter}
                onChange={(e) => setMemberTypeFilter(e.target.value as 'all' | 'TRIAL' | 'FULL')}
                className="pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
              >
                <option value="all">Alle typer</option>
                <option value="TRIAL">Prøvemedlemmer ({trialMemberCount})</option>
                <option value="FULL">Fuldgyldige</option>
              </select>
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'ACTIVE' | 'INACTIVE')}
                className="pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
              >
                <option value="all">Alle status</option>
                <option value="ACTIVE">Aktive</option>
                <option value="INACTIVE">Inaktive</option>
              </select>
            </div>
          </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'members' ? (
            // Member List View
            <>
              {filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <User className="w-12 h-12 mb-4 text-gray-300" />
                  <p>Ingen medlemmer fundet</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredMembers.map((member) => {
                    // Calculate days since registration for trial members
                    const daysSinceRegistration = member.memberLifecycleStage === 'TRIAL' && member.createdAtUtc
                      ? Math.floor((Date.now() - new Date(member.createdAtUtc).getTime()) / (1000 * 60 * 60 * 24))
                      : 0;
                    const trialWarning = daysSinceRegistration > 90 ? 'error' : daysSinceRegistration > 30 ? 'warning' : 'info';
                
                return (
                <li key={member.internalId}>
                  <button
                    onClick={() => setSelectedMember(member)}
                    className={`w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left ${
                      selectedMember?.internalId === member.internalId
                        ? 'bg-blue-50'
                        : ''
                    }`}
                  >
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      {(member.photoThumbnail || member.photoPath || member.registrationPhotoPath) ? (
                        <img
                          src={getPhotoSrc(member.photoThumbnail || member.photoPath || member.registrationPhotoPath) || ''}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-gray-600 font-medium text-sm">
                          {member.firstName?.[0]}
                          {member.lastName?.[0]}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">
                          {member.firstName} {member.lastName}
                        </p>
                        {member.memberLifecycleStage === 'TRIAL' && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            trialWarning === 'error' ? 'bg-red-100 text-red-700' :
                            trialWarning === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            Prøve {daysSinceRegistration > 0 && `(${daysSinceRegistration}d)`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {member.membershipId || member.internalId.slice(0, 8)}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        member.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {member.status === 'ACTIVE' ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                </li>
              );
              })}
                </ul>
              )}
            </>
          ) : (
            // Duplicates View
            <>
              {duplicatesData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <AlertTriangle className="w-12 h-12 mb-4 text-green-300" />
                  <p className="text-lg font-medium text-green-600">Ingen dubletter fundet</p>
                  <p className="text-sm mt-1">Alle medlemmer er unikke</p>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {duplicatesData.map(({ member, duplicates }) => (
                    <div key={member.internalId} className="bg-white rounded-lg border border-orange-200 shadow-sm overflow-hidden">
                      <div className="p-4 bg-orange-50 border-b border-orange-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center">
                            <span className="text-orange-700 font-medium">
                              {member.firstName?.[0]}{member.lastName?.[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{member.firstName} {member.lastName}</p>
                            <p className="text-sm text-gray-500">{member.membershipId || member.internalId.slice(0, 8)}</p>
                          </div>
                          {member.memberLifecycleStage === 'TRIAL' && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                              Prøve
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-sm text-gray-600 mb-3">Potentielle dubletter:</p>
                        <div className="space-y-2">
                          {duplicates.map((dup) => (
                            <div key={dup.member.internalId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                  <span className="text-gray-600 text-sm font-medium">
                                    {dup.member.firstName?.[0]}{dup.member.lastName?.[0]}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900 text-sm">{dup.member.firstName} {dup.member.lastName}</p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className={`px-1.5 py-0.5 rounded ${
                                      dup.confidence === 'high' ? 'bg-red-100 text-red-700' :
                                      dup.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {dup.confidence === 'high' ? 'Høj' : dup.confidence === 'medium' ? 'Medium' : 'Lav'}
                                    </span>
                                    <span>
                                      {dup.matchType === 'phone' ? 'Samme telefon' :
                                       dup.matchType === 'email' ? 'Samme email' :
                                       'Samme navn'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setMergeTarget({ member, duplicate: dup.member });
                                  setShowMergeModal(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
                              >
                                <GitMerge className="w-4 h-4" />
                                Flet
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Member Detail Panel */}
      <div className="w-96 bg-gray-50 overflow-y-auto">
        {selectedMember ? (
          <MemberDetailPanel member={selectedMember} onMemberUpdated={loadMembers} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <User className="w-16 h-16 mb-4 text-gray-300" />
            <p>Vælg et medlem for at se detaljer</p>
          </div>
        )}
      </div>

      {/* Merge Modal */}
      {showMergeModal && mergeTarget && (
        <MergeModal
          member1={mergeTarget.member}
          member2={mergeTarget.duplicate}
          onClose={() => {
            setShowMergeModal(false);
            setMergeTarget(null);
          }}
          onMerged={() => {
            setShowMergeModal(false);
            setMergeTarget(null);
            loadMembers();
          }}
        />
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal
          onClose={() => setShowAddModal(false)}
          onSave={(member) => {
            try {
              upsertMember(member);
              loadMembers();
              setShowAddModal(false);
              setSelectedMember(member);
            } catch (error) {
              console.error('Failed to save member:', error);
              alert('Kunne ikke gemme medlem. Prøv igen.');
            }
          }}
        />
      )}
    </div>
  );
}

function MemberDetailPanel({ member, onMemberUpdated }: { member: Member; onMemberUpdated: () => void }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignIdModal, setShowAssignIdModal] = useState(false);
  const [skvRegistration, setSkvRegistration] = useState<SkvRegistration | null>(null);
  const [skvWeapons, setSkvWeapons] = useState<SkvWeapon[]>([]);
  const [showSkvModal, setShowSkvModal] = useState(false);
  const [showWeaponModal, setShowWeaponModal] = useState(false);
  const [editingWeapon, setEditingWeapon] = useState<SkvWeapon | null>(null);
  const season = getSeasonDateRange();
  const [activityStartDate, setActivityStartDate] = useState(season.startDate);
  const [activityEndDate, setActivityEndDate] = useState(season.endDate);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const { setSelectedMember } = useAppStore();

  // Calculate days since registration for trial members
  const daysSinceRegistration = member.memberLifecycleStage === 'TRIAL' && member.createdAtUtc
    ? Math.floor((Date.now() - new Date(member.createdAtUtc).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const trialWarning = daysSinceRegistration > 90 ? 'error' : daysSinceRegistration > 30 ? 'warning' : 'info';

  // Get photo source - prefer full photo (photoPath) for detail view, fallback to older fields
  const photoSource = member.photoPath || member.registrationPhotoPath;
  const photoSrc = getPhotoSrc(photoSource);

  useEffect(() => {
    const registration = getSkvRegistration(member.internalId);
    setSkvRegistration(registration);
    if (registration) {
      setSkvWeapons(getSkvWeaponsByRegistrationId(registration.id));
    } else {
      setSkvWeapons([]);
    }
  }, [member.internalId]);

  function refreshSkv() {
    const registration = getSkvRegistration(member.internalId);
    setSkvRegistration(registration);
    if (registration) {
      setSkvWeapons(getSkvWeaponsByRegistrationId(registration.id));
    } else {
      setSkvWeapons([]);
    }
  }

  const activityResult = useMemo(() => {
    try {
      return {
        entries: getMemberActivityTimeline(member.internalId, {
          startDate: activityStartDate,
          endDate: activityEndDate,
          activityTypes
        }),
        error: null as string | null
      };
    } catch (error) {
      console.error('[MemberDetailPanel] Failed to load activity timeline:', error);
      return {
        entries: [],
        error: 'Noget gik galt ved indlæsning af aktivitet. Prøv igen.'
      };
    }
  }, [activityEndDate, activityStartDate, activityTypes, member.internalId]);

  const groupedActivity = useMemo(() => {
    const groups = new Map<string, typeof activityResult.entries>();
    for (const entry of activityResult.entries) {
      if (!groups.has(entry.localDate)) {
        groups.set(entry.localDate, []);
      }
      groups.get(entry.localDate)?.push(entry);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activityResult.entries]);

  function toggleActivityType(type: ActivityType) {
    setActivityTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    );
  }

  const activityTypeOptions: Array<{ value: ActivityType; label: string }> = [
    { value: 'CHECK_IN', label: 'Check-in' },
    { value: 'PRACTICE_SESSION', label: 'Træningspas' },
    { value: 'EQUIPMENT_CHECKOUT', label: 'Udlån' },
    { value: 'EQUIPMENT_RETURN', label: 'Returnering' }
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden">
          {photoSrc ? (
            <img
              src={photoSrc}
              alt=""
              className="w-20 h-20 rounded-full object-cover"
              onError={(e) => {
                // Hide image on error, show initials
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <span className={`text-gray-600 font-bold text-2xl ${photoSrc ? 'hidden' : ''}`}>
            {member.firstName?.[0]}
            {member.lastName?.[0]}
          </span>
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {member.firstName} {member.lastName}
        </h2>
        <p className="text-gray-600">{member.membershipId || `ID: ${member.internalId.slice(0, 8)}...`}</p>
        <div className="flex justify-center gap-2 mt-2">
          {member.memberLifecycleStage === 'TRIAL' && (
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              trialWarning === 'error' ? 'bg-red-100 text-red-700' :
              trialWarning === 'warning' ? 'bg-yellow-100 text-yellow-700' :
              'bg-purple-100 text-purple-700'
            }`}>
              Prøvemedlem {daysSinceRegistration > 0 && `(${daysSinceRegistration} dage)`}
            </span>
          )}
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              member.status === 'ACTIVE'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {member.status === 'ACTIVE' ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-4">
        <DetailRow label="Fødselsdag" value={member.birthDate ? `${member.birthDate} (${calculateAge(member.birthDate)} år)` : '-'} />
        <DetailRow label="Køn" value={formatGender(member.gender)} />
        <DetailRow label="Email" value={member.email || '-'} />
        <DetailRow label="Telefon" value={member.phone || '-'} />
        <DetailRow label="Adresse" value={member.address || '-'} />
        <DetailRow label="Postnummer/By" value={member.zipCode && member.city ? `${member.zipCode} ${member.city}` : member.zipCode || member.city || '-'} />
        <DetailRow label="Oprettet" value={formatDate(member.createdAtUtc)} />
        <DetailRow label="Opdateret" value={formatDate(member.updatedAtUtc)} />
      </div>

      {/* Guardian info if under 18 */}
      {member.birthDate && calculateAge(member.birthDate) < 18 && (member.guardianName || member.guardianPhone || member.guardianEmail) && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Forælder/værge</h3>
          <div className="space-y-4">
            {member.guardianName && <DetailRow label="Navn" value={member.guardianName} />}
            {member.guardianPhone && <DetailRow label="Telefon" value={member.guardianPhone} />}
            {member.guardianEmail && <DetailRow label="Email" value={member.guardianEmail} />}
          </div>
        </div>
      )}

      {/* SKV */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">SKV</h3>
          <button
            onClick={() => setShowSkvModal(true)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Rediger SKV
          </button>
        </div>
        <div className="space-y-4">
          <DetailRow
            label="Status"
            value={formatSkvStatus(skvRegistration?.status ?? 'not_started')}
          />
          <DetailRow
            label="SKV niveau"
            value={`${skvRegistration?.skvLevel ?? 6}`}
          />
          <DetailRow
            label="Senest godkendt"
            value={skvRegistration?.lastApprovedDate ? formatDate(skvRegistration.lastApprovedDate) : '-'}
          />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Våben</h4>
            <button
              onClick={() => {
                setEditingWeapon(null);
                setShowWeaponModal(true);
              }}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Tilføj våben
            </button>
          </div>

          {skvWeapons.length === 0 ? (
            <p className="text-sm text-gray-500">Ingen registrerede våben</p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Model</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Kaliber</th>
                    <th className="text-left px-3 py-2">Serienr.</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {skvWeapons.map((weapon) => (
                    <tr key={weapon.id} className="border-t border-gray-200">
                      <td className="px-3 py-2 text-gray-900">{weapon.model}</td>
                      <td className="px-3 py-2 text-gray-700">{weapon.type}</td>
                      <td className="px-3 py-2 text-gray-700">{weapon.caliber || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{weapon.serial}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            setEditingWeapon(weapon);
                            setShowWeaponModal(true);
                          }}
                          className="p-1 text-gray-500 hover:text-gray-700"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Vil du slette dette våben?')) {
                              deleteSkvWeapon(weapon.id);
                              refreshSkv();
                            }
                          }}
                          className="p-1 text-gray-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 space-y-3">
        {/* Assign Member ID button for trial members */}
        {member.memberLifecycleStage === 'TRIAL' && (
          <button 
            onClick={() => setShowAssignIdModal(true)}
            className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            Tildel medlemsnummer
          </button>
        )}
        <button 
          onClick={() => setShowEditModal(true)}
          className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Rediger medlem
        </button>
      </div>

      {/* Activity timeline */}
      <div className="mt-8 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Aktivitet</h3>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Periode</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={activityStartDate}
                onChange={(event) => setActivityStartDate(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="date"
                value={activityEndDate}
                onChange={(event) => setActivityEndDate(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Aktivitetstyper</label>
            <div className="flex flex-wrap gap-2">
              {activityTypeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleActivityType(option.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activityTypes.includes(option.value)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activityResult.error ? (
          <div className="text-sm text-red-600">{activityResult.error}</div>
        ) : activityResult.entries.length === 0 ? (
          <div className="text-sm text-gray-500">Ingen aktivitet i den valgte periode.</div>
        ) : (
          <div className="space-y-4">
            {groupedActivity.map(([date, entries]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{date}</p>
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-900">{formatActivitySummary(entry)}</p>
                        <p className="text-xs text-gray-500">{formatActivityTime(entry.occurredAtUtc)}</p>
                      </div>
                      <span className="text-xs text-gray-400">{formatActivityTypeLabel(entry.activityType)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Member ID Modal */}
      {showAssignIdModal && (
        <AssignMemberIdModal
          member={member}
          onClose={() => setShowAssignIdModal(false)}
          onAssigned={(membershipId) => {
            try {
              assignMembershipId(member.internalId, membershipId);
              onMemberUpdated();
              setShowAssignIdModal(false);
              // Reload member with new data
              const updatedMember = { ...member, membershipId, memberLifecycleStage: 'FULL' as const };
              setSelectedMember(updatedMember);
            } catch (error) {
              console.error('Failed to assign member ID:', error);
              alert('Kunne ikke tildele medlemsnummer. Prøv igen.');
            }
          }}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditMemberModal
          member={member}
          onClose={() => setShowEditModal(false)}
          onSave={(updatedMember) => {
            try {
              upsertMember(updatedMember);
              onMemberUpdated();
              setShowEditModal(false);
              setSelectedMember(updatedMember);
            } catch (error) {
              console.error('Failed to update member:', error);
              alert('Kunne ikke opdatere medlem. Prøv igen.');
            }
          }}
        />
      )}

      {showSkvModal && (
        <SkvRegistrationModal
          memberId={member.internalId}
          registration={skvRegistration ?? getDefaultSkvRegistration(member.internalId)}
          onClose={() => setShowSkvModal(false)}
          onSave={(values) => {
            const saved = upsertSkvRegistration(values);
            setSkvRegistration(saved);
            refreshSkv();
            setShowSkvModal(false);
          }}
        />
      )}

      {showWeaponModal && (
        <SkvWeaponModal
          weapon={editingWeapon}
          onClose={() => {
            setShowWeaponModal(false);
            setEditingWeapon(null);
          }}
          onSave={(values) => {
            const registration = ensureSkvRegistration(member.internalId);
            if (editingWeapon) {
              updateSkvWeapon({
                ...editingWeapon,
                ...values
              });
            } else {
              addSkvWeapon({
                ...values,
                skvRegistrationId: registration.id
              });
            }
            refreshSkv();
            setShowWeaponModal(false);
            setEditingWeapon(null);
          }}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('da-DK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function formatActivityTypeLabel(type: ActivityType): string {
  switch (type) {
    case 'CHECK_IN':
      return 'Check-in';
    case 'PRACTICE_SESSION':
      return 'Træningspas';
    case 'EQUIPMENT_CHECKOUT':
      return 'Udlån';
    case 'EQUIPMENT_RETURN':
      return 'Returnering';
    default:
      return 'Aktivitet';
  }
}

function formatActivityTime(isoDateTime: string): string {
  try {
    return new Date(isoDateTime).toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function formatActivitySummary(entry: {
  activityType: ActivityType;
  practiceType?: string | null;
  classification?: string | null;
  equipmentName?: string | null;
  points?: number | null;
}): string {
  switch (entry.activityType) {
    case 'PRACTICE_SESSION': {
      const details = [entry.practiceType, entry.classification].filter(Boolean).join(' · ');
      return details ? `Træningspas · ${details}` : 'Træningspas';
    }
    case 'EQUIPMENT_CHECKOUT':
      return entry.equipmentName ? `Udlån · ${entry.equipmentName}` : 'Udlån';
    case 'EQUIPMENT_RETURN':
      return entry.equipmentName ? `Returnering · ${entry.equipmentName}` : 'Returnering';
    case 'CHECK_IN':
    default:
      return 'Check-in';
  }
}

function calculateAge(birthday: string): number {
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function formatGender(gender: string | null): string {
  switch (gender) {
    case 'MALE': return 'Mand';
    case 'FEMALE': return 'Kvinde';
    case 'OTHER': return 'Andet';
    default: return '-';
  }
}

function formatSkvStatus(status: SkvStatus): string {
  switch (status) {
    case 'approved':
      return 'Godkendt';
    case 'requested':
      return 'Anmodet';
    default:
      return 'Ikke startet';
  }
}

interface SkvRegistrationModalProps {
  memberId: string;
  registration: SkvRegistration;
  onClose: () => void;
  onSave: (values: { memberId: string; skvLevel: number; status: SkvStatus; lastApprovedDate: string | null }) => void;
}

function SkvRegistrationModal({ memberId, registration, onClose, onSave }: SkvRegistrationModalProps) {
  const [skvLevel, setSkvLevel] = useState<number>(registration.skvLevel ?? 6);
  const [status, setStatus] = useState<SkvStatus>(registration.status ?? 'not_started');
  const [lastApprovedDate, setLastApprovedDate] = useState<string>(registration.lastApprovedDate ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'approved' && !lastApprovedDate) {
      setError('Senest godkendt dato er påkrævet ved godkendt status.');
      return;
    }
    setError(null);
    onSave({
      memberId,
      skvLevel,
      status,
      lastApprovedDate: lastApprovedDate || null
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">SKV registrering</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SkvStatus)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="not_started">Ikke startet</option>
              <option value="requested">Anmodet</option>
              <option value="approved">Godkendt</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SKV niveau
            </label>
            <select
              value={skvLevel}
              onChange={(e) => setSkvLevel(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>SKV {level}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senest godkendt
            </label>
            <input
              type="date"
              value={lastApprovedDate}
              onChange={(e) => setLastApprovedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {status === 'approved' && !lastApprovedDate && (
              <p className="text-xs text-red-600 mt-1">Påkrævet ved godkendt status</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
            >
              Annuller
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Gem
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SkvWeaponModalProps {
  weapon: SkvWeapon | null;
  onClose: () => void;
  onSave: (values: Omit<SkvWeapon, 'id' | 'createdAtUtc' | 'updatedAtUtc' | 'skvRegistrationId'>) => void;
}

function SkvWeaponModal({ weapon, onClose, onSave }: SkvWeaponModalProps) {
  const [model, setModel] = useState(weapon?.model ?? '');
  const [description, setDescription] = useState(weapon?.description ?? '');
  const [serial, setSerial] = useState(weapon?.serial ?? '');
  const [type, setType] = useState(weapon?.type ?? '');
  const [caliber, setCaliber] = useState(weapon?.caliber ?? '');
  const [lastReviewedDate, setLastReviewedDate] = useState(weapon?.lastReviewedDate ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!model.trim() || !serial.trim() || !type.trim()) {
      setError('Model, serienummer og type er påkrævet.');
      return;
    }
    setError(null);
    onSave({
      model: model.trim().slice(0, 100),
      description: description.trim().slice(0, 500) || null,
      serial: serial.trim().slice(0, 100),
      type: type.trim().slice(0, 50),
      caliber: caliber.trim().slice(0, 50) || null,
      lastReviewedDate: lastReviewedDate || null
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{weapon ? 'Rediger våben' : 'Tilføj våben'}</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Vælg type</option>
              {SKV_WEAPON_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kaliber
            </label>
            <select
              value={caliber}
              onChange={(e) => setCaliber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Vælg kaliber</option>
              {SKV_CALIBERS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Serienummer <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Beskrivelse
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sidst gennemgået
            </label>
            <input
              type="date"
              value={lastReviewedDate}
              onChange={(e) => setLastReviewedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
            >
              Annuller
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Gem
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal for merging two member records
interface MergeModalProps {
  member1: Member;
  member2: Member;
  onClose: () => void;
  onMerged: () => void;
}

function MergeModal({ member1, member2, onClose, onMerged }: MergeModalProps) {
  const [keepMemberId, setKeepMemberId] = useState<string>(member1.internalId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);

  const keepMember = keepMemberId === member1.internalId ? member1 : member2;
  const mergeMember = keepMemberId === member1.internalId ? member2 : member1;

  // Preview merge
  const preview = useMemo(() => {
    return previewMerge(keepMemberId, keepMemberId === member1.internalId ? member2.internalId : member1.internalId);
  }, [keepMemberId, member1.internalId, member2.internalId]);

  function handleMerge() {
    setIsLoading(true);
    setError(null);

    try {
      const mergeResult = mergeMembers(keepMember.internalId, mergeMember.internalId);
      if (mergeResult.success) {
        setResult(mergeResult);
      } else {
        setError(mergeResult.error || 'Ukendt fejl under fletning');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ukendt fejl');
    } finally {
      setIsLoading(false);
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <GitMerge className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Fletning gennemført</h2>
            <p className="text-gray-600 mb-4">
              {keepMember.firstName} {keepMember.lastName} er nu det primære medlem.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-left mb-6">
              <p className="font-medium text-gray-900 mb-2">Overførte poster:</p>
              <ul className="space-y-1 text-gray-600">
                <li>Check-ins: {result.recordsUpdated.checkIns}</li>
                <li>Træningssessioner: {result.recordsUpdated.practiceSessions}</li>
                <li>Scan-events: {result.recordsUpdated.scanEvents}</li>
                <li>Udlån: {result.recordsUpdated.equipmentCheckouts}</li>
              </ul>
            </div>
            <button
              onClick={onMerged}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Luk
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <GitMerge className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Flet medlemmer</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <p className="text-sm text-gray-600">
            Vælg hvilket medlem der skal beholdes. Alle check-ins, træninger og andet fra det andet medlem overføres.
          </p>

          {/* Member Selection */}
          <div className="space-y-3">
            {[member1, member2].map((m) => (
              <button
                key={m.internalId}
                onClick={() => setKeepMemberId(m.internalId)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
                  keepMemberId === m.internalId
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  keepMemberId === m.internalId ? 'bg-blue-200' : 'bg-gray-200'
                }`}>
                  <span className={`font-medium ${keepMemberId === m.internalId ? 'text-blue-700' : 'text-gray-600'}`}>
                    {m.firstName?.[0]}{m.lastName?.[0]}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{m.firstName} {m.lastName}</p>
                  <p className="text-sm text-gray-500">
                    {m.membershipId || m.internalId.slice(0, 8)} • {m.email || m.phone || 'Ingen kontaktinfo'}
                  </p>
                </div>
                {keepMemberId === m.internalId ? (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">Behold</span>
                ) : (
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">Slet</span>
                )}
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 mb-2">Poster der vil blive overført:</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Check-ins:</span>
                <span className="font-medium">{preview.recordCounts.checkIns}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Træninger:</span>
                <span className="font-medium">{preview.recordCounts.practiceSessions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Scan-events:</span>
                <span className="font-medium">{preview.recordCounts.scanEvents}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Udlån:</span>
                <span className="font-medium">{preview.recordCounts.equipmentCheckouts}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isLoading}
            >
              Annuller
            </button>
            <button
              onClick={handleMerge}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <>Fletter...</>
              ) : (
                <>
                  <GitMerge className="w-4 h-4" />
                  Flet medlemmer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal for assigning a membershipId to a trial member
interface AssignMemberIdModalProps {
  member: Member;
  onClose: () => void;
  onAssigned: (membershipId: string) => void;
}

function AssignMemberIdModal({ member, onClose, onAssigned }: AssignMemberIdModalProps) {
  const [membershipId, setMembershipId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedId = membershipId.trim();
    if (!trimmedId) {
      setError('Medlemsnummer er påkrævet');
      return;
    }

    // Check for uniqueness
    const existing = getMemberByMembershipId(trimmedId);
    if (existing && existing.internalId !== member.internalId) {
      setError(`Medlemsnummer "${trimmedId}" er allerede i brug af ${existing.firstName} ${existing.lastName}`);
      return;
    }

    onAssigned(trimmedId);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Tildel medlemsnummer</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-purple-800">
              <span className="font-semibold">Prøvemedlem:</span>{' '}
              {member.firstName} {member.lastName}
            </p>
            <p className="text-xs text-purple-600 mt-1">
              Registreret: {new Date(member.createdAtUtc).toLocaleDateString('da-DK')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medlemsnummer <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={membershipId}
              onChange={(e) => {
                setMembershipId(e.target.value);
                setError(null);
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                error ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Indtast medlemsnummer"
              autoFocus
            />
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Dette vil opgradere medlemmet fra prøvemedlem til fuldt medlem.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Annuller
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Tildel nummer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddMemberModalProps {
  onClose: () => void;
  onSave: (member: Member) => void;
}

function AddMemberModal({ onClose, onSave }: AddMemberModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [membershipId, setMembershipId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [address, setAddress] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [city, setCity] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [feeCategory, setFeeCategory] = useState<Member['memberType']>('ADULT');

  // Calculate if member is under 18
  const isUnder18 = birthday ? calculateAge(birthday) < 18 : false;

  useEffect(() => {
    // Don't auto-change honorary members
    if (feeCategory === 'HONORARY') return;

    if (isUnder18 && feeCategory === 'ADULT') {
      setFeeCategory('CHILD');
    }
    if (!isUnder18 && (feeCategory === 'CHILD' || feeCategory === 'CHILD_PLUS')) {
      setFeeCategory('ADULT');
    }
  }, [isUnder18, feeCategory]);

  // Handle photo file selection
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPath(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function removePhoto() {
    setPhotoPath(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim() || !membershipId.trim()) {
      return;
    }

    const now = new Date().toISOString();
    // Honorary members keep their status; otherwise apply age-based logic
    const effectiveFeeCategory: Member['memberType'] = feeCategory === 'HONORARY' ? 'HONORARY' : (isUnder18 ? feeCategory : 'ADULT');
    const newMember: Member = {
      internalId: crypto.randomUUID(),
      membershipId: membershipId.trim(),
      memberLifecycleStage: 'FULL', // Has membershipId, so FULL
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthday || null,
      gender: gender || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      zipCode: zipCode.trim() || null,
      city: city.trim() || null,
      guardianName: isUnder18 ? guardianName.trim() || null : null,
      guardianPhone: isUnder18 ? guardianPhone.trim() || null : null,
      guardianEmail: isUnder18 ? guardianEmail.trim() || null : null,
      memberType: effectiveFeeCategory,
      status: 'ACTIVE',
      expiresOn: null,
      registrationPhotoPath: null,
      photoPath,
      photoThumbnail: null,
      mergedIntoId: null,
      createdAtUtc: now,
      updatedAtUtc: now,
      syncedAtUtc: null,
      syncVersion: 0,
    };

    onSave(newMember);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Tilføj nyt medlem</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Photo Upload */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
                {photoPath ? (
                  <img
                    src={photoPath}
                    alt="Medlemsfoto"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-gray-400" />
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors shadow-md">
                <Camera className="w-4 h-4 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
              {photoPath && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-0 right-0 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                >
                  <Trash2 className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fornavn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Efternavn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medlemsnummer <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={membershipId}
              onChange={(e) => setMembershipId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefon
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fødselsdag
            </label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kontingenttype
            </label>
            <select
              value={feeCategory}
              onChange={(e) => setFeeCategory(e.target.value as Member['memberType'])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="ADULT">Voksen</option>
              <option value="CHILD" disabled={!isUnder18}>Barn</option>
              <option value="CHILD_PLUS" disabled={!isUnder18}>Barn+</option>
              <option value="HONORARY">Æresmedlem</option>
            </select>
            {!isUnder18 && feeCategory !== 'HONORARY' && (
              <p className="mt-1 text-xs text-gray-500">Kun børn under 18 kan være Barn eller Barn+</p>
            )}
            {feeCategory === 'HONORARY' && (
              <p className="mt-1 text-xs text-amber-600">Æresmedlemmer betaler ikke kontingent</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Køn
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Vælg køn</option>
              <option value="MALE">Mand</option>
              <option value="FEMALE">Kvinde</option>
              <option value="OTHER">Andet</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Postnummer
              </label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                By
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Guardian section for under-18 members */}
          {isUnder18 && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Forælder/værge (medlem under 18)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Navn på forælder/værge
                  </label>
                  <input
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefon (forælder/værge)
                  </label>
                  <input
                    type="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email (forælder/værge)
                  </label>
                  <input
                    type="email"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Annuller
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Tilføj medlem
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditMemberModalProps {
  member: Member;
  onClose: () => void;
  onSave: (member: Member) => void;
}

function EditMemberModal({ member, onClose, onSave }: EditMemberModalProps) {
  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
  const [email, setEmail] = useState(member.email || '');
  const [phone, setPhone] = useState(member.phone || '');
  const [birthday, setBirthday] = useState(member.birthDate || '');
  const [gender, setGender] = useState<Gender | ''>(member.gender || '');
  const [address, setAddress] = useState(member.address || '');
  const [zipCode, setZipCode] = useState(member.zipCode || '');
  const [city, setCity] = useState(member.city || '');
  const [guardianName, setGuardianName] = useState(member.guardianName || '');
  const [guardianPhone, setGuardianPhone] = useState(member.guardianPhone || '');
  const [guardianEmail, setGuardianEmail] = useState(member.guardianEmail || '');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(member.status);
  const [photoPath, setPhotoPath] = useState<string | null>(member.photoPath || null);
  const [feeCategory, setFeeCategory] = useState<Member['memberType']>(() => {
    // Honorary members keep their status
    if (member.memberType === 'HONORARY') return 'HONORARY';

    const isUnder18Initial = member.birthDate ? calculateAge(member.birthDate) < 18 : false;
    if (!isUnder18Initial) return 'ADULT';
    if (member.memberType === 'CHILD_PLUS' || member.memberType === 'CHILD') {
      return member.memberType;
    }
    return 'CHILD';
  });

  // Handle photo file selection
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPath(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function removePhoto() {
    setPhotoPath(null);
  }

  // Calculate if member is under 18
  const isUnder18 = birthday ? calculateAge(birthday) < 18 : false;

  useEffect(() => {
    // Don't auto-change honorary members
    if (feeCategory === 'HONORARY') return;

    if (isUnder18 && feeCategory === 'ADULT') {
      setFeeCategory('CHILD');
    }
    if (!isUnder18 && (feeCategory === 'CHILD' || feeCategory === 'CHILD_PLUS')) {
      setFeeCategory('ADULT');
    }
  }, [isUnder18, feeCategory]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      return;
    }

    // Honorary members keep their status; otherwise apply age-based logic
    const effectiveFeeCategory: Member['memberType'] = feeCategory === 'HONORARY' ? 'HONORARY' : (isUnder18 ? feeCategory : 'ADULT');
    const updatedMember: Member = {
      ...member,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthday || null,
      gender: gender || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      zipCode: zipCode.trim() || null,
      city: city.trim() || null,
      guardianName: isUnder18 ? guardianName.trim() || null : null,
      guardianPhone: isUnder18 ? guardianPhone.trim() || null : null,
      guardianEmail: isUnder18 ? guardianEmail.trim() || null : null,
      memberType: effectiveFeeCategory,
      status,
      photoPath,
      updatedAtUtc: new Date().toISOString(),
    };

    onSave(updatedMember);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Rediger medlem</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Photo Upload */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
                {photoPath ? (
                  <img
                    src={photoPath.startsWith('data:') || photoPath.startsWith('http') ? photoPath : `file://${photoPath}`}
                    alt="Medlemsfoto"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-gray-400" />
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors shadow-md">
                <Camera className="w-4 h-4 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
              {photoPath && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-0 right-0 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                >
                  <Trash2 className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fornavn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Efternavn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medlemsnummer
            </label>
            <input
              type="text"
              value={member.membershipId || ''}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
            />
            {member.memberLifecycleStage === 'TRIAL' && (
              <p className="mt-1 text-xs text-amber-600">Prøvemedlem - medlemsnummer ikke tildelt endnu</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="ACTIVE">Aktiv</option>
              <option value="INACTIVE">Inaktiv</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefon
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fødselsdag
            </label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Køn
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Vælg køn</option>
              <option value="MALE">Mand</option>
              <option value="FEMALE">Kvinde</option>
              <option value="OTHER">Andet</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Postnummer
              </label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                By
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Guardian section for under-18 members */}
          {isUnder18 && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Forælder/værge (medlem under 18)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Navn på forælder/værge
                  </label>
                  <input
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefon (forælder/værge)
                  </label>
                  <input
                    type="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email (forælder/værge)
                  </label>
                  <input
                    type="email"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kontingenttype
            </label>
            <select
              value={feeCategory}
              onChange={(e) => setFeeCategory(e.target.value as Member['memberType'])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="ADULT">Voksen</option>
              <option value="CHILD" disabled={!isUnder18}>Barn</option>
              <option value="CHILD_PLUS" disabled={!isUnder18}>Barn+</option>
              <option value="HONORARY">Æresmedlem</option>
            </select>
            {!isUnder18 && feeCategory !== 'HONORARY' && (
              <p className="mt-1 text-xs text-gray-500">Kun børn under 18 kan være Barn eller Barn+</p>
            )}
            {feeCategory === 'HONORARY' && (
              <p className="mt-1 text-xs text-amber-600">Æresmedlemmer betaler ikke kontingent</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Annuller
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Gem ændringer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
