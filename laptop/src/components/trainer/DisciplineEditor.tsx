/**
 * Component for adding/editing trainer discipline qualifications.
 *
 * @see [trainer-experience/prd.md] - Trainer Experience Feature
 */

import { useState } from 'react';
import { Save, X, Trash2 } from 'lucide-react';
import {
  addTrainerDiscipline,
  updateTrainerDiscipline,
  removeTrainerDiscipline,
  type TrainerDiscipline,
  type PracticeType,
  type TrainerLevel,
} from '../../database/trainerRepository';

interface DisciplineEditorProps {
  memberId: string;
  discipline?: TrainerDiscipline;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const DISCIPLINE_OPTIONS: { value: PracticeType; label: string }[] = [
  { value: 'Riffel', label: 'Riffel' },
  { value: 'Pistol', label: 'Pistol' },
  { value: 'LuftRiffel', label: 'Luft Riffel' },
  { value: 'LuftPistol', label: 'Luft Pistol' },
  { value: 'Andet', label: 'Andet' },
];

const LEVEL_OPTIONS: { value: TrainerLevel; label: string }[] = [
  { value: 'FULL', label: 'Fuld træner' },
  { value: 'ASSISTANT', label: 'Hjælpetræner' },
];

export function DisciplineEditor({
  memberId,
  discipline,
  onSave,
  onCancel,
  onDelete,
}: DisciplineEditorProps) {
  const [selectedDiscipline, setSelectedDiscipline] = useState<PracticeType>(
    discipline?.discipline || 'Riffel'
  );
  const [selectedLevel, setSelectedLevel] = useState<TrainerLevel>(
    discipline?.level || 'FULL'
  );
  const [certifiedDate, setCertifiedDate] = useState(
    discipline?.certifiedDate || new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEditing = !!discipline;

  function handleSave() {
    setIsSubmitting(true);
    try {
      if (isEditing && discipline) {
        updateTrainerDiscipline(discipline.id, {
          level: selectedLevel,
          certifiedDate: certifiedDate || null,
        });
      } else {
        addTrainerDiscipline(memberId, selectedDiscipline, selectedLevel, certifiedDate || undefined);
      }
      onSave();
    } catch (error) {
      console.error('Failed to save discipline:', error);
      alert('Kunne ikke gemme disciplin. Prøv igen.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDelete() {
    if (!discipline) return;
    setIsSubmitting(true);
    try {
      removeTrainerDiscipline(discipline.id);
      onDelete?.();
    } catch (error) {
      console.error('Failed to delete discipline:', error);
      alert('Kunne ikke slette disciplin. Prøv igen.');
    } finally {
      setIsSubmitting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="space-y-4">
        {/* Discipline Select */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Disciplin</label>
          <select
            value={selectedDiscipline}
            onChange={(e) => setSelectedDiscipline(e.target.value as PracticeType)}
            disabled={isEditing}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
              isEditing ? 'bg-gray-100 cursor-not-allowed' : ''
            }`}
          >
            {DISCIPLINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isEditing && (
            <p className="text-xs text-gray-500 mt-1">
              Disciplin kan ikke ændres. Slet og tilføj en ny hvis nødvendigt.
            </p>
          )}
        </div>

        {/* Level Select */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Niveau</label>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value as TrainerLevel)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            {LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Certification Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Certificeringsdato
          </label>
          <input
            type="date"
            value={certifiedDate}
            onChange={(e) => setCertifiedDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isEditing ? 'Gem ændringer' : 'Tilføj disciplin'}
          </button>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
          {isEditing && onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSubmitting}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Slet disciplin?</h3>
            <p className="text-gray-600 mb-4">
              Er du sikker på, at du vil slette denne disciplin kvalifikation?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuller
              </button>
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Slet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
