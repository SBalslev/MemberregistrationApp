/**
 * Sync conflicts resolution page.
 * Lists conflicts and allows resolution.
 * 
 * @see [design.md FR-19] - Equipment Conflict Resolution UI
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, Check, Clock, ChevronRight } from 'lucide-react';
import { query, execute } from '../database';
import type { SyncConflict } from '../types/entities';

interface ConflictWithDetails extends SyncConflict {
  equipmentName?: string;
  memberName1?: string;
  memberName2?: string;
}

export function ConflictsPage() {
  const [conflicts, setConflicts] = useState<ConflictWithDetails[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<ConflictWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    loadConflicts();
  }, []);

  async function loadConflicts() {
    try {
      const rawConflicts = query<SyncConflict>(
        "SELECT * FROM SyncConflict WHERE resolvedAtUtc IS NULL ORDER BY detectedAtUtc DESC"
      );

      // Enrich with names (simplified - in real app would join or lookup)
      const enriched: ConflictWithDetails[] = rawConflicts.map(c => ({
        ...c,
        equipmentName: c.entityType === 'EquipmentCheckout' ? `Udstyr #${c.entityId}` : undefined
      }));

      setConflicts(enriched);
    } catch (error) {
      console.error('Failed to load conflicts:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function resolveConflict(conflict: ConflictWithDetails, winner: 'local' | 'remote') {
    setIsResolving(true);
    try {
      const now = new Date().toISOString();
      
      execute(
        `UPDATE SyncConflict SET 
          resolvedAtUtc = ?, 
          resolutionStrategy = ?,
          resolvedBy = ?
        WHERE id = ?`,
        [now, winner === 'local' ? 'KEEP_LOCAL' : 'KEEP_REMOTE', 'user', conflict.id]
      );

      // Remove from list
      setConflicts(prev => prev.filter(c => c.id !== conflict.id));
      setSelectedConflict(null);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    } finally {
      setIsResolving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-white">
          <h1 className="text-2xl font-bold text-gray-900">Konflikter</h1>
          <p className="text-gray-600 mt-1">Løs synkroniseringskonflikter</p>

          {conflicts.length > 0 && (
            <div className="mt-4 p-4 bg-amber-50 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
              <div>
                <div className="font-medium text-amber-800">
                  {conflicts.length} {conflicts.length === 1 ? 'konflikt' : 'konflikter'} kræver handling
                </div>
                <div className="text-sm text-amber-600">
                  Vælg en konflikt for at se detaljer og løse den
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Conflict list */}
        <div className="flex-1 overflow-y-auto p-4">
          {conflicts.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-gray-900 font-medium mb-1">Ingen konflikter</p>
              <p className="text-gray-500">Alle data er synkroniseret korrekt</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conflicts.map(conflict => (
                <button
                  key={conflict.id}
                  onClick={() => setSelectedConflict(conflict)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedConflict?.id === conflict.id
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {conflict.entityType} konflikt
                        </div>
                        <div className="text-sm text-gray-500">
                          {conflict.equipmentName || `ID: ${conflict.entityId}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">
                        {new Date(conflict.detectedAtUtc).toLocaleString('da-DK')}
                      </span>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedConflict && (
        <div className="w-[500px] border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-amber-100 rounded-xl">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Konflikt detaljer</h2>
                <p className="text-gray-500">{selectedConflict.entityType}</p>
              </div>
            </div>

            {/* Conflict comparison */}
            <div className="space-y-4">
              {/* Local version */}
              <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 bg-blue-500 rounded-full" />
                  <span className="font-medium text-blue-800">Lokal version</span>
                  <span className="text-sm text-blue-600 ml-auto">
                    {selectedConflict.localDeviceId}
                  </span>
                </div>
                <div className="bg-white rounded p-3 text-sm font-mono overflow-x-auto">
                  <div className="text-gray-600">
                    Version: {selectedConflict.localSyncVersion}
                  </div>
                </div>
                <div className="mt-2 text-sm text-blue-600 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(selectedConflict.localTimestamp).toLocaleString('da-DK')}
                </div>
              </div>

              {/* Remote version */}
              <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 bg-purple-500 rounded-full" />
                  <span className="font-medium text-purple-800">Ekstern version</span>
                  <span className="text-sm text-purple-600 ml-auto">
                    {selectedConflict.remoteDeviceId}
                  </span>
                </div>
                <div className="bg-white rounded p-3 text-sm font-mono overflow-x-auto">
                  <div className="text-gray-600">
                    Version: {selectedConflict.remoteSyncVersion}
                  </div>
                </div>
                <div className="mt-2 text-sm text-purple-600 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(selectedConflict.remoteTimestamp).toLocaleString('da-DK')}
                </div>
              </div>

              {/* Resolution actions */}
              <div className="pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-3">Vælg hvilken version der skal beholdes:</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => resolveConflict(selectedConflict, 'local')}
                    disabled={isResolving}
                    className="py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    Behold lokal
                  </button>
                  <button
                    onClick={() => resolveConflict(selectedConflict, 'remote')}
                    disabled={isResolving}
                    className="py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    Behold ekstern
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
