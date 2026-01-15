/**
 * Registrations page - approve/reject new member registrations.
 */

import { useEffect, useState } from 'react';
import {
  UserPlus,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  Laptop,
  User,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { getPendingRegistrations, getRegistrationsByStatus } from '../database';
import type { NewMemberRegistration, ApprovalStatus, Gender } from '../types';
import { useAppStore } from '../store';

type TabType = 'pending' | 'rejected';

export function RegistrationsPage() {
  const [registrations, setRegistrations] = useState<NewMemberRegistration[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const { selectedRegistration, setSelectedRegistration, setPendingRegistrationCount } = useAppStore();

  useEffect(() => {
    loadRegistrations();
  }, [activeTab]);

  // Update pending count in store when pending registrations load
  useEffect(() => {
    const pendingRegs = getPendingRegistrations();
    setPendingRegistrationCount(pendingRegs.length);
  }, [registrations, setPendingRegistrationCount]);

  function loadRegistrations() {
    let regs: NewMemberRegistration[];
    switch (activeTab) {
      case 'pending':
        regs = getPendingRegistrations();
        break;
      case 'rejected':
        regs = getRegistrationsByStatus('REJECTED');
        break;
      default:
        regs = [];
    }
    setRegistrations(regs);
  }

  const tabs: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pending', label: 'Afventende', icon: Clock },
    { id: 'rejected', label: 'Afviste', icon: XCircle },
  ];

  return (
    <div className="flex h-full">
      {/* Registration List */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Tilmeldinger</h1>

          {/* Tabs */}
          <div className="flex gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Registration List */}
        <div className="flex-1 overflow-y-auto">
          {registrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <UserPlus className="w-12 h-12 mb-4 text-gray-300" />
              <p>
                {activeTab === 'pending'
                  ? 'Ingen afventende tilmeldinger'
                  : 'Ingen afviste tilmeldinger'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {registrations.map((reg) => (
                <li key={reg.id}>
                  <button
                    onClick={() => setSelectedRegistration(reg)}
                    className={`w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left ${
                      selectedRegistration?.id === reg.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    {/* Photo thumbnail or placeholder */}
                    {reg.photoPath ? (
                      <img
                        src={reg.photoPath.startsWith('data:') || reg.photoPath.startsWith('http') 
                          ? reg.photoPath 
                          : `file://${reg.photoPath}`}
                        alt={`${reg.firstName} ${reg.lastName}`}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        onError={(e) => {
                          // Fallback to placeholder on error
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 ${reg.photoPath ? 'hidden' : ''}`}>
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {reg.firstName} {reg.lastName}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Laptop className="w-3.5 h-3.5" />
                        <span className="truncate">{reg.sourceDeviceName || 'Ukendt enhed'}</span>
                        <span>•</span>
                        <span>{formatDate(reg.createdAtUtc)}</span>
                      </div>
                    </div>
                    <StatusBadge status={reg.approvalStatus} />
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Registration Detail Panel */}
      <div className="w-[420px] bg-gray-50 overflow-y-auto">
        {selectedRegistration ? (
          <RegistrationDetailPanel
            registration={selectedRegistration}
            onRefresh={loadRegistrations}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <UserPlus className="w-16 h-16 mb-4 text-gray-300" />
            <p>Vælg en tilmelding for at se detaljer</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const styles = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
  };

  const labels = {
    PENDING: 'Afventer',
    APPROVED: 'Godkendt',
    REJECTED: 'Afvist',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function RegistrationDetailPanel({
  registration,
  onRefresh,
}: {
  registration: NewMemberRegistration;
  onRefresh: () => void;
}) {
  const [membershipId, setMembershipId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { setSelectedRegistration } = useAppStore();

  const isPending = registration.approvalStatus === 'PENDING';

  // Calculate age from birthday
  const age = registration.birthday ? calculateAge(registration.birthday) : null;
  const isMinor = age !== null && age < 18;

  async function handleApprove() {
    if (!membershipId.trim()) {
      alert('Indtast et medlemsnummer');
      return;
    }

    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const { approveRegistration } = await import('../database');
      approveRegistration(registration.id, membershipId.trim());
      setSelectedRegistration(null);
      onRefresh();
    } catch (error) {
      console.error('Failed to approve registration:', error);
      alert('Kunne ikke godkende tilmelding: ' + (error instanceof Error ? error.message : 'Ukendt fejl'));
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleReject() {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const { rejectRegistration } = await import('../database');
      rejectRegistration(registration.id, rejectionReason || undefined);
      setShowRejectDialog(false);
      setSelectedRegistration(null);
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRestore() {
    try {
      const { restoreRegistration } = await import('../database');
      restoreRegistration(registration.id);
      setSelectedRegistration(null);
      onRefresh();
    } catch (error) {
      console.error('Failed to restore registration:', error);
      alert('Kunne ikke gendanne tilmelding');
    }
  }

  async function handleDelete() {
    if (!confirm('Er du sikker på at du vil slette denne tilmelding permanent?')) {
      return;
    }
    try {
      const { deleteRegistration } = await import('../database');
      deleteRegistration(registration.id);
      setSelectedRegistration(null);
      onRefresh();
    } catch (error) {
      console.error('Failed to delete registration:', error);
      alert('Kunne ikke slette tilmelding');
    }
  }

  return (
    <div className="p-6 overflow-y-auto max-h-full">
      {/* Header with Photo */}
      <div className="text-center mb-6">
        {registration.photoPath ? (
          <img
            src={registration.photoPath.startsWith('data:') || registration.photoPath.startsWith('http')
              ? registration.photoPath
              : `file://${registration.photoPath}`}
            alt={`${registration.firstName} ${registration.lastName}`}
            className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-white shadow-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-24 h-24 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center border-4 border-white shadow-lg">
            <User className="w-12 h-12 text-blue-600" />
          </div>
        )}
        <h2 className="text-xl font-bold text-gray-900">
          {registration.firstName} {registration.lastName}
        </h2>
        <p className="text-gray-600 text-sm mt-1">
          Modtaget {formatDate(registration.createdAtUtc)}
        </p>
        <div className="mt-2">
          <StatusBadge status={registration.approvalStatus} />
        </div>
      </div>

      {/* Personal Details */}
      <div className="space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Personlige oplysninger</h3>
        <DetailRow label="Fødselsdag" value={registration.birthday ? `${registration.birthday}${age !== null ? ` (${age} år)` : ''}` : '-'} />
        <DetailRow label="Køn" value={formatGender(registration.gender)} />
        <DetailRow label="Email" value={registration.email || '-'} />
        <DetailRow label="Telefon" value={registration.phone || '-'} />
      </div>

      {/* Address Details */}
      <div className="space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Adresse</h3>
        <DetailRow label="Adresse" value={registration.address || '-'} />
        <div className="grid grid-cols-2 gap-4">
          <DetailRow label="Postnr." value={registration.zipCode || '-'} />
          <DetailRow label="By" value={registration.city || '-'} />
        </div>
      </div>

      {/* Guardian Info (if minor) */}
      {isMinor && (
        <div className="space-y-4 mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Værge (under 18 år)</h3>
          <DetailRow label="Navn" value={registration.guardianName || '-'} />
          <DetailRow label="Telefon" value={registration.guardianPhone || '-'} />
          <DetailRow label="Email" value={registration.guardianEmail || '-'} />
        </div>
      )}

      {/* Source Device */}
      <div className="space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Kilde</h3>
        <DetailRow
          label="Enhed"
          value={`${registration.sourceDeviceName || 'Ukendt'} (${registration.sourceDeviceId.slice(0, 8)}...)`}
        />
        {registration.notes && <DetailRow label="Noter" value={registration.notes} />}
      </div>

      {/* Rejection Status Info */}
      {registration.approvalStatus === 'REJECTED' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-medium">Afvist</p>
          {registration.rejectionReason && (
            <p className="text-red-700 text-sm mt-1">{registration.rejectionReason}</p>
          )}
          {registration.rejectedAtUtc && (
            <p className="text-red-600 text-sm">{formatDate(registration.rejectedAtUtc)}</p>
          )}
        </div>
      )}

      {/* Actions for rejected */}
      {registration.approvalStatus === 'REJECTED' && (
        <div className="space-y-3">
          <button
            onClick={handleRestore}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer relative z-10"
          >
            <RotateCcw className="w-5 h-5 pointer-events-none" />
            <span className="pointer-events-none">Gendan til afventende</span>
          </button>
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium cursor-pointer relative z-10"
          >
            <Trash2 className="w-5 h-5 pointer-events-none" />
            <span className="pointer-events-none">Slet permanent</span>
          </button>
        </div>
      )}
      {/* Actions (only for pending) */}
      {isPending && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medlemsnummer
            </label>
            <input
              type="text"
              value={membershipId}
              onChange={(e) => setMembershipId(e.target.value)}
              placeholder="F.eks. M001234"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              disabled={isProcessing}
            />
          </div>

          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors font-medium relative z-10 ${
              isProcessing 
                ? 'bg-gray-400 text-white cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700 cursor-pointer'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin pointer-events-none" />
                <span className="pointer-events-none">Behandler...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 pointer-events-none" />
                <span className="pointer-events-none">Godkend og opret medlem</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowRejectDialog(true)}
            disabled={isProcessing}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg transition-colors font-medium relative z-10 ${
              isProcessing
                ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                : 'border-red-300 text-red-700 hover:bg-red-50 cursor-pointer'
            }`}
          >
            <XCircle className="w-5 h-5 pointer-events-none" />
            <span className="pointer-events-none">Afvis tilmelding</span>
          </button>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Afvis tilmelding</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Årsag (valgfri)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Angiv årsag til afvisning..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Annuller
              </button>
              <button
                onClick={handleReject}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Afvis
              </button>
            </div>
          </div>
        </div>
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
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function calculateAge(birthday: string): number | null {
  try {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}

function formatGender(gender: Gender | null): string {
  if (!gender) return '-';
  const labels: Record<Gender, string> = {
    MALE: 'Mand',
    FEMALE: 'Kvinde',
    OTHER: 'Andet',
  };
  return labels[gender] || gender;
}
