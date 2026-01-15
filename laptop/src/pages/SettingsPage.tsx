/**
 * Settings page.
 * Configure sync, backup, and app preferences.
 */

import { useState, useEffect } from 'react';
import { Settings, Database, Wifi, Download, Upload, Trash2, CheckCircle, AlertCircle, HardDrive } from 'lucide-react';
import { isElectron, getElectronAPI } from '../types/electron';
import { exportDatabase, importDatabase, clearDatabase } from '../database';

interface AppSettings {
  autoSync: boolean;
  syncIntervalMinutes: number;
  showOfflineMembers: boolean;
  theme: 'light' | 'dark' | 'system';
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    autoSync: true,
    syncIntervalMinutes: 5,
    showOfflineMembers: true,
    theme: 'light'
  });
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId: string; deviceName: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<{ running: boolean; port: number } | null>(null);
  const [dbSize, setDbSize] = useState<string>('Beregner...');
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');

  useEffect(() => {
    loadSettings();
    loadDeviceInfo();
    estimateDbSize();
  }, []);

  async function loadSettings() {
    // In a real app, load from localStorage or database
    const saved = localStorage.getItem('appSettings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }

  async function loadDeviceInfo() {
    if (isElectron()) {
      const api = getElectronAPI();
      const info = await api?.getDeviceInfo();
      setDeviceInfo(info || null);
      
      const status = await api?.getServerStatus();
      setServerStatus(status || null);
    }
  }

  function estimateDbSize() {
    try {
      const data = exportDatabase();
      const sizeKb = Math.round(data.length / 1024);
      setDbSize(sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`);
    } catch {
      setDbSize('Ukendt');
    }
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('appSettings', JSON.stringify(newSettings));
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
        importDatabase(new Uint8Array(buffer));
        setImportStatus('success');
        estimateDbSize();
        setTimeout(() => {
          setImportStatus('idle');
          window.location.reload(); // Reload to refresh data
        }, 2000);
      } catch (error) {
        console.error('Import failed:', error);
        setImportStatus('error');
        setTimeout(() => setImportStatus('idle'), 3000);
      }
    };

    input.click();
  }

  async function handleClearDatabase() {
    if (!confirm('Er du sikker på at du vil slette alle data? Dette kan ikke fortrydes.')) {
      return;
    }
    if (!confirm('SIDSTE ADVARSEL: Alle medlemmer, check-ins og udstyr vil blive slettet permanent.')) {
      return;
    }

    try {
      clearDatabase();
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear database:', error);
      alert('Kunne ikke slette databasen');
    }
  }

  return (
    <div className="h-full overflow-y-auto">
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
                  <span className="font-medium text-gray-900">{deviceInfo.deviceName}</span>
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
                onClick={handleClearDatabase}
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
    </div>
  );
}
