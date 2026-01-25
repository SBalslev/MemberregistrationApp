/**
 * Devices management page.
 * Shows connected tablets and sync status.
 * 
 * @see [design.md FR-2] - Network Architecture
 * @see [security-tasks.md SEC-1] - Proper Pairing Ceremony
 */

import { useState, useEffect, useCallback } from 'react';
import { Tablet, Laptop, Wifi, WifiOff, RefreshCw, Clock, CheckCircle, AlertCircle, Plus, X, Shield } from 'lucide-react';
import { isElectron, getElectronAPI } from '../types/electron';
import { query, saveTrustedDevice, getTrustedDevices, getMemberDataForFullSync, processSyncPayload, SYNC_SCHEMA_VERSION, type SyncPayload } from '../database';
import { collectEntitiesForDevice, markDeliveredToDeviceBatch, recordFailedAttempt } from '../database/syncOutboxRepository';
import type { DeviceInfo } from '../types/entities';

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [serverStatus, setServerStatus] = useState<{ running: boolean; port: number } | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Pairing state (SEC-1)
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<Date | null>(null);
  const [pairingTimeLeft, setPairingTimeLeft] = useState<number>(0);

  // Sync trusted devices to main process cache
  const syncDevicesToCache = useCallback(async () => {
    if (!isElectron()) return;
    
    const api = getElectronAPI();
    const trustedDevices = getTrustedDevices();
    
    await api?.syncTrustedDevices?.(trustedDevices.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      authToken: d.authToken,
      tokenExpiresAt: d.tokenExpiresAt,
      isTrusted: d.isTrusted
    })));
  }, []);

  useEffect(() => {
    loadDevices();
    loadServerStatus();

    // Listen for device discovery in Electron
    if (isElectron()) {
      const api = getElectronAPI();
      
      // Listen for mDNS/subnet discovered devices
      api?.onDeviceDiscovered((device) => {
        console.log('[Devices] Discovered device:', device);
        // Add to devices list if not already present, or update if exists
        setDevices(prev => {
          const deviceId = device.txt?.deviceId || device.name;
          const existingIndex = prev.findIndex(d => d.id === deviceId);
          
          const newDevice: DeviceInfo = {
            id: deviceId,
            name: device.name,
            type: (device.txt?.deviceType as DeviceInfo['type']) || 'MEMBER_TABLET',
            ipAddress: device.host,
            port: device.port,
            isOnline: true,
            isTrusted: existingIndex >= 0 ? prev[existingIndex].isTrusted : false,
            lastSeenUtc: new Date().toISOString(),
            pairingDateUtc: existingIndex >= 0 ? prev[existingIndex].pairingDateUtc : new Date().toISOString()
          };
          
          if (existingIndex >= 0) {
            // Update existing device
            const updated = [...prev];
            updated[existingIndex] = { ...prev[existingIndex], ...newDevice };
            return updated;
          }
          return [...prev, newDevice];
        });
      });
      
      // Listen for pairing requests from tablets
      api?.onPairingRequest((device) => {
        console.log('[Devices] Pairing request from:', device);
        // Add paired device to list
        setDevices(prev => {
          const exists = prev.some(d => d.id === device.deviceId);
          if (exists) {
            // Update existing device
            return prev.map(d => d.id === device.deviceId 
              ? { ...d, isOnline: true, isTrusted: true, lastSeenUtc: new Date().toISOString() }
              : d
            );
          }
          const newDevice: DeviceInfo = {
            id: device.deviceId,
            name: device.deviceName,
            type: (device.deviceType as DeviceInfo['type']) || 'MEMBER_TABLET',
            ipAddress: '',
            port: 8085,
            isOnline: true,
            isTrusted: true,
            lastSeenUtc: new Date().toISOString(),
            pairingDateUtc: new Date().toISOString()
          };
          return [...prev, newDevice];
        });
      });
      
      // Trigger a subnet scan on load to find devices
      api?.scanSubnet?.().then((foundDevices: unknown[]) => {
        console.log('[Devices] Initial subnet scan found:', foundDevices?.length || 0, 'devices');
      }).catch((err: Error) => {
        console.error('[Devices] Subnet scan failed:', err);
      });
      
      // Listen for successful pairing completion (SEC-1)
      api?.onPairingComplete?.((deviceData) => {
        console.log('[Devices] Pairing complete:', deviceData);
        
        // Save to database
        try {
          const device: DeviceInfo = {
            id: deviceData.id,
            name: deviceData.name,
            type: deviceData.type as DeviceInfo['type'],
            ipAddress: null,
            port: 8085,
            isTrusted: true,
            isOnline: true,
            lastSeenUtc: deviceData.lastSeenUtc,
            pairingDateUtc: deviceData.pairingDateUtc
          };
          
          saveTrustedDevice(device, deviceData.token, deviceData.tokenExpiresAt);
          
          // Add to local state
          setDevices(prev => {
            const exists = prev.some(d => d.id === device.id);
            if (exists) {
              return prev.map(d => d.id === device.id ? device : d);
            }
            return [...prev, device];
          });
          
          // Close pairing modal
          setShowPairingModal(false);
          setPairingCode(null);
          
          // Sync to cache
          syncDevicesToCache();
        } catch (err) {
          console.error('[Devices] Failed to save paired device:', err);
        }
      });
      
      // Sync trusted devices to main process on load
      syncDevicesToCache();
    }
  }, [syncDevicesToCache]);

  async function loadDevices() {
    try {
      // Query TrustedDevice table - devices are stored here after pairing
      const dbDevices = query<DeviceInfo>('SELECT id, name, type, lastSeenUtc, pairingDateUtc, ipAddress, port, isTrusted FROM TrustedDevice ORDER BY lastSeenUtc DESC');
      // Map to DeviceInfo format
      const mapped = dbDevices.map(d => ({
        ...d,
        isOnline: false, // Will be updated by discovery
        isTrusted: Boolean(d.isTrusted)
      }));
      setDevices(mapped);
    } catch (error) {
      console.error('Failed to load devices:', error);
      // Start with empty list if table doesn't exist yet
      setDevices([]);
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

  // Countdown timer for pairing code (SEC-1)
  useEffect(() => {
    if (!pairingExpiresAt) {
      setPairingTimeLeft(0);
      return;
    }
    
    const updateTimer = () => {
      const now = Date.now();
      const timeLeft = Math.max(0, Math.floor((pairingExpiresAt.getTime() - now) / 1000));
      setPairingTimeLeft(timeLeft);
      
      if (timeLeft === 0) {
        setPairingCode(null);
        setPairingExpiresAt(null);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [pairingExpiresAt]);

  // Start a new pairing session
  async function startPairing() {
    if (!isElectron()) return;
    
    const api = getElectronAPI();
    try {
      const result = await api?.startPairingSession?.();
      if (result) {
        setPairingCode(result.code);
        setPairingExpiresAt(new Date(result.expiresAt));
        setShowPairingModal(true);
      }
    } catch (err) {
      console.error('[Pairing] Failed to start session:', err);
    }
  }

  // Cancel pairing session
  async function cancelPairing() {
    if (!isElectron()) return;
    
    const api = getElectronAPI();
    await api?.cancelPairingSession?.();
    setPairingCode(null);
    setPairingExpiresAt(null);
    setShowPairingModal(false);
  }

  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function isRecentlySeen(lastSeen?: string | null): boolean {
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes
  }

  async function handleRescan() {
    if (!isElectron()) return;
    setIsScanning(true);
    try {
      const api = getElectronAPI();
      await api?.scanSubnet?.();
    } catch (err) {
      console.error('[Devices] Rescan failed:', err);
    } finally {
      setIsScanning(false);
    }
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Enheder</h1>
              <p className="text-gray-600 mt-1">Se og administrer tilsluttede enheder</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={startPairing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Plus className="w-5 h-5" />
                Par ny enhed
              </button>
              <button
                onClick={handleRescan}
                disabled={isScanning}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
                {isScanning ? 'Scanner...' : 'Scan netværk'}
              </button>
            </div>
          </div>

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
                        disabled={isSyncing || !selectedDevice.ipAddress}
                        onClick={async () => {
                          if (!selectedDevice?.ipAddress) {
                            setSyncMessage({ type: 'error', text: 'Ingen IP-adresse for denne enhed' });
                            return;
                          }
                          setIsSyncing(true);
                          setSyncMessage(null);

                          const baseUrl = `http://${selectedDevice.ipAddress}:${selectedDevice.port || 8085}`;
                          console.log('[Sync] Starting bidirectional sync with:', selectedDevice.name, 'at', baseUrl);

                          let membersPushed = 0;
                          let checkInsReceived = 0;
                          let sessionsReceived = 0;

                          try {
                            // Step 1: Check if device is online
                            const statusResponse = await fetch(`${baseUrl}/api/sync/status`, {
                              signal: AbortSignal.timeout(3000)
                            });

                            if (!statusResponse.ok) {
                              setSyncMessage({ type: 'error', text: `Enhed ${selectedDevice.name} svarer ikke (${statusResponse.status})` });
                              return;
                            }

                            // Step 1.5: Request a valid auth token from the tablet
                            // This is needed because the tablet generates its own JWT format
                            // Get this laptop's actual device ID from the Electron API
                            const api = getElectronAPI();
                            const laptopInfo = await api?.getDeviceInfo?.();
                            const laptopDeviceId = laptopInfo?.deviceId || 'laptop-master';
                            const laptopName = laptopInfo?.deviceName || 'Laptop';

                            console.log('[Sync] Requesting auth token from tablet for device:', laptopDeviceId);
                            const tokenResponse = await fetch(`${baseUrl}/api/sync/request-token`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                deviceId: laptopDeviceId,
                                deviceName: laptopName,
                                deviceType: 'LAPTOP'
                              }),
                              signal: AbortSignal.timeout(5000)
                            });

                            if (!tokenResponse.ok) {
                              const errorText = await tokenResponse.text();
                              console.error('[Sync] Token request failed:', tokenResponse.status, errorText);
                              setSyncMessage({ type: 'error', text: `Kunne ikke få auth-token: ${tokenResponse.status}` });
                              return;
                            }

                            const tokenData = await tokenResponse.json();
                            if (!tokenData.success || !tokenData.authToken) {
                              console.error('[Sync] Token response invalid:', tokenData);
                              setSyncMessage({ type: 'error', text: tokenData.errorMessage || 'Kunne ikke få auth-token' });
                              return;
                            }

                            const authToken = tokenData.authToken;
                            console.log('[Sync] Got valid auth token from tablet');

                            const authHeaders = {
                              'Authorization': `Bearer ${authToken}`,
                              'Content-Type': 'application/json'
                            };

                            // Update device as online
                            setDevices(prev => prev.map(d =>
                              d.id === selectedDevice.id
                                ? { ...d, isOnline: true, lastSeenUtc: new Date().toISOString() }
                                : d
                            ));

                            // Step 2: Collect entities from outbox for this device
                            const outboxData = collectEntitiesForDevice(selectedDevice.id);
                            const hasOutboxEntries = outboxData.outboxIds.length > 0;

                            let memberData: object[];
                            let outboxIds: string[];

                            if (hasOutboxEntries) {
                              console.log(`[Sync] Pushing ${outboxData.outboxIds.length} outbox entries`);
                              memberData = outboxData.members;
                              outboxIds = outboxData.outboxIds;
                            } else {
                              memberData = getMemberDataForFullSync();
                              outboxIds = [];
                              console.log(`[Sync] Outbox empty, pushing all ${memberData.length} members`);
                            }

                            // Generate unique message ID for idempotency
                            const messageId = crypto.randomUUID();

                            const pushPayload = {
                              schemaVersion: SYNC_SCHEMA_VERSION,
                              deviceId: laptopDeviceId,
                              deviceType: 'LAPTOP',
                              timestamp: new Date().toISOString(),
                              messageId,
                              outboxIds,
                              entities: {
                                members: memberData,
                                checkIns: outboxData.checkIns || [],
                                practiceSessions: outboxData.practiceSessions || [],
                                equipmentCheckouts: outboxData.equipmentCheckouts || [],
                                newMemberRegistrations: []
                              }
                            };

                            // Step 3: Push data to tablet
                            console.log('[Sync] Pushing data to', selectedDevice.name);
                            console.log('[Sync] Push payload:', JSON.stringify(pushPayload, null, 2).substring(0, 1000) + '...');
                            const pushResponse = await fetch(`${baseUrl}/api/sync/push`, {
                              method: 'POST',
                              headers: authHeaders,
                              body: JSON.stringify(pushPayload),
                              signal: AbortSignal.timeout(30000)
                            });

                            if (pushResponse.ok) {
                              const pushResult = await pushResponse.json();
                              console.log('[Sync] Push result:', pushResult);
                              membersPushed = memberData.length;

                              // Mark outbox entries as delivered
                              if (outboxIds.length > 0) {
                                markDeliveredToDeviceBatch(outboxIds, selectedDevice.id);
                                console.log(`[Sync] Marked ${outboxIds.length} outbox entries as delivered`);
                              }
                            } else {
                              const errorBody = await pushResponse.text();
                              console.error('[Sync] Push failed:', pushResponse.status, errorBody);
                              if (outboxIds.length > 0) {
                                for (const outboxId of outboxIds) {
                                  recordFailedAttempt(outboxId, selectedDevice.id, `HTTP ${pushResponse.status}`);
                                }
                              }
                            }

                            // Step 4: Pull data from tablet
                            console.log('[Sync] Pulling data from', selectedDevice.name);
                            const pullResponse = await fetch(`${baseUrl}/api/sync/pull`, {
                              method: 'POST',
                              headers: authHeaders,
                              body: JSON.stringify({
                                since: '1970-01-01T00:00:00Z',
                                deviceId: laptopDeviceId,
                                schemaVersion: SYNC_SCHEMA_VERSION
                              }),
                              signal: AbortSignal.timeout(30000)
                            });

                            if (pullResponse.ok) {
                              const pullData = await pullResponse.json() as SyncPayload;
                              console.log('[Sync] Pull result:',
                                `${pullData.entities?.checkIns?.length || 0} check-ins,`,
                                `${pullData.entities?.practiceSessions?.length || 0} sessions`
                              );

                              if (pullData.entities) {
                                const syncResult = await processSyncPayload(pullData);
                                if (!syncResult.isDuplicate) {
                                  checkInsReceived = syncResult.checkInsAdded || 0;
                                  sessionsReceived = syncResult.sessionsAdded || 0;
                                }
                              }
                            } else {
                              console.warn('[Sync] Pull failed:', pullResponse.status);
                            }

                            // Show success message
                            setSyncMessage({
                              type: 'success',
                              text: `Synkroniseret: ${membersPushed} medlemmer sendt, ${checkInsReceived} check-ins og ${sessionsReceived} sessioner modtaget`
                            });

                          } catch (err) {
                            console.error('[Sync] Error syncing with device:', err);
                            setSyncMessage({ type: 'error', text: `Fejl ved synkronisering: ${err instanceof Error ? err.message : err}` });
                            // Mark device as offline
                            setDevices(prev => prev.map(d =>
                              d.id === selectedDevice.id
                                ? { ...d, isOnline: false }
                                : d
                            ));
                          } finally {
                            setIsSyncing(false);
                          }
                        }}
                      >
                        <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Synkroniserer...' : 'Synkroniser nu'}
                      </button>
                      {syncMessage && (
                        <div className={`p-3 rounded-lg text-sm ${syncMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {syncMessage.text}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Pairing Modal */}
      {showPairingModal && pairingCode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-full">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Par ny enhed</h2>
              </div>
              <button
                onClick={cancelPairing}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="text-center mb-6">
              <p className="text-gray-600 mb-4">
                Indtast denne kode på tabletten for at forbinde:
              </p>
              
              {/* 6-digit code display */}
              <div className="flex justify-center gap-2 mb-4">
                {pairingCode.split('').map((digit, index) => (
                  <div
                    key={index}
                    className="w-14 h-16 bg-gray-100 rounded-xl flex items-center justify-center text-3xl font-bold text-gray-900 border-2 border-gray-200"
                  >
                    {digit}
                  </div>
                ))}
              </div>

              {/* Countdown timer */}
              <div className={`text-sm ${pairingTimeLeft < 60 ? 'text-red-600' : 'text-gray-500'}`}>
                Udløber om {Math.floor(pairingTimeLeft / 60)}:{(pairingTimeLeft % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-blue-900 mb-2">Sådan gør du:</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Åbn appen på tabletten</li>
                <li>Gå til Indstillinger → Enheder</li>
                <li>Tryk på "Par med laptop"</li>
                <li>Indtast koden ovenfor</li>
              </ol>
            </div>

            <button
              onClick={cancelPairing}
              className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Annuller
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
