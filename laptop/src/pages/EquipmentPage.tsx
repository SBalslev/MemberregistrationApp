/**
 * Equipment management page.
 * Lists equipment items and checkout status.
 * 
 * @see [design.md FR-8] - Equipment checkout tracking
 */

import { useState, useEffect, useDeferredValue } from 'react';
import { Package, Search, User, Clock, AlertTriangle, CheckCircle, X, Pencil, Wrench, RotateCcw, Ban, Plus, SlidersHorizontal } from 'lucide-react';
import { execute, query } from '../database';
import { queueEquipmentItem } from '../database/syncOutboxRepository';
import type { EquipmentItem, EquipmentCheckout, EquipmentStatus, EquipmentType } from '../types/entities';
import { ConfirmDialog, Skeleton, SkeletonEquipmentRow } from '../components';
import { useAppStore } from '../store/appStore';
import { useDialogKeyboard, useFocusTrap } from '../hooks';

interface EquipmentWithCheckout extends EquipmentItem {
  currentCheckout?: {
    memberName: string;
    checkoutTime: string;
  };
}

interface EquipmentFormValues {
  name: string;
  serialNumber: string;
  type: EquipmentType;
  description: string;
}

interface EquipmentEditValues extends EquipmentFormValues {
  id: string;
}

const equipmentTypeLabels: Record<string, string> = {
  TrainingMaterial: 'Tr\u00e6ningsmateriale',
  TRAINING_MATERIAL: 'Tr\u00e6ningsmateriale',
  PISTOL: 'Pistol',
  AIR_PISTOL: 'Luftpistol',
  AIR_RIFLE: 'Luftriffel',
  RIFLE: 'Riffel',
  LONG_DISTANCE: 'Langdistance',
  OTHER: 'Andet'
};

const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  AVAILABLE: 'Tilgængelig',
  CHECKED_OUT: 'Udlånt',
  MAINTENANCE: 'Til vedligeholdelse',
  RETIRED: 'Pensioneret'
};

const equipmentStatusStyles: Record<EquipmentStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  CHECKED_OUT: 'bg-blue-100 text-blue-700',
  MAINTENANCE: 'bg-amber-100 text-amber-800',
  RETIRED: 'bg-gray-200 text-gray-700'
};

const equipmentTypes = Object.entries(equipmentTypeLabels)
  .filter(([value]) => value === value.toUpperCase()) as [EquipmentType, string][];

type StatusFilter = 'all' | EquipmentStatus;
type CategoryFilter = 'all' | EquipmentType;
type SortOption = 'name' | 'serialNumber' | 'status' | 'modifiedAtUtc';

const statusSortOrder: Record<EquipmentStatus, number> = {
  MAINTENANCE: 0,
  CHECKED_OUT: 1,
  AVAILABLE: 2,
  RETIRED: 3
};

function getEquipmentType(item: EquipmentItem): EquipmentType {
  const type = item.equipmentType ?? item.type;
  return type === 'TrainingMaterial' as EquipmentType ? 'TRAINING_MATERIAL' : type;
}

function getEquipmentTypeLabel(item: EquipmentItem): string {
  const type = getEquipmentType(item);
  return equipmentTypeLabels[type] ?? type;
}

