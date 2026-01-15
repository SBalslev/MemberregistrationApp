/**
 * Equipment management page.
 * Lists equipment items and checkout status.
 * 
 * @see [design.md FR-8] - Equipment checkout tracking
 */

import { useState, useEffect } from 'react';
import { Package, Search, User, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { query } from '../database';
import type { EquipmentItem, EquipmentCheckout } from '../types/entities';

interface EquipmentWithCheckout extends EquipmentItem {
  currentCheckout?: {
    memberName: string;
    checkoutTime: string;
  };
}

export function EquipmentPage() {
  const [equipment, setEquipment] = useState<EquipmentWithCheckout[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'checked-out'>('all');
  const [selectedItem, setSelectedItem] = useState<EquipmentWithCheckout | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEquipment();
  }, []);

  async function loadEquipment() {
    try {
      // Get all equipment items
      const items = query<EquipmentItem>('SELECT * FROM EquipmentItem ORDER BY name');
      
      // Get active checkouts
      const checkouts = query<EquipmentCheckout & { memberName: string }>(`
        SELECT ec.*, m.name as memberName 
        FROM EquipmentCheckout ec 
        JOIN Member m ON ec.memberId = m.id 
        WHERE ec.returnedAtUtc IS NULL
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
    
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'available' && !item.currentCheckout) ||
      (statusFilter === 'checked-out' && item.currentCheckout);

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: equipment.length,
    available: equipment.filter(e => !e.currentCheckout).length,
    checkedOut: equipment.filter(e => e.currentCheckout).length,
    needsMaintenance: equipment.filter(e => e.status === 'MAINTENANCE').length
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Udstyr</h1>
          <p className="text-gray-600 mt-1">Administrer våben og udstyr</p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{stats.available}</div>
              <div className="text-sm text-green-600">Tilgængelig</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-700">{stats.checkedOut}</div>
              <div className="text-sm text-blue-600">Udlånt</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-amber-700">{stats.needsMaintenance}</div>
              <div className="text-sm text-amber-600">Vedligehold</div>
            </div>
          </div>

          {/* Search and filter */}
          <div className="flex gap-3 mt-4">
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
              <option value="available">Tilgængelig</option>
              <option value="checked-out">Udlånt</option>
            </select>
          </div>
        </div>

        {/* Equipment list */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredEquipment.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Ingen udstyr fundet</p>
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
                      <div className={`p-2 rounded-lg ${
                        item.currentCheckout ? 'bg-blue-100' : 'bg-green-100'
                      }`}>
                        <Package className={`w-5 h-5 ${
                          item.currentCheckout ? 'text-blue-600' : 'text-green-600'
                        }`} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{item.name}</div>
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
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                          <CheckCircle className="w-4 h-4" />
                          Tilgængelig
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
        <div className="w-96 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-3 rounded-xl ${
                selectedItem.currentCheckout ? 'bg-blue-100' : 'bg-green-100'
              }`}>
                <Package className={`w-8 h-8 ${
                  selectedItem.currentCheckout ? 'text-blue-600' : 'text-green-600'
                }`} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedItem.name}</h2>
                <p className="text-gray-500">{selectedItem.equipmentType}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Status</div>
                <div className="flex items-center gap-2">
                  {selectedItem.currentCheckout ? (
                    <>
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                      <span className="font-medium text-blue-700">Udlånt</span>
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                      <span className="font-medium text-green-700">Tilgængelig</span>
                    </>
                  )}
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
                {selectedItem.currentCheckout ? (
                  <button className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Returnér udstyr
                  </button>
                ) : (
                  <button className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                    <User className="w-5 h-5" />
                    Udlån til medlem
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
