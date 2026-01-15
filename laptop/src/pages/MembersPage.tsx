/**
 * Members page - list and manage members.
 */

import { useEffect, useState, useMemo } from 'react';
import { Search, Plus, Filter, ChevronRight, User, X, Camera, Trash2 } from 'lucide-react';
import { getAllMembers, searchMembers, upsertMember } from '../database';
import type { Member, Gender } from '../types';
import { useAppStore } from '../store';

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const { selectedMember, setSelectedMember } = useAppStore();

  useEffect(() => {
    loadMembers();
  }, []);

  function loadMembers() {
    const allMembers = getAllMembers();
    setMembers(allMembers);
  }

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

    return result;
  }, [members, searchQuery, statusFilter]);

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
                {filteredMembers.length} medlemmer
              </p>
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Tilføj medlem
            </button>
          </div>

          {/* Search and Filter */}
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
        </div>

        {/* Member List */}
        <div className="flex-1 overflow-y-auto">
          {filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <User className="w-12 h-12 mb-4 text-gray-300" />
              <p>Ingen medlemmer fundet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredMembers.map((member) => (
                <li key={member.membershipId}>
                  <button
                    onClick={() => setSelectedMember(member)}
                    className={`w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left ${
                      selectedMember?.membershipId === member.membershipId
                        ? 'bg-blue-50'
                        : ''
                    }`}
                  >
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      {member.photoUri ? (
                        <img
                          src={member.photoUri}
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
                      <p className="font-medium text-gray-900 truncate">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {member.membershipId}
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
              ))}
            </ul>
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
  const { setSelectedMember } = useAppStore();

  // Get photo source - add file:// protocol for local paths
  const photoSrc = member.photoUri 
    ? (member.photoUri.startsWith('file://') || member.photoUri.startsWith('http') 
        ? member.photoUri 
        : `file://${member.photoUri}`)
    : null;

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
        <p className="text-gray-600">{member.membershipId}</p>
        <span
          className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${
            member.status === 'ACTIVE'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {member.status === 'ACTIVE' ? 'Aktiv' : 'Inaktiv'}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-4">
        <DetailRow label="Fødselsdag" value={member.birthday ? `${member.birthday} (${calculateAge(member.birthday)} år)` : '-'} />
        <DetailRow label="Køn" value={formatGender(member.gender)} />
        <DetailRow label="Email" value={member.email || '-'} />
        <DetailRow label="Telefon" value={member.phone || '-'} />
        <DetailRow label="Adresse" value={member.address || '-'} />
        <DetailRow label="Postnummer/By" value={member.zipCode && member.city ? `${member.zipCode} ${member.city}` : member.zipCode || member.city || '-'} />
        <DetailRow label="Oprettet" value={formatDate(member.createdAtUtc)} />
        <DetailRow label="Opdateret" value={formatDate(member.updatedAtUtc)} />
      </div>

      {/* Guardian info if under 18 */}
      {member.birthday && calculateAge(member.birthday) < 18 && (member.guardianName || member.guardianPhone || member.guardianEmail) && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Forælder/værge</h3>
          <div className="space-y-4">
            {member.guardianName && <DetailRow label="Navn" value={member.guardianName} />}
            {member.guardianPhone && <DetailRow label="Telefon" value={member.guardianPhone} />}
            {member.guardianEmail && <DetailRow label="Email" value={member.guardianEmail} />}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 space-y-3">
        <button 
          onClick={() => setShowEditModal(true)}
          className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Rediger medlem
        </button>
        <button 
          onClick={() => alert('Aktivitetslog kommer snart!')}
          className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
        >
          Se aktivitet
        </button>
      </div>

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
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Calculate if member is under 18
  const isUnder18 = birthday ? calculateAge(birthday) < 18 : false;

  // Handle photo file selection
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUri(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function removePhoto() {
    setPhotoUri(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim() || !membershipId.trim()) {
      return;
    }

    const now = new Date().toISOString();
    const newMember: Member = {
      membershipId: membershipId.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthday: birthday || null,
      gender: gender || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      zipCode: zipCode.trim() || null,
      city: city.trim() || null,
      guardianName: isUnder18 ? guardianName.trim() || null : null,
      guardianPhone: isUnder18 ? guardianPhone.trim() || null : null,
      guardianEmail: isUnder18 ? guardianEmail.trim() || null : null,
      status: 'ACTIVE',
      photoUri,
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
                {photoUri ? (
                  <img
                    src={photoUri}
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
              {photoUri && (
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
  const [birthday, setBirthday] = useState(member.birthday || '');
  const [gender, setGender] = useState<Gender | ''>(member.gender || '');
  const [address, setAddress] = useState(member.address || '');
  const [zipCode, setZipCode] = useState(member.zipCode || '');
  const [city, setCity] = useState(member.city || '');
  const [guardianName, setGuardianName] = useState(member.guardianName || '');
  const [guardianPhone, setGuardianPhone] = useState(member.guardianPhone || '');
  const [guardianEmail, setGuardianEmail] = useState(member.guardianEmail || '');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(member.status);
  const [photoUri, setPhotoUri] = useState<string | null>(member.photoUri || null);

  // Handle photo file selection
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUri(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function removePhoto() {
    setPhotoUri(null);
  }

  // Calculate if member is under 18
  const isUnder18 = birthday ? calculateAge(birthday) < 18 : false;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim()) {
      return;
    }

    const updatedMember: Member = {
      ...member,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthday: birthday || null,
      gender: gender || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      zipCode: zipCode.trim() || null,
      city: city.trim() || null,
      guardianName: isUnder18 ? guardianName.trim() || null : null,
      guardianPhone: isUnder18 ? guardianPhone.trim() || null : null,
      guardianEmail: isUnder18 ? guardianEmail.trim() || null : null,
      status,
      photoUri,
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
                {photoUri ? (
                  <img
                    src={photoUri.startsWith('data:') || photoUri.startsWith('http') ? photoUri : `file://${photoUri}`}
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
              {photoUri && (
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
              value={member.membershipId}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
            />
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
