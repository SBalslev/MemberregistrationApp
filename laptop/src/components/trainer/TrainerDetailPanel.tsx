/**
 * Detail panel for viewing and editing trainer information.
 *
 * @see [trainer-experience/prd.md] - Trainer Experience Feature
 */

import { useState } from 'react';
import { GraduationCap, Shield, Plus, Calendar, Award } from 'lucide-react';
import {
  getTrainerDetails,
  setTrainerStatus,
  setSkydelederCertification,
  getDisciplinesForTrainer,
  type TrainerDiscipline,
  type PracticeType,
  type TrainerLevel,
} from '../../database/trainerRepository';
import { DisciplineEditor } from './DisciplineEditor';

interface TrainerDetailPanelProps {
  memberId: string;
  onTrainerUpdated: () => void;
}

export function TrainerDetailPanel({ memberId, onTrainerUpdated }: TrainerDetailPanelProps) {
  const [trainerData, setTrainerData] = useState<ReturnType<typeof getTrainerDetails>>(
    () => getTrainerDetails(memberId)
  );
  const [disciplines, setDisciplines] = useState<TrainerDiscipline[]>(
    () => getDisciplinesForTrainer(memberId)
  );
  const [isTrainer, setIsTrainer] = useState(() => trainerData.trainerInfo?.isTrainer ?? false);
  const [hasSkydeleder, setHasSkydeleder] = useState(() => trainerData.trainerInfo?.hasSkydelederCertificate ?? false);
  const [skydelederDate, setSkydelederDate] = useState(() => trainerData.trainerInfo?.certifiedDate ?? '');
  const [showAddDiscipline, setShowAddDiscipline] = useState(false);
  const [editingDisciplineId, setEditingDisciplineId] = useState<string | null>(null);

  function refreshTrainerData() {
    const data = getTrainerDetails(memberId);
    setTrainerData(data);
    setDisciplines(getDisciplinesForTrainer(memberId));
    if (data.trainerInfo) {
      setIsTrainer(data.trainerInfo.isTrainer);
      setHasSkydeleder(data.trainerInfo.hasSkydelederCertificate);
      setSkydelederDate(data.trainerInfo.certifiedDate || '');
    } else {
      setIsTrainer(false);
      setHasSkydeleder(false);
      setSkydelederDate('');
    }
  }

  function handleTrainerToggle(enabled: boolean) {
    setTrainerStatus(memberId, enabled);
    setIsTrainer(enabled);
    onTrainerUpdated();
  }

  function handleSkydelederToggle(enabled: boolean) {
    const date = enabled ? (skydelederDate || new Date().toISOString().split('T')[0]) : undefined;
    setSkydelederCertification(memberId, enabled, date);
    setHasSkydeleder(enabled);
    refreshTrainerData();
    if (enabled && !skydelederDate) {
      setSkydelederDate(new Date().toISOString().split('T')[0]);
    }
    onTrainerUpdated();
  }

  function handleSkydelederDateChange(date: string) {
    setSkydelederDate(date);
    if (hasSkydeleder) {
      setSkydelederCertification(memberId, true, date);
    refreshTrainerData();
      onTrainerUpdated();
    }
  }

  function handleDisciplineUpdated() {
    setDisciplines(getDisciplinesForTrainer(memberId));
    setShowAddDiscipline(false);
      refreshTrainerData();
    setEditingDisciplineId(null);
    onTrainerUpdated();
  }

  if (!trainerData || !trainerData.member) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    refreshTrainerData();
      </div>
    );
  }

  const { member } = trainerData;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
          <GraduationCap className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {member.firstName} {member.lastName}
        </h2>
        <p className="text-gray-600">{member.membershipId || 'Ingen medlemsnummer'}</p>
      </div>

      {/* Trainer Status Toggle */}
      <div className="space-y-4">
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Træner</p>
                <p className="text-sm text-gray-500">Marker som træner</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isTrainer}
                onChange={(e) => handleTrainerToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Skydeleder Certificate */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Skydeleder certifikat</p>
                <p className="text-sm text-gray-500">Skydeleder certificering</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={hasSkydeleder}
                onChange={(e) => handleSkydelederToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {hasSkydeleder && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="block text-sm text-gray-600 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Certificeringsdato
              </label>
              <input
                type="date"
                value={skydelederDate}
                onChange={(e) => handleSkydelederDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
              />
            </div>
          )}
        </div>

        {/* Discipline Qualifications */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Award className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Træning</p>
                <p className="text-sm text-gray-500">{disciplines.length} discipliner</p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowAddDiscipline(true);
                setEditingDisciplineId(null);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tilføj
            </button>
          </div>

          {disciplines.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              Ingen træning tilføjet
            </p>
          ) : (
            <ul className="space-y-2">
              {disciplines.map((discipline) => (
                <li key={discipline.id}>
                  {editingDisciplineId === discipline.id ? (
                    <DisciplineEditor
                      memberId={memberId}
                      discipline={discipline}
                      onSave={handleDisciplineUpdated}
                      onCancel={() => setEditingDisciplineId(null)}
                      onDelete={handleDisciplineUpdated}
                    />
                  ) : (
                    <button
                      onClick={() => setEditingDisciplineId(discipline.id)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {formatDisciplineName(discipline.discipline)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatLevel(discipline.level)}
                          {discipline.certifiedDate && ` - ${formatDate(discipline.certifiedDate)}`}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          discipline.level === 'FULL'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {formatLevel(discipline.level)}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add Discipline Form */}
          {showAddDiscipline && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <DisciplineEditor
                memberId={memberId}
                onSave={handleDisciplineUpdated}
                onCancel={() => setShowAddDiscipline(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDisciplineName(discipline: PracticeType): string {
  switch (discipline) {
    case 'Riffel':
      return 'Riffel';
    case 'Pistol':
      return 'Pistol';
    case 'LuftRiffel':
      return 'Luft Riffel';
    case 'LuftPistol':
      return 'Luft Pistol';
    case 'Andet':
      return 'Andet';
    default:
      return discipline;
  }
}

function formatLevel(level: TrainerLevel): string {
  switch (level) {
    case 'FULL':
      return 'Fuld træner';
    case 'ASSISTANT':
      return 'Hjælpetræner';
    default:
      return level;
  }
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
