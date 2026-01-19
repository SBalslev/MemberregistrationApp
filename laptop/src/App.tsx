/**
 * Main App component.
 * Sets up the app shell with sidebar navigation and page routing.
 */

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { 
  DashboardPage, 
  MembersPage, 
  RegistrationsPage, 
  EquipmentPage, 
  FinancePage,
  DevicesPage, 
  ConflictsPage, 
  SettingsPage,
  ImportPage
} from './pages';
import { initDatabase, getPendingRegistrations, processSyncPayload, processInitialSyncPayload, getMemberDataForFullSync, type SyncPayload } from './database';
import { useAppStore } from './store';
import { isElectron, getElectronAPI } from './types/electron';

function App() {
  const { isDbInitialized, setDbInitialized, currentPage, setPendingRegistrationCount } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Refresh pending count (called after sync receives new registrations)
  const refreshPendingCount = useCallback(() => {
    const pending = getPendingRegistrations();
    setPendingRegistrationCount(pending.length);
  }, [setPendingRegistrationCount]);

  useEffect(() => {
    async function init() {
      try {
        await initDatabase();
        setDbInitialized(true);
        // Load pending registration count for sidebar badge
        refreshPendingCount();
        
        // Set up sync listener if running in Electron
        if (isElectron()) {
          const api = getElectronAPI();
          
          // Listen for incoming sync pushes from tablets
          api?.onIncomingPush(async (payload: unknown) => {
            console.log('[App] Received sync push:', payload);
            setSyncStatus('Synkroniserer...');
            
            try {
              const result = await processSyncPayload(payload as SyncPayload);
              console.log('[App] Sync result:', result);
              
              // Refresh the pending count after sync
              refreshPendingCount();
              
              if (result.registrationsAdded > 0) {
                setSyncStatus(`${result.registrationsAdded} nye registreringer modtaget`);
              } else {
                setSyncStatus('Synkroniseret');
              }
              
              // Clear status after 3 seconds
              setTimeout(() => setSyncStatus(null), 3000);
            } catch (err) {
              console.error('[App] Sync error:', err);
              setSyncStatus('Synkroniseringsfejl');
              setTimeout(() => setSyncStatus(null), 5000);
            }
          });

          // FR-23: Listen for initial sync requests from tablets
          api?.onInitialSyncRequest(async (payload: unknown) => {
            console.log('[App] Initial sync request:', payload);
            setSyncStatus('Indledende synkronisering...');
            
            try {
              const result = await processInitialSyncPayload(payload as SyncPayload);
              console.log('[App] Initial sync result:', result);
              
              // Send result back to main process
              api?.sendInitialSyncResult({
                success: result.success,
                checkInsAdded: result.checkInsAdded,
                sessionsAdded: result.sessionsAdded,
                registrationsAdded: result.registrationsAdded,
                membersReceived: result.membersReceived,
                memberConflicts: result.memberConflicts,
                errors: result.errors
              });
              
              // Refresh pending count
              refreshPendingCount();
              
              const msg = `Modtaget: ${result.checkInsAdded} check-ins, ${result.sessionsAdded} sessioner`;
              setSyncStatus(msg);
              setTimeout(() => setSyncStatus(null), 5000);
            } catch (err) {
              console.error('[App] Initial sync error:', err);
              setSyncStatus('Fejl ved indledende synkronisering');
              setTimeout(() => setSyncStatus(null), 5000);
            }
          });

          // FR-23: Listen for member data requests (tablet wants full member list)
          api?.onMembersRequest(() => {
            console.log('[App] Members request received');
            
            try {
              const members = getMemberDataForFullSync();
              api?.sendMemberData({
                members,
                count: members.length,
                timestamp: new Date().toISOString()
              });
              console.log(`[App] Sent ${members.length} members to tablet`);
            } catch (err) {
              console.error('[App] Error sending member data:', err);
            }
          });

          // ===== Promise-based IPC handlers for sync data =====
          
          // Handle sync:get-members - main process requests member data
          api?.onGetMembersRequest?.(() => {
            console.log('[App] IPC get-members request');
            const members = getMemberDataForFullSync();
            return {
              members,
              count: members.length,
              timestamp: new Date().toISOString()
            };
          });

          // Handle sync:process-push - main process sends incoming sync data
          api?.onProcessPushRequest?.(async (payload) => {
            console.log('[App] IPC process-push request:', 
              `${payload.entities.checkIns?.length || 0} check-ins, ` +
              `${payload.entities.practiceSessions?.length || 0} sessions, ` +
              `${payload.entities.newMemberRegistrations?.length || 0} registrations`
            );
            
            setSyncStatus('Synkroniserer...');
            
            try {
              const result = await processSyncPayload(payload as SyncPayload);
              
              // Refresh pending count after sync
              refreshPendingCount();
              
              const accepted = 
                (result.registrationsAdded || 0) + 
                (result.registrationsUpdated || 0) +
                (result.checkInsAdded || 0) +
                (result.sessionsAdded || 0);
              
              if (accepted > 0) {
                setSyncStatus(`${accepted} elementer modtaget`);
              } else {
                setSyncStatus('Synkroniseret');
              }
              setTimeout(() => setSyncStatus(null), 3000);
              
              return {
                accepted,
                errors: result.errors || []
              };
            } catch (err) {
              console.error('[App] Process push error:', err);
              setSyncStatus('Synkroniseringsfejl');
              setTimeout(() => setSyncStatus(null), 5000);
              return {
                accepted: 0,
                errors: [err instanceof Error ? err.message : 'Unknown error']
              };
            }
          });
          
          console.log('[App] Sync listener registered');
        }
      } catch (err) {
        console.error('Failed to initialize database:', err);
        setError(err instanceof Error ? err.message : 'Database initialization failed');
      }
    }
    init();
  }, [setDbInitialized, refreshPendingCount]);

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-red-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-700 mb-2">Fejl ved opstart</h1>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!isDbInitialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Indlæser...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden bg-gray-50 relative">
        <PageRouter currentPage={currentPage} />
        
        {/* Sync status toast */}
        {syncStatus && (
          <div className="absolute bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>{syncStatus}</span>
          </div>
        )}
      </main>
    </div>
  );
}

function PageRouter({ currentPage }: { currentPage: string }) {
  switch (currentPage) {
    case 'dashboard':
      return <DashboardPage />;
    case 'members':
      return <MembersPage />;
    case 'registrations':
      return <RegistrationsPage />;
    case 'equipment':
      return <EquipmentPage />;
    case 'finance':
      return <FinancePage />;
    case 'devices':
      return <DevicesPage />;
    case 'conflicts':
      return <ConflictsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'import':
      return <ImportPage />;
    default:
      return <DashboardPage />;
  }
}

export default App;
