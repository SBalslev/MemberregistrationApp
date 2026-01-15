/**
 * Devices management page.
 * Shows connected tablets and sync status.
 * 
 * @see [design.md FR-2] - Network Architecture
 */

import { useState, useEffect } from 'react';
import { Tablet, Laptop, Wifi, WifiOff, RefreshCw, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { isElectron, getElectronAPI } from '../types/electron';
import { query } from '../database';
import type { DeviceInfo } from '../types/entities';

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [serverStatus, setServerStatus] = useState<{ running: boolean; port: number } | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDevices();
    loadServerStatus();

    // Listen for device discovery in Electron
    if (isElectron()) {
      const api = getElectronAPI();
      api?.onDeviceDiscovered((device) => {
        // Add to devices list if not already present
        setDevices(prev => {
          const exists = prev.some(d => d.id === device.txt?.deviceId);
          if (exists) return prev;
          const newDevice: DeviceInfo = {
            id: device.txt?.deviceId || device.name,
            name: device.name,
            type: (device.txt?.deviceType as DeviceInfo['type']) || 'LAPTOP',
            ipAddress: device.host,
            port: device.port,
            isOnline: true,
            isTrusted: false,
            lastSeenUtc: new Date().toISOString(),
            pairingDateUtc: new Date().toISOString()
          };
          return [...prev, newDevice];
        });
      });
    }
  }, []);

  async function loadDevices() {
    try {
      const dbDevices = query<DeviceInfo>('SELECT * FROM DeviceInfo ORDER BY lastSeenUtc DESC');
      setDevices(dbDevices);
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadServerStatus() {
    if (isElectron()) {
      const api = getElectronAPI();
      const status = await api?.getServerStatus();
      setServerStatus(status || null);
    }
  }

  function isRecentlySeen(lastSeen?: string | null): boolean {
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes
  }

  const onlineCount = devices.filter(d => d.isOnline || isRecentlySeen(d.lastSeenUtc)).length;

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-white">
          <h1 className="text-2xl font-bold text-gray-900">Enheder</h1>
          <p className="text-gray-600 mt-1">Se og administrer tilsluttede enheder</p>

          {/* Server status */}
          {serverStatus && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <Wifi className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="font-medium text-green-800">Sync-server kører</div>
                <div className="text-sm text-green-600">
                  Port {serverStatus.port} • mDNS aktiv
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-gray-900">{devices.length}</div>
              <div className="text-gray-600">Enheder i alt</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-green-700">{onlineCount}</div>
              <div className="text-green-600">Online nu</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-gray-900">{devices.length - onlineCount}</div>
              <div className="text-gray-600">Offline</div>
            </div>
          </div>
        </div>

        {/* Device list */}
        <div className="flex-1 overflow-y-auto p-4">
          {devices.length === 0 ? (
            <div className="text-center py-12">
              <Tablet className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500 mb-4">Ingen enheder fundet</p>
              <p className="text-sm text-gray-400">
                Åbn appen på en tablet for at forbinde automatisk
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {devices.map(device => {
                const online = device.isOnline || isRecentlySeen(device.lastSeenUtc);
                return (
                  <button
                    key={device.id}
                    onClick={() => setSelectedDevice(device)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      selectedDevice?.id === device.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          online ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          {device.type === 'LAPTOP' ? (
                            <Laptop className={`w-6 h-6 ${
                              online ? 'text-green-600' : 'text-gray-400'
                            }`} />
                          ) : (
                            <Tablet className={`w-6 h-6 ${
                              online ? 'text-green-600' : 'text-gray-400'
                            }`} />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{device.name}</div>
                          <div className="text-sm text-gray-500">{device.type}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {online ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <Wifi className="w-4 h-4" />
                            Online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400 text-sm">
                            <WifiOff className="w-4 h-4" />
                            Offline
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedDevice && (
        <div className="w-96 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-6">
            {(() => {
              const online = selectedDevice.isOnline || isRecentlySeen(selectedDevice.lastSeenUtc);
              return (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`p-3 rounded-xl ${
                      online ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {selectedDevice.type === 'LAPTOP' ? (
                        <Laptop className={`w-8 h-8 ${
                          online ? 'text-green-600' : 'text-gray-400'
                        }`} />
                      ) : (
                        <Tablet className={`w-8 h-8 ${
                          online ? 'text-green-600' : 'text-gray-400'
                        }`} />
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedDevice.name}</h2>
                      <p className="text-gray-500">{selectedDevice.type}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Connection status */}
                    <div className={`p-4 rounded-lg ${
                      online ? 'bg-green-50' : 'bg-gray-50'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {online ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <span className="font-medium text-green-800">Online</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-gray-400" />
                            <span className="font-medium text-gray-600">Offline</span>
                          </>
                        )}
                      </div>
                      {selectedDevice.ipAddress && (
                        <div className="text-sm text-gray-600">
                          IP: {selectedDevice.ipAddress}:{selectedDevice.port || 8080}
                        </div>
                      )}
                    </div>

                    {/* Device ID */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Enheds-ID</div>
                      <div className="font-mono text-sm text-gray-900 break-all">
                        {selectedDevice.id}
                      </div>
                    </div>

                    {/* Last seen */}
                    {selectedDevice.lastSeenUtc && (
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-500 mb-1">Sidst set</div>
                        <div className="flex items-center gap-2 text-gray-900">
                          <Clock className="w-4 h-4" />
                          {new Date(selectedDevice.lastSeenUtc).toLocaleString('da-DK')}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 space-y-2">
                      <button 
                        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        disabled={!online}
                      >
                        <RefreshCw className="w-5 h-5" />
                        Synkroniser nu
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
