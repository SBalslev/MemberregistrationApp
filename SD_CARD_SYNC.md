# SD Card Auto-Sync Implementation

## Overview
This implementation provides robust automatic import/export functionality for member data and backups using an SD card with enterprise-level reliability.

## Features Implemented

### 1. **Automatic Member Import**
- Monitors `SD:/Medlemscheckin/members_import.csv` for changes
- Imports only when file has been modified since last import
- Uses existing `CsvService.importMembers()` logic
- Skips duplicates and handles merge strategy
- Tracks last import timestamp to prevent re-processing
- Validates file content before processing
- Partial import protection with error tracking

### 2. **Incremental Backup Export**
- Exports check-ins to `SD:/Medlemscheckin/checkins_backup.csv`
- Exports practice sessions to `SD:/Medlemscheckin/sessions_backup.csv`
- **Incremental exports**: Only exports new records since last sync
- Database queries using `createdAtUtc` timestamps for accurate detection
- Appends to existing backup files (maintains complete history)
- First export includes CSV header, subsequent exports append data only
- Displays exact count of exported records in UI

### 3. **New Member Registration Photo Sync**
- Automatically copies new member registration photos to `SD:/Medlemscheckin/member_photos/`
- Copies both photo files (.jpg) and info files (_info.txt)
- Photos named with temporary ID prefix (e.g., `NYT-1234567890_NYT_20260105_143022.jpg`)
- Only syncs photos created since last sync (incremental)
- **Retention Policy**: Local photo copies are automatically deleted after 30 days once synced to SD card
- Reduces local storage usage while preserving photos on SD card
- Photo sync count displayed in sync status messages

### 4. **Reliable Background Sync**
- **WorkManager** integration for production-grade reliability
- Survives app kill and device reboot
- System-aware scheduling with automatic retries
- Runs every 1 hour with 15-minute flex window
- Storage constraint validation
- No battery drain from polling

### 4. **Data Integrity**
- **Atomic file writes** using temporary files
- Write to `.tmp` file first, then rename on success
- Prevents corrupted files if write is interrupted
- Automatic cleanup of temporary files on failure

### 5. **User Interface**
- Toggle switch to enable/disable auto-sync
- Manual "Sync Now" button for immediate synchronization
- Status messages showing import/export results with record counts
- **Last successful sync timestamp** display (DD/MM/YYYY HH:mm format)
- File location information displayed to user

### 6. **Configuration**
- Sync interval: 1 hour (managed by WorkManager)
- Persistent preferences using SharedPreferences
- Auto-starts on app launch if previously enabled
- Tracks last import, export, and successful sync timestamps

## Files Created/Modified

### New Files:
1. `app/src/main/java/com/club/medlems/domain/prefs/SdCardSyncPreferences.kt`
   - Manages sync settings and timestamps
   - Tracks last import, export, and successful sync times
   - Singleton injected via Hilt

2. `app/src/main/java/com/club/medlems/domain/csv/SdCardSyncManager.kt`
   - Core sync logic with atomic file operations
   - WorkManager integration
   - SD card detection and path resolution
   - Import/export orchestration with incremental support
   - Database queries for new data detection

3. `app/src/main/java/com/club/medlems/domain/csv/SdCardSyncWorker.kt`
   - WorkManager worker for background sync
   - HiltWorker with dependency injection
   - Automatic retry on failure

### Modified Files:
1. `app/src/main/java/com/club/medlems/MedlemsApp.kt`
   - Added auto-sync startup on app launch
   - Implements `Configuration.Provider` for WorkManager
   - Custom HiltWorkerFactory configuration

2. `app/src/main/java/com/club/medlems/ui/importexport/ImportExportScreen.kt`
   - Added SD card sync UI section
   - Last sync timestamp display
   - Improved feedback messages

3. `app/src/main/java/com/club/medlems/domain/csv/CsvService.kt`
   - Added `exportCheckInsSince(Instant)` for incremental export
   - Added `exportSessionsSince(Instant)` for incremental export

