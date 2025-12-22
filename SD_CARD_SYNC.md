# SD Card Auto-Sync Implementation

## Overview
This implementation adds automatic import/export functionality for member data and backups using an SD card.

## Features Implemented

### 1. **Automatic Member Import**
- Monitors `SD:/Medlemscheckin/members_import.csv` for changes
- Imports only when file has been modified since last import
- Uses existing `CsvService.importMembers()` logic
- Skips duplicates and handles merge strategy
- Tracks last import timestamp to prevent re-processing

### 2. **Automatic Backup Export**
- Exports check-ins to `SD:/Medlemscheckin/checkins_backup.csv`
- Exports practice sessions to `SD:/Medlemscheckin/sessions_backup.csv`
- Only exports when new data is available (tracked by timestamp)
- Runs hourly when auto-sync is enabled

### 3. **User Interface**
- Toggle switch to enable/disable auto-sync
- Manual "Sync Now" button for immediate synchronization
- Status messages showing import/export results
- File location information displayed to user

### 4. **Configuration**
- Sync interval: 1 hour (configurable via `SYNC_INTERVAL_MS`)
- Persistent preferences using SharedPreferences
- Auto-starts on app launch if previously enabled

## Files Created/Modified

### New Files:
1. `app/src/main/java/com/club/medlems/domain/prefs/SdCardSyncPreferences.kt`
   - Manages sync settings and timestamps
   - Singleton injected via Hilt

2. `app/src/main/java/com/club/medlems/domain/csv/SdCardSyncManager.kt`
   - Core sync logic
   - Background coroutine for hourly sync
   - SD card detection and path resolution
   - Import/export orchestration

### Modified Files:
1. `app/src/main/java/com/club/medlems/MedlemsApp.kt`
   - Added auto-sync startup on app launch

2. `app/src/main/java/com/club/medlems/ui/importexport/ImportExportScreen.kt`
   - Added SD card sync UI section
   - Updated ViewModel with sync manager dependencies

## Technical Details

### SD Card Detection
The implementation uses `context.getExternalFilesDirs(null)` to find removable storage:
- Detects SD card via `Environment.isExternalStorageRemovable()`
- Falls back to primary external storage for testing
- Creates `Medlemscheckin` folder if not exists

### Sync Strategy
- **Import**: File modification timestamp comparison
- **Export**: Time-based (exports after sync interval has passed)
- **Concurrency**: Uses Kotlin coroutines with `SupervisorJob()` for fault tolerance

### Error Handling
- Catches all exceptions during sync operations
- Logs errors with Android Log
- Shows user-friendly error messages in UI
- Continues operation even if one part fails

## Usage

### For Users:
1. Enable auto-sync in Import/Export screen
2. Place `members_import.csv` on SD card in `Medlemscheckin` folder
3. App will automatically:
   - Import new/updated members hourly
   - Export check-ins and sessions for backup

### File Format:
- Import file must match existing CSV format (see `CsvService.importMembers()`)
- Backup files use standard export format

## Future Enhancements
- Configurable sync interval via UI
- Selective export (date ranges, filters)
- Import history/audit log
- Conflict resolution UI for member updates
- Background sync service (WorkManager) for better battery efficiency