export function EquipmentPage() {
  const [equipment, setEquipment] = useState<EquipmentWithCheckout[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name');
  const [selectedItem, setSelectedItem] = useState<EquipmentWithCheckout | null>(null);
  const [editingItem, setEditingItem] = useState<EquipmentWithCheckout | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [retiringItem, setRetiringItem] = useState<EquipmentWithCheckout | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEquipment();
  }, []);

  async function loadEquipment() {
    try {
      // Get all equipment items
      const items = query<EquipmentItem>('SELECT * FROM EquipmentItem ORDER BY name');
      
      // Get active checkouts (where not yet checked in)
      const checkouts = query<EquipmentCheckout & { memberName: string }>(`
        SELECT ec.*, COALESCE(NULLIF(TRIM(m.firstName || ' ' || m.lastName), ''), 'Ukendt medlem') as memberName
        FROM EquipmentCheckout ec
        LEFT JOIN Member m ON ec.internalMemberId = m.internalId
        WHERE ec.checkedInAtUtc IS NULL
      `);

      // Merge checkout info
      const checkoutMap = new Map(checkouts.map(c => [c.equipmentId, c]));
      const merged: EquipmentWithCheckout[] = items.map(item => ({
        ...item,
        currentCheckout: checkoutMap.has(item.id) ? {
          memberName: checkoutMap.get(item.id)!.memberName,
          checkoutTime: checkoutMap.get(item.id)!.checkedOutAtUtc
        } : undefined
      }));

      setEquipment(merged);
      setSelectedItem(current => current ? merged.find(item => item.id === current.id) ?? null : null);
    } catch (error) {
      console.error('Failed to load equipment:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredEquipment = equipment.filter(item => {
    const normalizedQuery = deferredSearchQuery.trim().toLocaleLowerCase('da-DK');
    const searchableValues = [
      item.name,
      item.serialNumber,
      item.description,
      item.notes,
      getEquipmentTypeLabel(item),
      item.currentCheckout?.memberName
    ];
    const matchesSearch = normalizedQuery === '' || searchableValues.some(value =>
      value?.toLocaleLowerCase('da-DK').includes(normalizedQuery)
    );
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || getEquipmentType(item) === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  }).sort((left, right) => {
    if (sortOption === 'serialNumber') return left.serialNumber.localeCompare(right.serialNumber, 'da-DK', { numeric: true });
    if (sortOption === 'status') return statusSortOrder[left.status] - statusSortOrder[right.status] || left.name.localeCompare(right.name, 'da-DK');
    if (sortOption === 'modifiedAtUtc') return right.modifiedAtUtc.localeCompare(left.modifiedAtUtc);
    return left.name.localeCompare(right.name, 'da-DK');
  });

  const stats = {
    total: equipment.length,
    available: equipment.filter(e => e.status === 'AVAILABLE').length,
    checkedOut: equipment.filter(e => e.status === 'CHECKED_OUT').length,
    needsMaintenance: equipment.filter(e => e.status === 'MAINTENANCE').length,
    retired: equipment.filter(e => e.status === 'RETIRED').length
  };

  const hasActiveFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || categoryFilter !== 'all';

  function clearFilters() {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
  }

  function toSyncableItem(item: EquipmentItem) {
    return {
      id: item.id,
      serialNumber: item.serialNumber,
      type: item.equipmentType ?? item.type,
      description: item.description,
      status: item.status,
      deviceId: item.createdByDeviceId ?? item.deviceId ?? 'laptop-master',
      syncVersion: item.syncVersion,
      createdAtUtc: item.createdAtUtc,
      modifiedAtUtc: item.modifiedAtUtc,
      syncedAtUtc: null
    };
  }

  function queueUpdatedItem(itemId: string) {
    const updated = query<EquipmentItem>('SELECT * FROM EquipmentItem WHERE id = ?', [itemId])[0];
    if (updated) {
      queueEquipmentItem(toSyncableItem(updated), 'UPDATE');
    }
  }

  async function syncEquipmentChange() {
    try {
      await useAppStore.getState().triggerSync();
    } catch (error) {
      console.error('Failed to sync equipment change:', error);
    }
  }

  async function updateStatus(item: EquipmentWithCheckout, status: EquipmentStatus) {
    if (item.currentCheckout) return;

    const now = new Date().toISOString();
    execute(
      `UPDATE EquipmentItem
       SET status = ?, modifiedAtUtc = ?, syncedAtUtc = NULL, syncVersion = syncVersion + 1
       WHERE id = ?`,
      [status, now, item.id]
    );
    queueUpdatedItem(item.id);
    await loadEquipment();
    setMessage(`${item.name} er nu ${equipmentStatusLabels[status].toLowerCase()}.`);
    void syncEquipmentChange();
  }

  async function saveEquipment(values: EquipmentEditValues) {
    const now = new Date().toISOString();
    execute(
      `UPDATE EquipmentItem
       SET name = ?, serialNumber = ?, equipmentType = ?, description = ?,
           modifiedAtUtc = ?, syncedAtUtc = NULL, syncVersion = syncVersion + 1
       WHERE id = ?`,
      [values.name.trim(), values.serialNumber.trim(), values.type, values.description.trim() || null, now, values.id]
    );
    queueUpdatedItem(values.id);
    setEditingItem(null);
    await loadEquipment();
    setMessage('Ændringerne er gemt og klar til synkronisering.');
    void syncEquipmentChange();
  }

  async function createEquipment(values: EquipmentFormValues) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    execute(
      `INSERT INTO EquipmentItem (
         id, serialNumber, name, description, equipmentType, status, discipline, notes,
         createdAtUtc, createdByDeviceId, modifiedAtUtc, syncedAtUtc, syncVersion
       ) VALUES (?, ?, ?, ?, ?, 'AVAILABLE', NULL, NULL, ?, 'laptop-master', ?, NULL, 1)`,
      [id, values.serialNumber.trim(), values.name.trim(), values.description.trim() || null, values.type, now, now]
    );
    const created = query<EquipmentItem>('SELECT * FROM EquipmentItem WHERE id = ?', [id])[0];
    if (created) {
      queueEquipmentItem(toSyncableItem(created), 'INSERT');
    }
    setIsAddingItem(false);
    await loadEquipment();
    setSelectedItem(created ?? null);
    setMessage('Udstyret er oprettet og klar til synkronisering.');
    void syncEquipmentChange();
  }

  if (isLoading) {
    return (
      <div className="h-full flex">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header skeleton */}
          <div className="p-6 border-b border-gray-200 bg-white">
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
            <div className="grid grid-cols-4 gap-4 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <Skeleton className="h-8 w-12 mb-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
          {/* List skeleton */}
          <div className="flex-1 overflow-y-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonEquipmentRow key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main list */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Udstyr</h1>
              <p className="text-gray-600 mt-1">Administrer våben og udstyr</p>
            </div>
            <button
              onClick={() => setIsAddingItem(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              Tilføj udstyr
            </button>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-5">
            <button onClick={() => setStatusFilter('all')} className={`rounded-lg p-3 text-left ${statusFilter === 'all' ? 'bg-gray-200 ring-2 ring-gray-400' : 'bg-gray-50 hover:bg-gray-100'}`}>
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">I alt</div>
            </button>
            <button onClick={() => setStatusFilter('AVAILABLE')} className={`rounded-lg p-3 text-left ${statusFilter === 'AVAILABLE' ? 'bg-green-100 ring-2 ring-green-500' : 'bg-green-50 hover:bg-green-100'}`}>
              <div className="text-2xl font-bold text-green-700">{stats.available}</div>
              <div className="text-sm text-green-600">Tilgængeligt</div>
            </button>
            <button onClick={() => setStatusFilter('CHECKED_OUT')} className={`rounded-lg p-3 text-left ${statusFilter === 'CHECKED_OUT' ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-blue-50 hover:bg-blue-100'}`}>
              <div className="text-2xl font-bold text-blue-700">{stats.checkedOut}</div>
              <div className="text-sm text-blue-600">Udlånt</div>
            </button>
            <button onClick={() => setStatusFilter('MAINTENANCE')} className={`rounded-lg p-3 text-left ${statusFilter === 'MAINTENANCE' ? 'bg-amber-100 ring-2 ring-amber-500' : 'bg-amber-50 hover:bg-amber-100'}`}>
              <div className="text-2xl font-bold text-amber-700">{stats.needsMaintenance}</div>
              <div className="text-sm text-amber-600">Til vedligeholdelse</div>
            </button>
            <button onClick={() => setStatusFilter('RETIRED')} className={`rounded-lg p-3 text-left ${statusFilter === 'RETIRED' ? 'bg-gray-300 ring-2 ring-gray-500' : 'bg-gray-100 hover:bg-gray-200'}`}>
              <div className="text-2xl font-bold text-gray-700">{stats.retired}</div>
              <div className="text-sm text-gray-600">Pensioneret</div>
            </button>
          </div>

          {/* Search and filter */}
          <div className="mt-4 space-y-2" role="search">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="search"
                aria-label="Søg i udstyr"
                placeholder="Søg navn, serienummer, kategori, beskrivelse eller låner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filtrer efter status"
                className="min-w-44 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Status: Alle</option>
                <option value="AVAILABLE">Tilgængeligt ({stats.available})</option>
                <option value="CHECKED_OUT">Udlånt ({stats.checkedOut})</option>
                <option value="MAINTENANCE">Til vedligeholdelse ({stats.needsMaintenance})</option>
                <option value="RETIRED">Pensioneret ({stats.retired})</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                aria-label="Filtrer efter kategori"
                className="min-w-44 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Kategori: Alle</option>
                {equipmentTypes.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                aria-label="Sortér udstyr"
                className="min-w-44 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="name">Sortér: Navn</option>
                <option value="serialNumber">Sortér: Serienummer</option>
                <option value="status">Sortér: Kræver handling</option>
                <option value="modifiedAtUtc">Sortér: Senest ændret</option>
              </select>
              <span className="text-sm text-gray-500">Viser {filteredEquipment.length} af {equipment.length}</span>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="ml-auto text-sm font-medium text-blue-700 hover:text-blue-900">
                  Ryd filtre
                </button>
              )}
            </div>
          </div>
          {message && (
            <div className="mt-3 flex items-center justify-between rounded-md bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
              <span>{message}</span>
              <button onClick={() => setMessage(null)} aria-label="Luk besked" title="Luk besked">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Equipment list */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {filteredEquipment.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Intet udstyr fundet</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="mt-3 text-sm font-medium text-blue-700 hover:text-blue-900">Ryd filtre</button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredEquipment.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  aria-pressed={selectedItem?.id === item.id}
                  className={`w-full rounded-lg border p-4 text-left transition-all ${
                    selectedItem?.id === item.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`shrink-0 rounded-lg p-2 ${equipmentStatusStyles[item.status]}`}>
                        <Package className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{item.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                          <span>{getEquipmentTypeLabel(item)}</span>
                          <span className="font-mono">SN: {item.serialNumber}</span>
                        </div>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm ${equipmentStatusStyles[item.status]}`}>
                        {item.status === 'AVAILABLE' && <CheckCircle className="w-4 h-4" />}
                        {item.status === 'MAINTENANCE' && <Wrench className="w-4 h-4" />}
                        {item.status === 'RETIRED' && <Ban className="w-4 h-4" />}
                        {equipmentStatusLabels[item.status]}
                      </span>
                      {item.currentCheckout && (
                        <div className="mt-2 text-blue-700">
                          <div className="flex items-center justify-end gap-1">
                          <User className="w-4 h-4" />
                          <span className="text-sm">{item.currentCheckout.memberName}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-500">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(item.currentCheckout.checkoutTime).toLocaleString('da-DK')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedItem && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-96 border-l border-gray-200 bg-white overflow-y-auto shadow-xl lg:static lg:w-96 lg:shadow-none">
          <div className="p-6">
            {/* Close button */}
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Luk detaljer"
                aria-label="Luk detaljer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className={`p-3 rounded-lg ${equipmentStatusStyles[selectedItem.status]}`}>
                <Package className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedItem.name}</h2>
                <p className="text-gray-500">{getEquipmentTypeLabel(selectedItem)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Status</div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-sm font-medium ${equipmentStatusStyles[selectedItem.status]}`}>
                    {equipmentStatusLabels[selectedItem.status]}
                  </span>
                </div>
              </div>

              {selectedItem.serialNumber && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">Serienummer</div>
                  <div className="font-mono text-gray-900">{selectedItem.serialNumber}</div>
                </div>
              )}

              {selectedItem.description && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">Beskrivelse</div>
                  <div className="whitespace-pre-wrap text-gray-900">{selectedItem.description}</div>
                </div>
              )}

              {selectedItem.currentCheckout && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600 mb-2">Udlånt til</div>
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-gray-900">
                      {selectedItem.currentCheckout.memberName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(selectedItem.currentCheckout.checkoutTime).toLocaleString('da-DK')}</span>
                  </div>
                </div>
              )}

              {selectedItem.notes && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">Noter</div>
                  <div className="text-gray-900">{selectedItem.notes}</div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4 text-xs text-gray-500">
                <div>Senest ændret: {new Date(selectedItem.modifiedAtUtc).toLocaleString('da-DK')}</div>
                <div className="mt-1">Synkronisering: {selectedItem.syncedAtUtc ? 'Synkroniseret' : 'Afventer synkronisering'}</div>
              </div>

              {selectedItem.status === 'MAINTENANCE' && (
                <div className="p-4 bg-amber-50 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-amber-800">Kræver vedligeholdelse</div>
                    <div className="text-sm text-amber-600">Dette udstyr bør efterses</div>
                  </div>
                </div>
              )}

              <div className="pt-4 space-y-2">
                <button
                  onClick={() => setEditingItem(selectedItem)}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Pencil className="w-5 h-5" />
                  Rediger udstyr
                </button>
                {!selectedItem.currentCheckout && selectedItem.status === 'AVAILABLE' && (
                  <button
                    onClick={() => void updateStatus(selectedItem, 'MAINTENANCE')}
                    className="w-full py-2 px-4 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Wrench className="w-5 h-5" />
                    Send til vedligeholdelse
                  </button>
                )}
                {!selectedItem.currentCheckout && (selectedItem.status === 'MAINTENANCE' || selectedItem.status === 'RETIRED') && (
                  <button
                    onClick={() => void updateStatus(selectedItem, 'AVAILABLE')}
                    className="w-full py-2 px-4 border border-green-300 text-green-800 rounded-lg hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Sæt tilbage i drift
                  </button>
                )}
                {!selectedItem.currentCheckout && selectedItem.status !== 'RETIRED' && (
                  <button
                    onClick={() => setRetiringItem(selectedItem)}
                    className="w-full py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Ban className="w-5 h-5" />
                    Pensionér udstyr
                  </button>
                )}
                {selectedItem.currentCheckout && (
                  <p className="text-sm text-gray-500 text-center">
                    Udlån og returnering håndteres på træner-tabletten.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <EquipmentFormDialog
        key={isAddingItem ? 'add-open' : 'add-closed'}
        isOpen={isAddingItem}
        title="Tilføj udstyr"
        confirmLabel="Tilføj"
        item={null}
        onClose={() => setIsAddingItem(false)}
        onSave={createEquipment}
        serialNumberInUse={serialNumber => equipment.some(candidate =>
          candidate.serialNumber.toLowerCase() === serialNumber.trim().toLowerCase()
        )}
      />
      <EquipmentFormDialog
        key={editingItem?.id ?? 'edit-closed'}
        isOpen={editingItem != null}
        title="Rediger udstyr"
        confirmLabel="Gem ændringer"
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={values => editingItem && void saveEquipment({ ...values, id: editingItem.id })}
        serialNumberInUse={serialNumber => equipment.some(candidate =>
          candidate.id !== editingItem?.id &&
          candidate.serialNumber.toLowerCase() === serialNumber.trim().toLowerCase()
        )}
      />
      <ConfirmDialog
        isOpen={retiringItem != null}
        onClose={() => setRetiringItem(null)}
        onConfirm={() => retiringItem && void updateStatus(retiringItem, 'RETIRED')}
        title="Pensionér udstyr"
        message={`Vil du pensionere ${retiringItem?.name ?? 'dette udstyr'}? Det kan senere sættes tilbage i drift.`}
        confirmText="Pensionér"
        variant="warning"
      />
    </div>
  );
}

function EquipmentFormDialog({
  isOpen,
  title,
  confirmLabel,
  item,
  onClose,
  onSave,
  serialNumberInUse
}: {
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  item: EquipmentWithCheckout | null;
  onClose: () => void;
  onSave: (values: EquipmentFormValues) => void;
  serialNumberInUse: (serialNumber: string) => boolean;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber ?? '');
  const [type, setType] = useState<EquipmentType>(item ? getEquipmentType(item) : 'TRAINING_MATERIAL');
  const [description, setDescription] = useState(item?.description ?? '');
  const dialogRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen });

  const isDuplicateSerialNumber = serialNumber.trim().length > 0 && serialNumberInUse(serialNumber);
  const isValid = name.trim().length > 0 && serialNumber.trim().length > 0 && !isDuplicateSerialNumber;
  const save = () => {
    if (!isValid) return;
    onSave({ name, serialNumber, type, description });
  };

  useDialogKeyboard(isOpen, onClose, save);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="fixed inset-0 bg-black/50" onClick={onClose} aria-label="Luk dialog" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="equipment-form-title" className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-5">
          <div>
            <h2 id="equipment-form-title" className="text-xl font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">Angiv identifikation, kategori og beskrivelse.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Navn
            <input autoFocus value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Serienummer
            <input value={serialNumber} onChange={event => setSerialNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" required />
            {isDuplicateSerialNumber && <span className="mt-1 block text-xs text-red-600">Serienummeret bruges allerede.</span>}
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Kategori
            <select value={type} onChange={event => setType(event.target.value as EquipmentType)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
              {equipmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Beskrivelse
            <textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} maxLength={200} className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2" />
            <span className="mt-1 block text-right text-xs text-gray-500">{description.length}/200</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">Annuller</button>
          <button onClick={save} disabled={!isValid} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{confirmLabel}</button>
        </div>
        <button onClick={onClose} className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600" title="Luk" aria-label="Luk dialog">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
