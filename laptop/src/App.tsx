/**
 * Main App component.
 * Sets up the app shell with sidebar navigation and page routing.
 */

import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/Toast';
import { showInfo, showError } from './store/toastStore';
import {
  DashboardPage,
  MembersPage,
  MemberActivityOverviewPage,
  EquipmentPage,
  FinancePage,
  DevicesPage,
  ConflictsPage,
  SettingsPage,
  ImportPage,
  TrainersPage
} from './pages';
import { initDatabase, processSyncPayload, processInitialSyncPayload, getMemberDataForFullSync, getEquipmentForSync, getMemberPreferencesForSync, getTrainerDataForSync, runPhotoMigration, isMigrationNeeded, type SyncPayload } from './database';
import { processAllEligibleIdPhotoDeletions } from './services/idPhotoLifecycleService';
import { useAppStore } from './store';
import { isElectron, getElectronAPI } from './types/electron';

// Task 6.6: Periodic pull interval (5 minutes)
const PERIODIC_PULL_INTERVAL_MS = 5 * 60 * 1000;

// Task 6.5: Debounce delay for sync-on-discovery (avoid rapid fire)
const DISCOVERY_SYNC_DEBOUNCE_MS = 3000;

function App() {
  const { isDbInitialized, setDbInitialized, currentPage, triggerSync } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  // Task 6.5: Track last discovery sync to debounce
  const lastDiscoverySyncRef = useRef<number>(0);

  // Task 6.6: Track periodic pull interval
  const periodicPullIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // NOTE: Pending registration count removed - approval workflow deprecated per FR-7.2
  // Trial members are now created directly on tablets and synced as Member entities

  useEffect(() => {
    async function init() {
      try {
        await initDatabase();
        setDbInitialized(true);

        // Run photo migration if needed (converts data URLs to file storage)
        if (isElectron() && isMigrationNeeded()) {
          console.log('[App] Running photo migration...');
          try {
            const migrationResult = await runPhotoMigration();
            console.log('[App] Photo migration complete:', migrationResult);
          } catch (migrationError) {
            console.error('[App] Photo migration error:', migrationError);
            // Don't fail app startup if migration fails
          }
        }

        // Process ID photo deletions for eligible members (membership assigned + fee paid)
        try {
          const deletionResults = processAllEligibleIdPhotoDeletions();
          if (deletionResults.length > 0) {
            const successCount = deletionResults.filter(r => r.success).length;
            console.log(`[App] Processed ${deletionResults.length} ID photo deletions, ${successCount} successful`);
          }
        } catch (deletionError) {
          console.error('[App] ID photo deletion check error:', deletionError);
          // Don't fail app startup if deletion check fails
        }

        // Set up sync listener if running in Electron
        if (isElectron()) {
          const api = getElectronAPI();
          
          // Listen for incoming sync pushes from tablets
          api?.onIncomingPush(async (payload: unknown) => {
            console.log('[App] Received sync push:', payload);
            showInfo('Synkroniserer...');

            try {
              const result = await processSyncPayload(payload as SyncPayload);
              console.log('[App] Sync result:', result);

              if (result.registrationsAdded > 0) {
                showInfo(`${result.registrationsAdded} nye registreringer modtaget`);
              } else {
                showInfo('Synkroniseret');
              }
            } catch (err) {
              console.error('[App] Sync error:', err);
              showError('Synkroniseringsfejl');
            }
          });

          // FR-23: Listen for initial sync requests from tablets
          api?.onInitialSyncRequest(async (payload: unknown) => {
            console.log('[App] Initial sync request:', payload);
            showInfo('Indledende synkronisering...');

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

              showInfo(`Modtaget: ${result.checkInsAdded} check-ins, ${result.sessionsAdded} sessioner`);
            } catch (err) {
              console.error('[App] Initial sync error:', err);
              showError('Fejl ved indledende synkronisering');
            }
          });

          // FR-23: Listen for member data requests (tablet wants full member list)
          api?.onMembersRequest(() => {
            console.log('[App] Members request received');
            
            try {
              const members = getMemberDataForFullSync();
              const { trainerInfos, trainerDisciplines } = getTrainerDataForSync();
              api?.sendMemberData({
                members,
                trainerInfos,
                trainerDisciplines,
                count: members.length,
                timestamp: new Date().toISOString()
              });
              console.log(`[App] Sent ${members.length} members, ${trainerInfos.length} trainer infos, ${trainerDisciplines.length} trainer disciplines to tablet`);
            } catch (err) {
              console.error('[App] Error sending member data:', err);
            }
          });

          // ===== Promise-based IPC handlers for sync data =====
          
          // Handle sync:get-members - main process requests member data
          api?.onGetMembersRequest?.((data) => {
            const deviceType = data?.deviceType || 'MEMBER_TABLET';
            console.log(`[App] IPC get-members request for ${deviceType}`);
            const members = getMemberDataForFullSync();
            // NOTE: NewMemberRegistration sync deprecated per FR-7.3
            // Trial members now sync as Member entities with memberType = TRIAL
            // Keeping empty array for backward compatibility with older tablets
            const registrations: never[] = [];
            // Include equipment data
            const { equipmentItems, equipmentCheckouts } = getEquipmentForSync();
            // Include member preferences only for MEMBER_TABLET devices
            const memberPreferences = deviceType === 'MEMBER_TABLET'
              ? getMemberPreferencesForSync()
              : [];
            const { trainerInfos, trainerDisciplines } = getTrainerDataForSync();
            console.log(`[App] Returning ${members.length} members, ${equipmentItems.length} equipment items, ${memberPreferences.length} preferences, ${trainerInfos.length} trainer infos, ${trainerDisciplines.length} trainer disciplines for sync`);
            return {
              members,
              registrations,
              equipmentItems,
              equipmentCheckouts,
              memberPreferences,
              trainerInfos,
              trainerDisciplines,
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

            showInfo('Synkroniserer...');

            try {
              const result = await processSyncPayload(payload as SyncPayload);

              const accepted =
                (result.registrationsAdded || 0) +
                (result.registrationsUpdated || 0) +
                (result.checkInsAdded || 0) +
                (result.sessionsAdded || 0);

              if (accepted > 0) {
                showInfo(`${accepted} elementer modtaget`);
              } else {
                showInfo('Synkroniseret');
              }

              return {
                accepted,
                errors: result.errors || []
              };
            } catch (err) {
              console.error('[App] Process push error:', err);
              showError('Synkroniseringsfejl');
              return {
                accepted: 0,
                errors: [err instanceof Error ? err.message : 'Unknown error']
              };
            }
          });

          // Task 6.5: Sync-on-discovery - trigger sync when a device is discovered
          api?.onDeviceDiscovered((device) => {
            console.log('[App] Device discovered:', device.name, 'at', device.host);

            // Debounce to avoid rapid sync triggers when multiple devices are discovered
            const now = Date.now();
            if (now - lastDiscoverySyncRef.current > DISCOVERY_SYNC_DEBOUNCE_MS) {
              lastDiscoverySyncRef.current = now;
              console.log('[App] Triggering sync-on-discovery...');
              triggerSync().catch(err => {
                console.error('[App] Sync-on-discovery error:', err);
              });
            } else {
              console.log('[App] Sync-on-discovery debounced');
            }
          });

          // Task 6.6: Start periodic pull interval (5 minutes)
          if (!periodicPullIntervalRef.current) {
            console.log('[App] Starting periodic pull interval (5 minutes)');
            periodicPullIntervalRef.current = setInterval(() => {
              console.log('[App] Periodic pull triggered');
              triggerSync().catch(err => {
                console.error('[App] Periodic pull error:', err);
              });
            }, PERIODIC_PULL_INTERVAL_MS);
          }

          console.log('[App] Sync listener registered');
        }
      } catch (err) {
        console.error('Failed to initialize database:', err);
        setError(err instanceof Error ? err.message : 'Database initialization failed');
      }
    }
    init();

    // Cleanup periodic pull interval on unmount
    return () => {
      if (periodicPullIntervalRef.current) {
        console.log('[App] Cleaning up periodic pull interval');
        clearInterval(periodicPullIntervalRef.current);
        periodicPullIntervalRef.current = null;
      }
    };
  }, [setDbInitialized, triggerSync]);

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
      </main>
      <ToastContainer />
    </div>
  );
}

function PageRouter({ currentPage }: { currentPage: string }) {
  switch (currentPage) {
    case 'dashboard':
      return <DashboardPage />;
    case 'members':
      return <MembersPage />;
    case 'member-activity':
      return <MemberActivityOverviewPage />;
    // NOTE: 'registrations' page removed - approval workflow deprecated per FR-7.2
    // Legacy route redirects to members page (trial members managed there now)
    case 'registrations':
      return <MembersPage />;
    case 'trainers':
      return <TrainersPage />;
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
