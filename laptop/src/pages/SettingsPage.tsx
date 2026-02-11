/**
 * Settings page.
 * Configure sync, backup, and app preferences.
 */

import { useState, useEffect } from 'react';
import { Settings, Database, Wifi, Download, Upload, Trash2, CheckCircle, AlertCircle, HardDrive, FileSpreadsheet, Edit2, Save, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { isElectron, getElectronAPI } from '../types/electron';
import { exportDatabase, importDatabase, clearDatabase } from '../database';
import { buildSkvExportWorkbook } from '../utils/skvExport';
import { OnlineSyncSettings } from '../components/settings';
import { ConfirmDialog } from '../components';
import { ImportPage } from './ImportPage';
import { showError } from '../store/toastStore';

interface AppSettings {
  autoSync: boolean;
  syncIntervalMinutes: number;
  showOfflineMembers: boolean;
  theme: 'light' | 'dark' | 'system';
}

// Load initial settings from localStorage
function getInitialSettings(): AppSettings {
  const saved = localStorage.getItem('appSettings');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // Fall through to default
    }
  }
  return {
    autoSync: true,
    syncIntervalMinutes: 5,
    showOfflineMembers: true,
    theme: 'light'
  };
}

export function SettingsPage({ initialTab }: { initialTab?: 'settings' | 'import' } = {}) {
  const [activeTab, setActiveTab] = useState<'settings' | 'import'>(initialTab ?? 'settings');
  const [settings, setSettings] = useState<AppSettings>(getInitialSettings);
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId: string; deviceName: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<{ running: boolean; port: number } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [nameSaveStatus, setNameSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [dbSize] = useState<string>(() => {
    try {
      const data = exportDatabase();
      const sizeKb = Math.round(data.length / 1024);
      return sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    } catch {
      return 'Ukendt';
    }
  });
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [skvExportStatus, setSkvExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [showClearDbConfirm, setShowClearDbConfirm] = useState(false);
  const [showFinalClearConfirm, setShowFinalClearConfirm] = useState(false);

  useEffect(() => {
    // Load device info if running in Electron (async operation)
    async function loadDeviceInfo() {
      if (isElectron()) {
        const api = getElectronAPI();
        const info = await api?.getDeviceInfo();
        setDeviceInfo(info || null);
        
        const status = await api?.getServerStatus();
        setServerStatus(status || null);
      }
    }
    loadDeviceInfo();
  }, []);

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('appSettings', JSON.stringify(newSettings));
  }

  function startEditingName() {
    setEditedName(deviceInfo?.deviceName || '');
    setIsEditingName(true);
  }

  function cancelEditingName() {
    setIsEditingName(false);
    setEditedName('');
    setNameSaveStatus('idle');
  }

  async function saveDeviceName() {
    if (!editedName.trim()) return;

    setNameSaveStatus('saving');
    try {
      const api = getElectronAPI();
      const result = await api?.setDeviceName?.(editedName.trim());

      if (result?.success) {
        setDeviceInfo(prev => prev ? { ...prev, deviceName: result.name || editedName.trim() } : null);
        setIsEditingName(false);
        setNameSaveStatus('success');
        setTimeout(() => setNameSaveStatus('idle'), 2000);
      } else {
        setNameSaveStatus('error');
        setTimeout(() => setNameSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Failed to save device name:', error);
      setNameSaveStatus('error');
      setTimeout(() => setNameSaveStatus('idle'), 3000);
    }
  }

  async function handleExport() {
    setExportStatus('exporting');
    try {
      const data = exportDatabase();
      const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `medlems-backup-${new Date().toISOString().split('T')[0]}.db`;
      a.click();
      
      URL.revokeObjectURL(url);
      setExportStatus('success');
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('error');
      setTimeout(() => setExportStatus('idle'), 3000);
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setImportStatus('importing');
      try {
        const buffer = await file.arrayBuffer();
        await importDatabase(new Uint8Array(buffer));
        setImportStatus('success');
        setTimeout(() => {
          setImportStatus('idle');
          window.location.reload(); // Reload to refresh data (including db size)
        }, 2000);
      } catch (error) {
        console.error('Import failed:', error);
        setImportStatus('error');
        setTimeout(() => setImportStatus('idle'), 3000);
      }
    };

    input.click();
  }

  async function handleSkvExport() {
    setSkvExportStatus('exporting');
    try {
      const { workbook, filename } = buildSkvExportWorkbook();
      const api = isElectron() ? getElectronAPI() : undefined;

      if (api?.showSaveDialog && api?.saveFile) {
        const result = await api.showSaveDialog({
          defaultPath: filename,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        });

        if (!result || result.canceled || !result.filePath) {
          setSkvExportStatus('idle');
          return;
        }

        const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
        const saveResult = await api.saveFile({
          filePath: result.filePath,
          data: new Uint8Array(data)
        });

        if (!saveResult?.success) {
          throw new Error(saveResult?.error || 'SKV export mislykkedes');
        }
      } else {
        XLSX.writeFile(workbook, filename);
      }

      setSkvExportStatus('success');
      setTimeout(() => setSkvExportStatus('idle'), 3000);
    } catch (error) {
      console.error('SKV export failed:', error);
      setSkvExportStatus('error');
      setTimeout(() => setSkvExportStatus('idle'), 3000);
    }
  }

  function handleClearDatabaseFirstConfirm() {
    setShowClearDbConfirm(false);
    setShowFinalClearConfirm(true);
  }

  async function handleClearDatabaseFinal() {
    setShowFinalClearConfirm(false);
    try {
      await clearDatabase();
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear database:', error);
      showError('Kunne ikke slette databasen');
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <nav className="flex px-6" aria-label="Indstillinger navigation">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Indstillinger
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'import'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Importer CSV
          </button>
        </nav>
      </div>

      {activeTab === 'import' ? (
        <div className="flex-1 overflow-y-auto">
          <ImportPage />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Indstillinger</h1>
        <p className="text-gray-600 mb-8">Konfigurer applikationen</p>

        {/* Device Info */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Enhedsoplysninger
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            {deviceInfo && (
              <>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Enhedsnavn</span>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Indtast enhedsnavn"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveDeviceName();
                          if (e.key === 'Escape') cancelEditingName();
                        }}
                      />
                      <button
                        onClick={saveDeviceName}
                        disabled={nameSaveStatus === 'saving' || !editedName.trim()}
                        className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        title="Gem"
                      >
                        {nameSaveStatus === 'saving' ? (
                          <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={cancelEditingName}
                        className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                        title="Annuller"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{deviceInfo.deviceName}</span>
                      {isElectron() && (
                        <button
                          onClick={startEditingName}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Rediger enhedsnavn"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {nameSaveStatus === 'success' && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-100">
                  <span className="text-gray-600">Enheds-ID</span>
                  <span className="font-mono text-sm text-gray-500">{deviceInfo.deviceId}</span>
                </div>
              </>
            )}
            {serverStatus && (
              <div className="flex justify-between items-center py-2 border-t border-gray-100">
                <span className="text-gray-600">Sync-server</span>
                <span className="flex items-center gap-2">
                  {serverStatus.running ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-600">Port {serverStatus.port}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-600">Ikke aktiv</span>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Administration */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Administration
          </h2>
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">SKV eksport</div>
                <div className="text-sm text-gray-500">Eksporter SKV registreringer og våben</div>
              </div>
              <button
                onClick={handleSkvExport}
                disabled={skvExportStatus === 'exporting'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {skvExportStatus === 'exporting' ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : skvExportStatus === 'success' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                {skvExportStatus === 'success' ? 'Eksporteret!' : 'Eksporter SKV'}
              </button>
            </div>
            {skvExportStatus === 'error' && (
              <div className="px-4 pb-4 text-sm text-red-600">Eksport mislykkedes. Prøv igen.</div>
            )}
          </div>
        </section>

        {/* Online Sync Settings */}
        <OnlineSyncSettings />

        {/* Sync Settings */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Synkronisering
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">Automatisk synkronisering</div>
                <div className="text-sm text-gray-500">Synkroniser automatisk med tablets</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoSync}
                  onChange={(e) => updateSetting('autoSync', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">Synkroniseringsinterval</div>
                <div className="text-sm text-gray-500">Hvor ofte skal der synkroniseres</div>
              </div>
              <select
                value={settings.syncIntervalMinutes}
                onChange={(e) => updateSetting('syncIntervalMinutes', Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>Hvert minut</option>
                <option value={5}>Hvert 5. minut</option>
                <option value={15}>Hvert 15. minut</option>
                <option value={30}>Hvert 30. minut</option>
              </select>
            </div>
          </div>
        </section>

        {/* Database */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Database
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-gray-400" />
                <div>
                  <div className="font-medium text-gray-900">Database størrelse</div>
                  <div className="text-sm text-gray-500">Lokal SQLite database</div>
                </div>
              </div>
              <span className="font-mono text-gray-900">{dbSize}</span>
            </div>
            <div className="p-4">
              <div className="flex gap-3">
                <button
                  onClick={handleExport}
                  disabled={exportStatus === 'exporting'}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {exportStatus === 'exporting' ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : exportStatus === 'success' ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  {exportStatus === 'success' ? 'Eksporteret!' : 'Eksporter backup'}
                </button>
                <button
                  onClick={handleImport}
                  disabled={importStatus === 'importing'}
                  className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {importStatus === 'importing' ? (
                    <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                  ) : importStatus === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                  {importStatus === 'success' ? 'Importeret!' : 'Importer backup'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-red-600 mb-4">Farezone</h2>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-red-800">Slet alle data</div>
                <div className="text-sm text-red-600 mt-1">
                  Dette vil permanent slette alle medlemmer, check-ins, udstyr og indstillinger.
                  Denne handling kan ikke fortrydes.
                </div>
              </div>
              <button
                onClick={() => setShowClearDbConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                Slet alt
              </button>
            </div>
          </div>
        </section>

        {/* App Info */}
        <section className="text-center text-sm text-gray-500 py-8">
          <p>Medlems Admin v1.0.0</p>
          <p className="mt-1">© 2026 ISS Skydning</p>
        </section>
      </div>

      {/* First Clear Database Confirmation */}
      <ConfirmDialog
        isOpen={showClearDbConfirm}
        onClose={() => setShowClearDbConfirm(false)}
        onConfirm={handleClearDatabaseFirstConfirm}
        title="Slet alle data?"
        message="Er du sikker på at du vil slette alle data? Dette kan ikke fortrydes."
        confirmText="Fortsæt"
        cancelText="Annuller"
        variant="danger"
      />

      {/* Final Clear Database Confirmation */}
      <ConfirmDialog
        isOpen={showFinalClearConfirm}
        onClose={() => setShowFinalClearConfirm(false)}
        onConfirm={handleClearDatabaseFinal}
        title="SIDSTE ADVARSEL"
        message="Alle medlemmer, check-ins og udstyr vil blive slettet permanent. Denne handling kan IKKE fortrydes."
        confirmText="Slet alt permanent"
        cancelText="Annuller"
        variant="danger"
      />
      </div>
      )}
    </div>
  );
}
