/**
 * Push Confirmation Dialog component.
 * Shows confirmation before pushing master data to devices.
 * Displays progress per device during sync operation.
 * 
 * @see [design.md FR-15] - Push Confirmation
 * @see [design.md FR-4.3] - Manual Push
 */

import { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader, Tablet, Laptop, Send, Wifi, WifiOff } from 'lucide-react';
import type { DeviceInfo } from '../types/entities';
import { useAppStore, setSyncResultCallback, type SyncResultNotification } from '../store/appStore';
import { getAllMembers } from '../database';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  devices: DeviceInfo[];
}

interface DeviceSyncStatus {
  deviceId: string;
  status: 'pending' | 'pushing' | 'pulling' | 'success' | 'error';
  membersPushed?: number;
  checkInsReceived?: number;
  sessionsReceived?: number;
  error?: string;
}

export function PushConfirmationDialog({ isOpen, onClose, devices }: Props) {
  const { triggerSync, isSyncing } = useAppStore();
  const [memberCount, setMemberCount] = useState(0);
  const [deviceStatuses, setDeviceStatuses] = useState<DeviceSyncStatus[]>([]);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResultNotification | null>(null);

  // Get member count on open
  useEffect(() => {
    if (isOpen) {
      const members = getAllMembers();
      setMemberCount(members.length);
      
      // Initialize device statuses
      setDeviceStatuses(
        devices
          .filter(d => d.isTrusted)
          .map(d => ({
            deviceId: d.id,
            status: d.isOnline ? 'pending' : 'error',
            error: d.isOnline ? undefined : 'Offline'
          }))
      );
      setSyncComplete(false);
      setSyncResult(null);
    }
  }, [isOpen, devices]);

  // Listen for sync result
  useEffect(() => {
    if (isOpen) {
      setSyncResultCallback((result) => {
        setSyncResult(result);
        setSyncComplete(true);
        
        // Update all device statuses to success
        setDeviceStatuses(prev =>
          prev.map(ds => ({
            ...ds,
            status: ds.status === 'pending' || ds.status === 'pushing' || ds.status === 'pulling'
              ? (result.success ? 'success' : 'error')
              : ds.status,
            membersPushed: result.membersPushed,
            checkInsReceived: result.checkInsReceived,
            sessionsReceived: result.sessionsReceived
          }))
        );
      });
    }
    
    return () => {
      setSyncResultCallback(() => {});
    };
  }, [isOpen]);

  // Update device statuses when sync starts
  useEffect(() => {
    if (isSyncing && !syncComplete) {
      setDeviceStatuses(prev =>
        prev.map(ds => ({
          ...ds,
          status: ds.status === 'pending' ? 'pushing' : ds.status
        }))
      );
    }
  }, [isSyncing, syncComplete]);

  async function handlePush() {
    setSyncComplete(false);
    setSyncResult(null);
    await triggerSync();
  }

  function handleClose() {
    if (!isSyncing) {
      onClose();
    }
  }

  if (!isOpen) return null;

  const onlineDevices = devices.filter(d => d.isTrusted && d.isOnline);
  const offlineDevices = devices.filter(d => d.isTrusted && !d.isOnline);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {syncComplete ? 'Synkronisering fuldført' : 'Push til enheder'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSyncing}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Summary */}
          {!isSyncing && !syncComplete && (
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-blue-800 font-medium">
                Push {memberCount} medlemmer til {onlineDevices.length} enheder
              </p>
              <p className="text-blue-600 text-sm mt-1">
                Data vil blive sendt til alle online enheder. Offline enheder modtager data ved næste forbindelse.
              </p>
            </div>
          )}

          {/* Progress during sync */}
          {isSyncing && !syncComplete && (
            <div className="bg-amber-50 rounded-lg p-4 flex items-center gap-3">
              <Loader className="w-5 h-5 text-amber-600 animate-spin" />
              <div>
                <p className="text-amber-800 font-medium">Synkroniserer...</p>
                <p className="text-amber-600 text-sm">Vent venligst mens data overføres</p>
              </div>
            </div>
          )}

          {/* Result */}
          {syncComplete && syncResult && (
            <div className={`rounded-lg p-4 ${syncResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2">
                {syncResult.success ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <p className={`font-medium ${syncResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {syncResult.success ? 'Synkronisering gennemført' : 'Synkronisering fejlede'}
                </p>
              </div>
              <p className={`text-sm mt-1 ${syncResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {syncResult.message}
              </p>
            </div>
          )}

          {/* Device list */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Enheder</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {/* Online devices */}
              {devices.filter(d => d.isTrusted).map(device => {
                const status = deviceStatuses.find(ds => ds.deviceId === device.id);
                const DeviceIcon = device.type === 'TRAINER_TABLET' ? Tablet : 
                                   device.type === 'LAPTOP' ? Laptop : Tablet;
                
                return (
                  <div
                    key={device.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      device.isOnline 
                        ? 'bg-white border-gray-200'
                        : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <DeviceIcon className={`w-5 h-5 ${device.isOnline ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div>
                        <p className={`font-medium ${device.isOnline ? 'text-gray-900' : 'text-gray-500'}`}>
                          {device.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {device.type?.replace('_', ' ') || 'Tablet'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Online/offline indicator */}
                      {device.isOnline ? (
                        <Wifi className="w-4 h-4 text-green-500" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-gray-400" />
                      )}
                      
                      {/* Status indicator */}
                      {status?.status === 'pending' && device.isOnline && (
                        <span className="text-xs text-gray-500">Venter</span>
                      )}
                      {status?.status === 'pushing' && (
                        <Loader className="w-4 h-4 text-blue-600 animate-spin" />
                      )}
                      {status?.status === 'pulling' && (
                        <Loader className="w-4 h-4 text-blue-600 animate-spin" />
                      )}
                      {status?.status === 'success' && (
                        <Check className="w-4 h-4 text-green-600" />
                      )}
                      {status?.status === 'error' && !device.isOnline && (
                        <span className="text-xs text-gray-400">Offline</span>
                      )}
                      {status?.status === 'error' && device.isOnline && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </div>
                );
              })}

              {devices.filter(d => d.isTrusted).length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">
                  Ingen parrede enheder. Gå til Enheder for at parre en tablet.
                </p>
              )}
            </div>
          </div>

          {/* Offline warning */}
          {offlineDevices.length > 0 && !syncComplete && (
            <div className="bg-amber-50 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-amber-700 text-sm">
                {offlineDevices.length} enhed{offlineDevices.length > 1 ? 'er' : ''} er offline og vil 
                modtage opdateringen ved næste forbindelse.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {syncComplete ? (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Luk
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={isSyncing}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                onClick={handlePush}
                disabled={isSyncing || onlineDevices.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Sender...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Push til enheder
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
