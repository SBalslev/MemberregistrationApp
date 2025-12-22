# Member Registration Feature - Implementation Summary

## Overview
Implemented a complete member registration feature for the ISS Skydning Registrering Android app, allowing new members to register directly on the device with photo capture and optional guardian information.

## Changes Made

### 1. Database Changes

#### New Entity: `NewMemberRegistration`
**File**: `app/src/main/java/com/club/medlems/data/entity/Entities.kt`

Added new entity to track member registrations:
```kotlin
@Entity
data class NewMemberRegistration(
    @PrimaryKey val id: String,
    val temporaryId: String,           // NYT-{timestamp}
    val createdAtUtc: Instant,
    val photoPath: String,             // Path to photo on SD card
    val guardianName: String? = null,  // Optional guardian info
    val guardianPhone: String? = null,
    val guardianEmail: String? = null
)
```

#### New DAO: `NewMemberRegistrationDao`
**File**: `app/src/main/java/com/club/medlems/data/dao/Daos.kt`

Added DAO with CRUD operations:
- `insert()`: Save new registration
- `allRegistrations()`: Get all registrations
- `get(id)`: Get specific registration
- `delete()`: Remove registration
- `deleteAll()`: Clear all registrations

#### Database Migration (v4 → v5)
**File**: `app/src/main/java/com/club/medlems/di/DatabaseModule.kt`

Added MIGRATION_4_5 to create the NewMemberRegistration table with proper schema.

#### Database Module Updates
**File**: `app/src/main/java/com/club/medlems/di/DatabaseModule.kt`

- Updated database version from 4 to 5
- Added migration to migration chain
- Added provider for `newMemberRegistrationDao()`

### 2. UI Implementation

#### Registration Screen
**File**: `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

Complete registration flow with three main components:

**A. RegistrationViewModel**
- State management for the registration process
- Photo capture handling
- Guardian information updates
- Database persistence via DAO
- Saves guardian info as text file alongside photo
- Auto-generates temporary ID: `NYT-{timestamp}`

**B. CameraPreview Composable**
- Front-facing camera preview using CameraX
- Photo capture button (camera icon)
- Saves photos to: `DCIM/Nyt medlem/NYT_YYYYMMDD_HHmmss.jpg`
- Handles camera permissions

**C. RegistrationForm Composable**
- Success/error message display
- Checkbox to show/hide guardian fields
- Three optional guardian input fields:
  - Værge navn (Guardian name)
  - Værge telefon (Guardian phone)
  - Værge e-mail (Guardian email)
- "Tag nyt billede" (Retake photo) button
- "Gem" (Save) button with loading indicator
- Auto-returns to admin menu after successful save

#### Navigation Updates
**File**: `app/src/main/java/com/club/medlems/MainActivity.kt`

- Added `NavRoute.Registration` route
- Added registration composable to NavHost
- Passes `onBack` callback for navigation

#### Admin Menu Integration
**File**: `app/src/main/java/com/club/medlems/ui/attendant/AttendantMenuScreen.kt`

- Added "Tilmeld nyt medlem" button with PersonAdd icon
- Added `openRegistration` callback parameter
- Imported `Icons.Default.PersonAdd` and `Icons.Default.BugReport`
- Reorganized button layout for new registration option

### 3. Documentation Updates

#### CHANGELOG.md
Added detailed entry in [Unreleased] section:
- Member Registration Feature description
- All sub-features listed (photo, guardian info, storage, etc.)
- Database version update note (v4 → v5)

#### README.md
Added new "Member Registration (New)" section:
- Access instructions
- Photo capture details
- Storage location
- Temporary ID format
- Guardian information fields
- Language and privacy notes
- Database tracking information

## Technical Details

### Storage Strategy
- **Photos**: Saved to public DCIM directory in "Nyt medlem" folder
- **Guardian Info**: Saved as `{photo_filename}_vaerge.txt` in same directory
- **Format**: Danish date format (dd-MM-yyyy HH:mm) in guardian info file
- **Temporary ID**: NYT-{epoch_milliseconds} for easy sorting and uniqueness

### Permissions
- Uses existing CAMERA permission from manifest
- WRITE_EXTERNAL_STORAGE permission already present for API ≤28
- Modern API 29+ uses scoped storage (DCIM directory accessible without permissions)

### Language
All UI elements in Danish:
- "Tilmeld nyt medlem" (Register new member)
- "Tag billede" (Take photo)
- "Billede taget!" (Photo taken!)
- "Dette er en barnetilmelding (tilføj værge)" (This is a child registration, add guardian)
- "Værge oplysninger (valgfrit)" (Guardian information, optional)
- "Tag nyt billede" (Take new photo)
- "Gem" (Save)
- "Tilmelding gemt!" (Registration saved!)

### Android 6.0.0 Compatibility
The implementation uses:
- CameraX (androidx.camera) - supports API 21+
- Room Database - supports API 14+
- Compose - minSdk 23 (Android 6.0)
- Scoped Storage with fallback for older APIs

## Files Modified
1. `app/src/main/java/com/club/medlems/data/entity/Entities.kt` - Added NewMemberRegistration entity
2. `app/src/main/java/com/club/medlems/data/dao/Daos.kt` - Added NewMemberRegistrationDao
3. `app/src/main/java/com/club/medlems/data/db/AppDatabase.kt` - Updated to v5, added new entity
4. `app/src/main/java/com/club/medlems/di/DatabaseModule.kt` - Added migration and DAO provider
5. `app/src/main/java/com/club/medlems/MainActivity.kt` - Added registration route
6. `app/src/main/java/com/club/medlems/ui/attendant/AttendantMenuScreen.kt` - Added registration button
7. `CHANGELOG.md` - Documented changes
8. `README.md` - Added feature documentation

## Files Created
1. `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt` - Complete registration UI

## Testing Recommendations
1. **Photo Capture**: Test front camera photo capture on actual device
2. **Storage**: Verify photos saved to correct SD card location
3. **Guardian Info**: Test with and without guardian information
4. **Navigation**: Verify back navigation from registration screen
5. **Permissions**: Test camera permission request flow
6. **Database**: Verify registrations saved correctly
7. **Migration**: Test database migration from v4 to v5

## Future Enhancements (Not Implemented)
- CSV export of registrations
- Photo preview before saving
- Edit/delete existing registrations
- Integration with member import to convert temporary IDs to real IDs
- Photo compression/optimization
- Email notification to admin when new registration created
- Barcode/QR code generation for temporary ID

## Notes
- Feature is accessible only via Admin menu (requires PIN)
- No audit trail as per requirements (public feature)
- Guardian information not part of Member entity (stored separately)
- Photos stored on SD card (not in app private storage)
- Implementation follows existing app patterns (Hilt, Compose, Room)