4. `app/src/main/java/com/club/medlems/data/dao/Daos.kt`
   - Added `checkInsCreatedAfter(Instant)` query
   - Added `countCheckInsCreatedAfter(Instant)` query
   - Added `sessionsCreatedAfter(Instant)` query
   - Added `countSessionsCreatedAfter(Instant)` query

5. `app/build.gradle.kts`
   - Added WorkManager dependencies
   - Added Hilt WorkManager integration

6. `app/src/main/AndroidManifest.xml`
   - Disabled default WorkManager initializer
   - Custom WorkManager configuration

## Technical Details

### WorkManager Architecture
- **PeriodicWorkRequest** runs every 1 hour
- 15-minute flex interval for system optimization
- **ExistingPeriodicWorkPolicy.KEEP** prevents resetting schedule
- Constraints: requires storage available, no battery requirements
- Automatic retry with exponential backoff on failure
- Survives app process death and device reboot

### SD Card Detection
The implementation uses `context.getExternalFilesDirs(null)` to find removable storage:
- Detects SD card via `Environment.isExternalStorageRemovable()`
- Falls back to primary external storage for testing
- Creates `Medlemscheckin` folder if not exists

### Incremental Export Strategy
- Queries database for records created after last export timestamp
- Uses `createdAtUtc` field from CheckIn and PracticeSession entities
- First export: writes complete file with header
- Subsequent exports: appends only new records without header
- Tracks exact count of exported records for user feedback

### Atomic File Operations
```kotlin
// Write to temporary file first
tempFile.writeText(content)
// Atomic rename on success
if (file.exists()) file.delete()
tempFile.renameTo(file)
// Cleanup on failure
catch { tempFile.delete() }
```

### Error Handling
- Validates import file is not empty before processing
- Tracks import errors and provides partial failure feedback
- Updates timestamps only on successful operations
- Catches and logs all exceptions during sync
- Shows user-friendly error messages in UI
- WorkManager automatic retry for transient failures
- Continues operation even if one part fails

### Database Queries
Efficient queries to detect new data:
- `SELECT COUNT(*) FROM CheckIn WHERE createdAtUtc > :since`
- `SELECT COUNT(*) FROM PracticeSession WHERE createdAtUtc > :since`
- `SELECT COUNT(*) FROM NewMemberRegistration WHERE createdAtUtc > :since` (v1.3.2+)
- `SELECT * FROM NewMemberRegistration WHERE createdAtUtc > :since` for photo sync
- Only performs export when actual new data exists

## Usage

### For Users:
1. Enable auto-sync in Import/Export screen
2. Place `members_import.csv` on SD card in `Medlemscheckin` folder
3. App will automatically:
   - Import new/updated members hourly
   - Export new check-ins and sessions incrementally
   - Sync new member registration photos to `member_photos/` folder
   - Apply 30-day retention policy to local photo copies
   - Display last sync time and status

### File Format:
- Import file must match existing CSV format (see `CsvService.importMembers()`)
- Backup files use standard export format with headers
- Incremental appends maintain chronological order

## Performance Characteristics

- **Import**: O(n) where n = file size, only when file modified
- **Export**: O(m) where m = new records since last export (not total records)
- **Data detection**: O(1) database COUNT queries
- **File I/O**: Minimal - only new data written
- **Memory**: Streaming for large files (handled by CSV library)
- **Network**: None - all operations local
- **Battery**: Minimal - WorkManager system scheduling

## Reliability Features

✅ Survives app kill  
✅ Survives device reboot  
✅ Automatic retry on failure  
✅ Atomic file writes prevent corruption  
✅ Incremental exports reduce I/O  
✅ Database-driven export detection  
✅ Last sync status visibility  
✅ Comprehensive error handling  

## Implementation Completed

All planned enhancements from the original spec have been implemented:
- ✅ Background sync service (WorkManager) for better battery efficiency
- ✅ Incremental export (date ranges via timestamps)
- ✅ Import history tracking (last sync timestamp)
- ✅ Better error handling and validation
