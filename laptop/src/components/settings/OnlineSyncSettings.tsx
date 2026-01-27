/**
 * Online Sync Settings Component
 *
 * Provides UI for connecting to and syncing with the online MySQL database.
 *
 * @see /docs/features/online-database-sync/prd.md
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Lock,
  X,
  Eye,
  EyeOff,
  Clock,
  Wifi,
  WifiOff,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import {
  onlineApiService,
  type OnlineConnectionStatus,
  type AuthResult,
  type ApiDiagnosticResult,
} from '../../database/onlineApiService';
import {
  onlineSyncService,
  type OnlineSyncProgress,
  type OnlineSyncResult,
  type SyncVerificationResult,
} from '../../database/onlineSyncService';
import { isElectron, getElectronAPI } from '../../types/electron';
import { SYNC_SCHEMA_VERSION } from '../../database/syncService';

export function OnlineSyncSettings() {
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<OnlineConnectionStatus>({
    connected: false,
    authenticated: false,
    schemaVersion: null,
    lastSyncTime: null,
    serverTime: null,
    error: null,
  });
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | undefined>();
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | undefined>();

  // Schema compatibility state
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<OnlineSyncProgress | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<OnlineSyncResult | null>(null);

  // Diagnostic state
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<ApiDiagnosticResult | null>(null);

  // Verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<SyncVerificationResult | null>(null);

  // Load saved connection state and check status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  // Countdown timer for retry
  useEffect(() => {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) return;

    const timer = setInterval(() => {
      setRetryAfterSeconds((prev) => (prev && prev > 0 ? prev - 1 : undefined));
    }, 1000);

    return () => clearInterval(timer);
  }, [retryAfterSeconds]);

  const checkConnectionStatus = useCallback(async () => {
    setIsCheckingConnection(true);
    try {
      // First check if we have an existing token
      if (onlineApiService.isAuthenticated()) {
        const status = await onlineApiService.getConnectionStatus();
        setConnectionStatus(status);

        // Check schema compatibility
        if (status.authenticated && status.schemaVersion) {
          const compatibility = await onlineApiService.checkSchemaCompatibility(
            SYNC_SCHEMA_VERSION
          );
          if (compatibility.warning) {
            setSchemaWarning(compatibility.warning);
          } else {
            setSchemaWarning(null);
          }
        }
      } else {
        // Not authenticated, test if server is reachable
        const testResult = await onlineApiService.testConnection();
        setConnectionStatus({
          connected: testResult.ok,
          authenticated: false,
          schemaVersion: null,
          lastSyncTime: null,
          serverTime: null,
          error: testResult.ok ? null : testResult.error || 'Kunne ikke nå serveren',
        });
      }
    } catch (error) {
      setConnectionStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Forbindelsesfejl',
      }));
    } finally {
      setIsCheckingConnection(false);
    }
  }, []);

  const handleConnect = () => {
    setShowAuthModal(true);
    setPassword('');
    setAuthError(null);
    setAttemptsRemaining(undefined);
    setRetryAfterSeconds(undefined);
  };

  const handleDisconnect = () => {
    onlineApiService.logout();
    setConnectionStatus({
      connected: false,
      authenticated: false,
      schemaVersion: null,
      lastSyncTime: null,
      serverTime: null,
      error: null,
    });
    setSchemaWarning(null);
  };

  const handleAuthenticate = async () => {
    if (!password.trim()) {
      setAuthError('Indtast venligst en adgangskode');
      return;
    }

    if (retryAfterSeconds && retryAfterSeconds > 0) {
      setAuthError(`Vent venligst ${retryAfterSeconds} sekunder`);
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // Get device ID from Electron or localStorage (consistent across sessions)
      let deviceId: string;
      if (isElectron()) {
        const api = getElectronAPI();
        const deviceInfo = await api?.getDeviceInfo?.();
        deviceId = deviceInfo?.deviceId || 'laptop-unknown';
      } else {
        // Browser/dev mode - use localStorage for consistency
        let storedId = localStorage.getItem('onlineSync_deviceId');
        if (!storedId) {
          storedId = 'laptop-' + crypto.randomUUID().substring(0, 8);
          localStorage.setItem('onlineSync_deviceId', storedId);
        }
        deviceId = storedId;
      }

      const result: AuthResult = await onlineApiService.authenticate(password, deviceId);

      if (result.success) {
        setShowAuthModal(false);
        setPassword('');

        // Refresh connection status
        await checkConnectionStatus();
      } else {
        setAuthError(result.error || 'Godkendelse mislykkedes');
        setAttemptsRemaining(result.attemptsRemaining);
        setRetryAfterSeconds(result.retryAfterSeconds);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Godkendelse mislykkedes');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSync = async (fullSync = false) => {
    if (!connectionStatus.authenticated || isSyncing) return;

    setIsSyncing(true);
    setSyncProgress(null);
    setLastSyncResult(null);

    try {
      const result = await onlineSyncService.sync({
        fullSync,
        onProgress: (progress) => {
          setSyncProgress(progress);
        },
      });

      setLastSyncResult(result);

      // Refresh connection status after sync
      if (result.success) {
        await checkConnectionStatus();
      }
    } catch (error) {
      setLastSyncResult({
        success: false,
        pushed: { members: 0, checkIns: 0, practiceSessions: 0, equipmentItems: 0, equipmentCheckouts: 0, trainerInfos: 0, trainerDisciplines: 0, financialTransactions: 0, transactionLines: 0, photos: 0 },
        pulled: { members: 0, checkIns: 0, practiceSessions: 0, equipmentItems: 0, equipmentCheckouts: 0, trainerInfos: 0, trainerDisciplines: 0, financialTransactions: 0, transactionLines: 0, photos: 0 },
        deleted: { members: 0, checkIns: 0, practiceSessions: 0 },
        conflicts: 0,
        pendingDeletes: 0,
        duration: 0,
        error: error instanceof Error ? error.message : 'Sync fejlede',
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleVerifySync = async () => {
    if (!connectionStatus.authenticated || isVerifying) return;

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const result = await onlineSyncService.verifySyncData();
      setVerificationResult(result);
    } catch (error) {
      setVerificationResult({
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        localCounts: {} as SyncVerificationResult['localCounts'],
        remoteCounts: null,
        discrepancies: [],
        allMatch: false,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticResult(null);

    try {
      const result = await onlineApiService.runDiagnostics();
      setDiagnosticResult(result);
    } catch (error) {
      setDiagnosticResult({
        ok: false,
        deploymentOk: false,
        apiVersion: null,
        expectedVersion: '1.1.0',
        versionMatch: false,
        schemaVersion: null,
        dbConnected: false,
        missingFiles: [],
        fileVersions: {},
        expectedFileVersions: {},
        versionMismatches: {},
        allVersionsOk: false,
        phpVersion: null,
        phpVersionOk: false,
        configExists: false,
        serverTime: null,
        error: error instanceof Error ? error.message : 'Diagnostic fejlede',
      });
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Aldrig';
    try {
      return new Date(timestamp).toLocaleString('da-DK', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return 'Ukendt';
    }
  };

  const formatTokenExpiry = () => {
    const expiry = onlineApiService.getTokenExpiry();
    if (!expiry) return null;

    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (diff <= 0) return 'Udlobet';
    if (hours > 0) return `${hours}t ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Cloud className="w-5 h-5" />
        Online Database
      </h2>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Connection Status */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  connectionStatus.authenticated
                    ? 'bg-green-100'
                    : connectionStatus.connected
                    ? 'bg-yellow-100'
                    : 'bg-gray-100'
                }`}
              >
                {connectionStatus.authenticated ? (
                  <Wifi className="w-5 h-5 text-green-600" />
                ) : connectionStatus.connected ? (
                  <WifiOff className="w-5 h-5 text-yellow-600" />
                ) : (
                  <CloudOff className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <div className="font-medium text-gray-900">
                  {connectionStatus.authenticated
                    ? 'Forbundet'
                    : connectionStatus.connected
                    ? 'Ikke logget ind'
                    : 'Ikke forbundet'}
                </div>
                <div className="text-sm text-gray-500">
                  {connectionStatus.error
                    ? connectionStatus.error
                    : connectionStatus.authenticated
                    ? `Schema v${connectionStatus.schemaVersion}`
                    : 'iss-skydning.dk'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={checkConnectionStatus}
                disabled={isCheckingConnection}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Tjek forbindelse"
              >
                <RefreshCw
                  className={`w-5 h-5 ${isCheckingConnection ? 'animate-spin' : ''}`}
                />
              </button>

              {connectionStatus.authenticated ? (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Log ud
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Forbind
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Schema Warning */}
        {schemaWarning && (
          <div className="p-4 bg-yellow-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-yellow-800">Schema advarsel</div>
                <div className="text-sm text-yellow-700">{schemaWarning}</div>
              </div>
            </div>
          </div>
        )}

        {/* API Diagnostics */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-600">API Diagnostik</span>
            <button
              onClick={handleRunDiagnostics}
              disabled={isRunningDiagnostics}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRunningDiagnostics ? 'animate-spin' : ''}`} />
              {isRunningDiagnostics ? 'Korer...' : 'Kor diagnostik'}
            </button>
          </div>

          {diagnosticResult && (
            <div className={`p-3 rounded-lg text-sm ${diagnosticResult.ok ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {diagnosticResult.ok ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-medium ${diagnosticResult.ok ? 'text-green-800' : 'text-red-800'}`}>
                  {diagnosticResult.ok ? 'API er korrekt deployet' : 'API problemer fundet'}
                </span>
              </div>

              <div className="space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>API Version:</span>
                  <span className={diagnosticResult.versionMatch ? 'text-green-700' : 'text-red-700'}>
                    {diagnosticResult.apiVersion || 'Ukendt'} (forventet: {diagnosticResult.expectedVersion})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Database:</span>
                  <span className={diagnosticResult.dbConnected ? 'text-green-700' : 'text-red-700'}>
                    {diagnosticResult.dbConnected ? 'Forbundet' : 'Ikke forbundet'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Schema:</span>
                  <span>{diagnosticResult.schemaVersion || 'Ikke sat'}</span>
                </div>
                <div className="flex justify-between">
                  <span>PHP:</span>
                  <span className={diagnosticResult.phpVersionOk ? 'text-green-700' : 'text-red-700'}>
                    {diagnosticResult.phpVersion || 'Ukendt'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Config:</span>
                  <span className={diagnosticResult.configExists ? 'text-green-700' : 'text-red-700'}>
                    {diagnosticResult.configExists ? 'Findes' : 'Mangler'}
                  </span>
                </div>
                {diagnosticResult.missingFiles.length > 0 && (
                  <div className="text-red-700 mt-2">
                    Manglende filer: {diagnosticResult.missingFiles.join(', ')}
                  </div>
                )}
                {Object.keys(diagnosticResult.versionMismatches || {}).length > 0 && (
                  <div className="text-red-700 mt-2">
                    <div className="font-medium">Forkerte fil-versioner:</div>
                    {Object.entries(diagnosticResult.versionMismatches).map(([file, versions]) => (
                      <div key={file} className="ml-2 text-xs">
                        {file}: {versions.actual} (forventet: {versions.expected})
                      </div>
                    ))}
                  </div>
                )}
                {!diagnosticResult.allVersionsOk && Object.keys(diagnosticResult.fileVersions || {}).length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    <details>
                      <summary className="cursor-pointer">Vis alle fil-versioner</summary>
                      <div className="mt-1 ml-2">
                        {Object.entries(diagnosticResult.fileVersions).map(([file, version]) => (
                          <div key={file}>{file}: {version}</div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
                {diagnosticResult.error && (
                  <div className="text-red-700 mt-2">Fejl: {diagnosticResult.error}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Connection Details (when authenticated) */}
        {connectionStatus.authenticated && (
          <>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Sidste synkronisering</span>
              </div>
              <span className="font-medium text-gray-900">
                {formatLastSync(connectionStatus.lastSyncTime)}
              </span>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Token udlober om</span>
              </div>
              <span className="font-medium text-gray-900">{formatTokenExpiry()}</span>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Server tid</span>
              </div>
              <span className="text-sm text-gray-500">
                {connectionStatus.serverTime
                  ? new Date(connectionStatus.serverTime).toLocaleTimeString('da-DK')
                  : '-'}
              </span>
            </div>

            {/* Sync Button */}
            <div className="p-4">
              <div className="flex gap-3">
                <button
                  onClick={() => handleSync(false)}
                  disabled={isSyncing || !connectionStatus.authenticated}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Synkroniserer...' : 'Synkroniser nu'}
                </button>
                <button
                  onClick={() => handleSync(true)}
                  disabled={isSyncing || !connectionStatus.authenticated}
                  className="py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  title="Fuld synkronisering - sender alle data"
                >
                  Fuld sync
                </button>
              </div>

              {/* Sync Progress */}
              {syncProgress && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{syncProgress.message}</span>
                  </div>
                  {syncProgress.total > 0 && (
                    <div className="mt-2">
                      <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs text-blue-600 mt-1">
                        {syncProgress.current} / {syncProgress.total}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sync Result */}
              {lastSyncResult && !isSyncing && (
                <div
                  className={`mt-3 p-3 rounded-lg ${
                    lastSyncResult.success ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {lastSyncResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div
                        className={`font-medium ${
                          lastSyncResult.success ? 'text-green-800' : 'text-red-800'
                        }`}
                      >
                        {lastSyncResult.success ? 'Synkronisering gennemfort' : 'Synkronisering fejlede'}
                      </div>
                      {lastSyncResult.success ? (
                        <div className="text-sm text-green-700 mt-1">
                          Sendt: {lastSyncResult.pushed.members} medlemmer,{' '}
                          {lastSyncResult.pushed.checkIns} check-ins,{' '}
                          {lastSyncResult.pushed.practiceSessions} sessioner
                          <br />
                          Modtaget: {lastSyncResult.pulled.members} medlemmer,{' '}
                          {lastSyncResult.pulled.checkIns} check-ins,{' '}
                          {lastSyncResult.pulled.practiceSessions} sessioner
                          {lastSyncResult.pendingDeletes > 0 && (
                            <span className="text-yellow-700">
                              <br />
                              {lastSyncResult.pendingDeletes} sletninger afventer godkendelse
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-red-700 mt-1">
                          {lastSyncResult.error}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        Varighed: {(lastSyncResult.duration / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Verify Sync Button */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={handleVerifySync}
                  disabled={isVerifying || !connectionStatus.authenticated || isSyncing}
                  className="w-full py-2 px-4 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle className={`w-5 h-5 ${isVerifying ? 'animate-pulse' : ''}`} />
                  {isVerifying ? 'Verificerer...' : 'Verificer synkronisering'}
                </button>

                {/* Verification Result */}
                {verificationResult && !isVerifying && (
                  <div
                    className={`mt-3 p-3 rounded-lg ${
                      verificationResult.allMatch ? 'bg-green-50' : 'bg-yellow-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {verificationResult.allMatch ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <div
                          className={`font-medium ${
                            verificationResult.allMatch ? 'text-green-800' : 'text-yellow-800'
                          }`}
                        >
                          {verificationResult.allMatch
                            ? 'Alle data er synkroniseret!'
                            : `${verificationResult.discrepancies.length} tabeller har forskelle`}
                        </div>

                        {verificationResult.error && (
                          <div className="text-sm text-red-700 mt-1">
                            Fejl: {verificationResult.error}
                          </div>
                        )}

                        {verificationResult.discrepancies.length > 0 && (
                          <div className="mt-2 text-sm">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-yellow-800">
                                  <th className="pr-2">Tabel</th>
                                  <th className="pr-2 text-right">Lokal</th>
                                  <th className="pr-2 text-right">Online</th>
                                  <th className="text-right">Forskel</th>
                                </tr>
                              </thead>
                              <tbody className="text-yellow-700">
                                {verificationResult.discrepancies.map((d) => (
                                  <tr key={d.table}>
                                    <td className="pr-2">{d.table}</td>
                                    <td className="pr-2 text-right">{d.localCount}</td>
                                    <td className="pr-2 text-right">{d.remoteCount}</td>
                                    <td className="text-right">
                                      {d.difference > 0 ? '+' : ''}
                                      {d.difference}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {verificationResult.allMatch && verificationResult.localCounts && (
                          <div className="mt-2 text-sm text-green-700">
                            <details>
                              <summary className="cursor-pointer hover:text-green-800">
                                Vis antal pr. tabel
                              </summary>
                              <table className="w-full text-left mt-2">
                                <thead>
                                  <tr>
                                    <th className="pr-2">Tabel</th>
                                    <th className="text-right">Antal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(verificationResult.localCounts).map(([table, count]) => (
                                    <tr key={table}>
                                      <td className="pr-2">{table}</td>
                                      <td className="text-right">{count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Lock className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Forbind til online database</h2>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Indtast adgangskoden for at forbinde til den online database på
                iss-skydning.dk.
              </p>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isAuthenticating) {
                      handleAuthenticate();
                    }
                  }}
                  placeholder="Adgangskode"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-12"
                  autoFocus
                  disabled={isAuthenticating || Boolean(retryAfterSeconds && retryAfterSeconds > 0)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Error message */}
              {authError && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm text-red-700">{authError}</div>
                    {attemptsRemaining !== undefined && attemptsRemaining > 0 && (
                      <div className="text-xs text-red-600 mt-1">
                        {attemptsRemaining} forsog tilbage
                      </div>
                    )}
                    {retryAfterSeconds && retryAfterSeconds > 0 && (
                      <div className="text-xs text-red-600 mt-1">
                        Vent {retryAfterSeconds} sekunder
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAuthModal(false)}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Annuller
              </button>
              <button
                onClick={handleAuthenticate}
                disabled={
                  isAuthenticating || !password.trim() || Boolean(retryAfterSeconds && retryAfterSeconds > 0)
                }
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAuthenticating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Forbinder...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Forbind
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                Adgangskoden gemmes ikke lokalt. Du skal logge ind igen efter 24 timer.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
