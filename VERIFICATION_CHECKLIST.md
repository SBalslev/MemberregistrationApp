# Verification Checklist for Member Registration Feature

## Files to Verify Exist

- [x] app/src/main/java/com/club/medlems/data/entity/Entities.kt (modified)
- [x] app/src/main/java/com/club/medlems/data/dao/Daos.kt (modified)
- [x] app/src/main/java/com/club/medlems/data/db/AppDatabase.kt (modified)
- [x] app/src/main/java/com/club/medlems/di/DatabaseModule.kt (modified)
- [x] app/src/main/java/com/club/medlems/MainActivity.kt (modified)
- [x] app/src/main/java/com/club/medlems/ui/attendant/AttendantMenuScreen.kt (modified)
- [x] app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt (created)
- [x] CHANGELOG.md (modified)
- [x] README.md (modified)
- [x] IMPLEMENTATION_SUMMARY.md (created)

## Key Code Points to Verify

### Database Entity
```kotlin
// In Entities.kt - should have NewMemberRegistration data class
@Entity
data class NewMemberRegistration(
    @PrimaryKey val id: String,
    val temporaryId: String,
    val createdAtUtc: Instant,
    val photoPath: String,
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null
)
```

### DAO
```kotlin
// In Daos.kt - should have NewMemberRegistrationDao interface
@Dao
interface NewMemberRegistrationDao {
    @Insert suspend fun insert(registration: NewMemberRegistration)
    @Query("SELECT * FROM NewMemberRegistration ORDER BY createdAtUtc DESC")
    suspend fun allRegistrations(): List<NewMemberRegistration>
    @Query("SELECT * FROM NewMemberRegistration WHERE id = :id")
    suspend fun get(id: String): NewMemberRegistration?
    @Delete suspend fun delete(registration: NewMemberRegistration)
    @Query("DELETE FROM NewMemberRegistration")
    suspend fun deleteAll()
}
```

### Database Version
```kotlin
// In AppDatabase.kt - version should be 5
@Database(
    entities = [Member::class, CheckIn::class, PracticeSession::class, ScanEvent::class, NewMemberRegistration::class],
    version = 5,
    exportSchema = true
)
```

### Migration
```kotlin
// In DatabaseModule.kt - should have MIGRATION_4_5
private val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS NewMemberRegistration (...)
        """)
    }
}
```

### Navigation
```kotlin
// In MainActivity.kt - should have Registration route
data object Registration: NavRoute("registration")

// And composable:
composable(NavRoute.Registration.route) {
    com.club.medlems.ui.attendant.RegistrationScreen(onBack = { navController.popBackStack() })
}
```

### Admin Menu
```kotlin
// In AttendantMenuScreen.kt - should have:
// 1. openRegistration parameter
// 2. PersonAdd icon import
// 3. Button with "Tilmeld nyt medlem"
Button(onClick = { attendant.registerInteraction(); openRegistration() }, ...) {
    Icon(Icons.Default.PersonAdd, contentDescription = null)
    Spacer(Modifier.width(8.dp))
    Text("Tilmeld nyt medlem")
}
```

## Build Commands to Test

```powershell
# Clean build
.\gradlew.bat clean

# Compile Kotlin
.\gradlew.bat :app:compileDebugKotlin

# Build APK
.\gradlew.bat :app:assembleDebug

# Run lint
.\gradlew.bat :app:lintDebug
```

## Manual Testing Steps

1. **Launch App**: Ensure app starts without crashes
2. **Open Admin**: Tap Admin button, enter PIN (3715)
3. **Access Registration**: Tap "Tilmeld nyt medlem" button
4. **Camera Permission**: Grant camera permission if prompted
5. **Take Photo**: Use front camera to capture photo
6. **Save Without Guardian**: Save registration without guardian info
7. **Verify Storage**: Check DCIM/Nyt medlem folder for photo
8. **Take Another Photo**: Retake photo
9. **Add Guardian Info**: Check "Dette er en barnetilmelding" checkbox
10. **Fill Guardian Fields**: Enter guardian name, phone, email
11. **Save With Guardian**: Save registration
12. **Verify Guardian File**: Check for {filename}_vaerge.txt file
13. **Navigation**: Verify return to Admin menu after save

## Expected Behaviors

- ✅ Front camera opens automatically
- ✅ Large camera button at bottom of screen
- ✅ Photo saved with NYT_YYYYMMDD_HHmmss.jpg format
- ✅ Temporary ID generated as NYT-{timestamp}
- ✅ Guardian checkbox shows/hides guardian fields
- ✅ All three guardian fields are optional
- ✅ Save button shows loading indicator while saving
- ✅ Success message shown after save
- ✅ Auto-return to admin menu after 2 seconds
- ✅ All UI in Danish language

## Common Issues to Check

1. **Camera not working**: Check CAMERA permission in AndroidManifest.xml
2. **Photos not saving**: Verify WRITE_EXTERNAL_STORAGE for API ≤28
3. **Build errors**: Ensure all imports are correct
4. **Database migration fails**: Check MIGRATION_4_5 SQL syntax
5. **Navigation crash**: Verify openRegistration callback passed in MainActivity
6. **UI not showing**: Check composable added to NavHost

## Success Criteria

- [ ] App builds without errors
- [ ] No lint warnings for new code
- [ ] Database migration executes successfully
- [ ] Registration screen accessible from Admin menu
- [ ] Photos save to correct SD card location
- [ ] Guardian info saves to text file when provided
- [ ] Temporary ID format correct (NYT-{timestamp})
- [ ] All UI text in Danish
- [ ] Navigation works correctly
- [ ] No crashes during registration flow
