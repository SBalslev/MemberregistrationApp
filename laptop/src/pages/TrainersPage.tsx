/**
 * Trainers page - manage trainer designations and certifications.
 *
 * @see [trainer-experience/prd.md] - Trainer Experience Feature
 */

import { useState, useMemo } from 'react';
import { Search, Plus, ChevronRight, User, X, GraduationCap, Shield } from 'lucide-react';
import {
  getAllTrainers,
  searchMembersForTrainerAssignment,
  setTrainerStatus,
  type TrainerWithMember,
} from '../database/trainerRepository';
import { TrainerDetailPanel } from '../components/trainer/TrainerDetailPanel';

export function TrainersPage() {
  const [trainers, setTrainers] = useState<TrainerWithMember[]>(() => getAllTrainers());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  function loadTrainers() {
    const allTrainers = getAllTrainers();
    setTrainers(allTrainers);
  }

  const filteredTrainers = useMemo(() => {
    if (!searchQuery.trim()) {
      return trainers;
    }
    const query = searchQuery.toLowerCase();
    return trainers.filter(
      (t) =>
        t.firstName.toLowerCase().includes(query) ||
        t.lastName.toLowerCase().includes(query) ||
        t.membershipId?.toLowerCase().includes(query)
    );
  }, [trainers, searchQuery]);

  const selectedTrainer = useMemo(() => {
    if (!selectedTrainerId) return null;
    return trainers.find((t) => t.memberId === selectedTrainerId) || null;
  }, [trainers, selectedTrainerId]);

  function handleTrainerAdded(memberId: string) {
    setTrainerStatus(memberId, true);
    loadTrainers();
    setSelectedTrainerId(memberId);
    setShowAddModal(false);
  }

  function handleTrainerUpdated() {
    loadTrainers();
  }

  return (
    <div className="flex h-full">
      {/* Trainer List */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Traenere</h1>
              <p className="text-gray-600 mt-1">{filteredTrainers.length} traenere</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Tilfoej traener
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Soeg efter navn eller medlemsnummer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Trainer List Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredTrainers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <GraduationCap className="w-12 h-12 mb-4 text-gray-300" />
              <p>Ingen traenere fundet</p>
              {searchQuery && (
                <p className="text-sm mt-1">Proev at aendre din soegning</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredTrainers.map((trainer) => (
                <li key={trainer.memberId}>
                  <button
                    onClick={() => setSelectedTrainerId(trainer.memberId)}
                    className={`w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left ${
                      selectedTrainerId === trainer.memberId ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-medium text-sm">
                        {trainer.firstName?.[0]}
                        {trainer.lastName?.[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {trainer.firstName} {trainer.lastName}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {trainer.membershipId || 'Ingen medlemsnummer'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {trainer.hasSkydelederCertificate && (
                        <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          <Shield className="w-3.5 h-3.5" />
                          Skydeleder
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Trainer Detail Panel */}
      <div className="w-96 bg-gray-50 overflow-y-auto">
        {selectedTrainer ? (
          <TrainerDetailPanel
            memberId={selectedTrainer.memberId}
            onTrainerUpdated={handleTrainerUpdated}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <GraduationCap className="w-16 h-16 mb-4 text-gray-300" />
            <p>Vaelg en traener for at se detaljer</p>
          </div>
        )}
      </div>

      {/* Add Trainer Modal */}
      {showAddModal && (
        <AddTrainerModal
          onClose={() => setShowAddModal(false)}
          onTrainerAdded={handleTrainerAdded}
          existingTrainerIds={trainers.map((t) => t.memberId)}
        />
      )}
    </div>
  );
}

interface AddTrainerModalProps {
  onClose: () => void;
  onTrainerAdded: (memberId: string) => void;
  existingTrainerIds: string[];
}

function AddTrainerModal({ onClose, onTrainerAdded, existingTrainerIds }: AddTrainerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TrainerWithMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  function handleSearch(query: string) {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = searchMembersForTrainerAssignment(query);
      // Filter out members who are already trainers
      const filteredResults = results.filter(
        (r) => !existingTrainerIds.includes(r.memberId) && !r.isTrainer
      );
      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Tilfoej traener</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Soeg efter medlem..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Soeg efter navn eller medlemsnummer for at tilfoeje en traener
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : searchQuery.trim().length < 2 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <User className="w-10 h-10 mb-3 text-gray-300" />
              <p className="text-sm">Indtast mindst 2 tegn for at soege</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <User className="w-10 h-10 mb-3 text-gray-300" />
              <p className="text-sm">Ingen medlemmer fundet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {searchResults.map((member) => (
                <li key={member.memberId}>
                  <button
                    onClick={() => onTrainerAdded(member.memberId)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 font-medium text-sm">
                        {member.firstName?.[0]}
                        {member.lastName?.[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {member.membershipId || 'Ingen medlemsnummer'}
                      </p>
                    </div>
                    <Plus className="w-5 h-5 text-blue-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Annuller
          </button>
        </div>
      </div>
    </div>
  );
}
