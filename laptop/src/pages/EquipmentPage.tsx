/**
 * Equipment management page.
 * Lists equipment items and checkout status.
 * 
 * @see [design.md FR-8] - Equipment checkout tracking
 */

import { useState, useEffect } from 'react';
import { Package, Search, User, Clock, AlertTriangle, CheckCircle, X, Pencil, Wrench, RotateCcw, Ban } from 'lucide-react';
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

export function EquipmentPage() {
  const [equipment, setEquipment] = useState<EquipmentWithCheckout[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedItem, setSelectedItem] = useState<EquipmentWithCheckout | null>(null);
  const [editingItem, setEditingItem] = useState<EquipmentWithCheckout | null>(null);
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
        SELECT ec.*, (m.firstName || ' ' || m.lastName) as memberName
        FROM EquipmentCheckout ec
        JOIN Member m ON ec.internalMemberId = m.internalId
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
    const matchesSearch = searchQuery === '' || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: equipment.length,
    available: equipment.filter(e => e.status === 'AVAILABLE').length,
    checkedOut: equipment.filter(e => e.status === 'CHECKED_OUT').length,
    needsMaintenance: equipment.filter(e => e.status === 'MAINTENANCE').length
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Udstyr</h1>
          <p className="text-gray-600 mt-1">Administrer våben og udstyr</p>

          {/* Stats */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 xl:gap-4 mt-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">I alt</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{stats.available}</div>
              <div className="text-sm text-green-600">Tilgængeligt</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-700">{stats.checkedOut}</div>
              <div className="text-sm text-blue-600">Udlånt</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-amber-700">{stats.needsMaintenance}</div>
              <div className="text-sm text-amber-600">Til vedligeholdelse</div>
            </div>
          </div>

          {/* Search and filter */}
          <div className="flex flex-col xl:flex-row gap-3 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Søg efter navn eller serienummer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Alle</option>
              <option value="AVAILABLE">Tilgængeligt</option>
              <option value="CHECKED_OUT">Udlånt</option>
              <option value="MAINTENANCE">Til vedligeholdelse</option>
              <option value="RETIRED">Pensioneret</option>
            </select>
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
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredEquipment.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedItem?.id === item.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${equipmentStatusStyles[item.status]}`}>
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-sm text-gray-500">
                          {equipmentTypeLabels[item.equipmentType ?? item.type] ?? item.equipmentType ?? item.type}
                        </div>
                        {item.serialNumber && (
                          <div className="text-sm text-gray-500">SN: {item.serialNumber}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {item.currentCheckout ? (
                        <div className="flex items-center gap-1 text-blue-600">
                          <User className="w-4 h-4" />
                          <span className="text-sm">{item.currentCheckout.memberName}</span>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm ${equipmentStatusStyles[item.status]}`}>
                          {item.status === 'AVAILABLE' && <CheckCircle className="w-4 h-4" />}
                          {item.status === 'MAINTENANCE' && <Wrench className="w-4 h-4" />}
                          {item.status === 'RETIRED' && <Ban className="w-4 h-4" />}
                          {equipmentStatusLabels[item.status]}
                        </span>
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
                <p className="text-gray-500">
                  {equipmentTypeLabels[selectedItem.equipmentType ?? selectedItem.type] ?? selectedItem.equipmentType ?? selectedItem.type}
                </p>
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
      <EquipmentEditDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={saveEquipment}
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

interface EquipmentEditValues {
  id: string;
  name: string;
  serialNumber: string;
  type: EquipmentType;
  description: string;
}

function EquipmentEditDialog({
  item,
  onClose,
  onSave,
  serialNumberInUse
}: {
  item: EquipmentWithCheckout | null;
  onClose: () => void;
  onSave: (values: EquipmentEditValues) => void;
  serialNumberInUse: (serialNumber: string) => boolean;
}) {
  const [name, setName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [type, setType] = useState<EquipmentType>('TRAINING_MATERIAL');
  const [description, setDescription] = useState('');
  const dialogRef = useFocusTrap<HTMLDivElement>({ enabled: item != null });

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setSerialNumber(item.serialNumber);
    setType(item.equipmentType ?? item.type);
    setDescription(item.description ?? '');
  }, [item]);

  const isDuplicateSerialNumber = serialNumber.trim().length > 0 && serialNumberInUse(serialNumber);
  const isValid = name.trim().length > 0 && serialNumber.trim().length > 0 && !isDuplicateSerialNumber;
  const save = () => {
    if (!item || !isValid) return;
    onSave({ id: item.id, name, serialNumber, type, description });
  };

  useDialogKeyboard(item != null, onClose, save);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="fixed inset-0 bg-black/50" onClick={onClose} aria-label="Luk dialog" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="equipment-edit-title" className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="equipment-edit-title" className="text-xl font-semibold text-gray-900">Rediger udstyr</h2>
            <p className="mt-1 text-sm text-gray-500">Opdater identifikation og beskrivelse.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600" title="Luk" aria-label="Luk dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Navn
            <input value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Serienummer
            <input value={serialNumber} onChange={event => setSerialNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" required />
            {isDuplicateSerialNumber && <span className="mt-1 block text-xs text-red-600">Serienummeret bruges allerede.</span>}
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Udstyrstype
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
          <button onClick={save} disabled={!isValid} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Gem ændringer</button>
        </div>
      </div>
    </div>
  );
}
