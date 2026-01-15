# Distributed Membership Management System - Design Document

## Introduction/Overview

This feature transforms the existing single-tablet membership check-in application into a distributed three-device system that operates on a local network with offline-first capabilities. The system will consist of:

1. **Tablet 1 (Member App)** - Existing Android app for member self-service check-in and practice session recording
2. **Tablet 2 (Admin App)** - New Android admin app for assisted check-in and equipment management
3. **Laptop (Master Admin App)** - New Windows/browser app for complete membership management

The system must function reliably when devices are offline and automatically synchronize data when connectivity is restored, ensuring no data loss and minimal conflicts.

**Problem Solved:** Current single-device limitation prevents:

- Simultaneous admin oversight during training sessions
- Equipment tracking and checkout management
- Centralized membership data management
- Resilient operation during network interruptions

## Goals

1. Enable three devices to operate independently on a local network with automatic data synchronization
2. Implement offline-first architecture where any device can be unavailable at any time
3. Add equipment checkout management accessible from the admin tablet
4. Create a master membership management system on the laptop
5. Maintain backward compatibility with the existing member check-in workflow
6. Ensure zero data loss during network interruptions and device unavailability
7. Minimize user intervention for network configuration and synchronization

## User Stories

**US-1: Admin Assisted Check-in**

As a club admin, I want to check in members on their behalf from the admin tablet so that I can assist members who don't have their membership cards or need help.

**US-2: Equipment Checkout**

As a club admin, I want to check out training equipment to members and see what equipment is currently checked out so that I can manage our training materials inventory.

**US-3: Master Membership Management**

As a club administrator, I want to manage all membership records from a laptop application so that I can update member information, approve new registrations, and have a complete view of all members.

**US-4: Offline Operations**

As a system user, I want the app to work when the network is down or other devices are offline so that training sessions are never interrupted by technical issues.

**US-5: Automatic Sync**

As a system user, I want devices to automatically discover each other and sync data when they come online so that I don't have to manually configure network settings or trigger synchronization.

**US-6: New Member Registration Approval**

As a club administrator, I want to review new member registrations submitted from tablets and approve them to create official membership records so that I can control membership quality and accuracy.

**US-7: Real-time Practice Session Visibility**

As a club member or admin, I want to see practice sessions recorded across all devices so that performance data is immediately available regardless of which device was used for recording.

## Functional Requirements

### FR-1: Device Roles

**FR-1.1** The system SHALL consist of three device types: Member Tablet, Admin Tablet, and Master Laptop.

**FR-1.2** Member Tablet SHALL maintain existing functionality for member self-service check-in and practice session recording.

**FR-1.3** Admin Tablet SHALL support all member tablet functions plus admin-only features (assisted check-in, equipment management).

**FR-1.3.1** Admin Tablet SHALL be a separate application build, distinct from Member Tablet app.

**FR-1.4** Master Laptop SHALL support a superset of all functionality with exclusive rights to edit membership master data.

**FR-1.5** Display-only tablets SHALL be read-only paired devices that pull and display data without write operations.

**FR-1.6** Display-only tablets SHALL support interactive filtering (member selection, discipline, time period) without modifying data.

### FR-2: Network Architecture

**FR-2.1** All devices SHALL operate on a local network without internet connectivity requirement.

**FR-2.2** Tablets (Member and Admin) SHALL automatically discover each other and sync data without user intervention.

**FR-2.3** Master Laptop SHALL require explicit user action to push membership master data changes to tablets.

**FR-2.4** Master Laptop SHALL automatically receive data from tablets without user intervention.

**FR-2.5** Devices SHALL operate as equal peers for non-master data synchronization.

**FR-2.6** Tablets SHALL sync with each other in peer-to-peer fashion without laptop involvement.

**FR-2.7** Laptop SHALL act as optional coordinator for conflict reconciliation when online.

**FR-2.8** System SHALL support 2-4 tablet devices simultaneously.

### FR-3: Offline-First Operation

**FR-3.1** Each device SHALL function fully when disconnected from the network.

**FR-3.2** All user actions SHALL be recorded locally and queued for synchronization.

**FR-3.3** The system SHALL NOT assume any device will be online at any specific time.

**FR-3.4** When a device reconnects, it SHALL automatically resume synchronization without user action.

### FR-4: Data Synchronization

**FR-4.1** CheckIn and PracticeSession records SHALL sync across all devices and be retained if duplicates exist.

**FR-4.2** Member master data (name, status, membership details) SHALL only be editable on Master Laptop.

**FR-4.3** Member master data changes SHALL be explicitly pushed from Master Laptop to tablets (manual push).

**FR-4.3.1** Master Laptop SHALL automatically pull (receive) data from tablets without user intervention.

**FR-4.4** NewMemberRegistration records SHALL sync from tablets to Master Laptop for approval.

**FR-4.5** ScanEvent records SHALL sync across devices, aggregated by date and member.

**FR-4.6** PracticeSession records SHALL appear on all devices as soon as network connectivity allows.

**FR-4.7** Equipment checkout records SHALL sync across all devices in real-time when online.

### FR-5: Equipment Management (Admin Tablet Only)

**FR-5.1** Admin Tablet SHALL allow checking out equipment to members.

**FR-5.2** Each equipment item SHALL be identified by a serial number and an ID.

**FR-5.2.1** Equipment IDs SHALL be auto-generated using a distributed ID generation scheme (e.g., UUID or device-prefixed sequential ID).

**FR-5.2.2** Serial numbers SHALL be manually entered by admin and used for human-readable identification.

**FR-5.3** Equipment items SHALL be categorized (initially supporting "training material" type).

**FR-5.4** A member SHALL be limited to checking out one equipment item at a time.

**FR-5.5** Admin Tablet SHALL display all currently checked-out equipment with member names.

**FR-5.6** Admin Tablet SHALL allow checking in (returning) equipment from members.

**FR-5.7** If equipment is checked out while offline, the system SHALL prevent duplicate checkouts when syncing.

**FR-5.8** When equipment checkout occurs while a device is offline, other devices SHALL display notification showing checkout details when they sync.

**FR-5.9** When equipment checkout conflicts occur (same item to different members while offline), the system SHALL flag both checkouts for manual resolution by admin.

**FR-5.10** Equipment checkout conflicts SHALL be clearly visible on admin devices with conflict resolution interface.

**FR-5.11** Any admin device (Admin Tablet or Master Laptop) SHALL have authority to resolve equipment checkout conflicts.

**FR-5.12** Conflict resolution performed on one device SHALL sync to all other devices.

### FR-6: Master Data Management (Laptop Only)

**FR-6.1** Master Laptop SHALL provide full CRUD operations for Member records.

**FR-6.2** Master Laptop SHALL display NewMemberRegistration records synced from tablets.

**FR-6.3** Master Laptop SHALL allow approving NewMemberRegistration, converting them to Member records.

**FR-6.4** Master Laptop SHALL display historical CheckIn, PracticeSession, and ScanEvent data for all members.

**FR-6.5** Master Laptop SHALL provide reporting and analytics views across all synchronized data.

**FR-6.6** Changes to Member master data on Laptop SHALL require explicit push to sync to tablets.

### FR-7: Conflict Resolution

**FR-7.1** When duplicate CheckIn records exist for the same member and date, both SHALL be retained.

**FR-7.2** When duplicate PracticeSession records exist, both SHALL be retained.

**FR-7.3** When Member master data conflicts occur, the Master Laptop version SHALL take precedence.

**FR-7.4** When equipment checkout conflicts occur (same item checked out offline on two devices), both SHALL be flagged for manual resolution by admin.

**FR-7.5** System SHALL use device timestamps for ordering events, accepting small time differences between devices.

**FR-7.6** Master data conflicts SHALL be resolved by laptop's "last write wins" policy.

### FR-8: Data Entities

**FR-8.1** System SHALL maintain existing entities: Member, CheckIn, PracticeSession, ScanEvent, NewMemberRegistration.

**FR-8.2** System SHALL add new entity: EquipmentItem with the following schema:

- `id: UUID` - Auto-generated unique identifier
- `serialNumber: String` - Human-readable identifier, manually entered, required
- `type: EquipmentType` - Enum (TrainingMaterial, initially; extensible for future types)
- `description: String` - Max 200 characters, optional
- `status: EquipmentStatus` - Enum (Available, CheckedOut, Maintenance, Retired)
- `deviceId: String` - Device that created this equipment item
- `createdAtUtc: Instant` - Creation timestamp
- `modifiedAtUtc: Instant` - Last modification timestamp
- `syncVersion: Long` - Version for conflict detection
- `syncedAtUtc: Instant?` - Last sync timestamp

**FR-8.3** System SHALL add new entity: EquipmentCheckout with the following schema:

- `id: UUID` - Auto-generated unique identifier
- `equipmentId: UUID` - Foreign key to EquipmentItem
- `membershipId: String` - Foreign key to Member
- `checkedOutAtUtc: Instant` - Checkout timestamp
- `checkedInAtUtc: Instant?` - Return timestamp (null if still checked out)
- `checkedOutByDeviceId: String` - Device that performed checkout
- `checkedInByDeviceId: String?` - Device that performed check-in (null if still out)
- `checkoutNotes: String?` - Optional notes at checkout, max 500 characters
- `checkinNotes: String?` - Optional notes at return, max 500 characters
- `conflictStatus: ConflictStatus?` - Enum (null, Pending, Resolved, Cancelled)
- `deviceId: String` - Device that created this record
- `createdAtUtc: Instant` - Creation timestamp
- `modifiedAtUtc: Instant` - Last modification timestamp
- `syncVersion: Long` - Version for conflict detection
- `syncedAtUtc: Instant?` - Last sync timestamp

**FR-8.4** All entities SHALL include synchronization metadata: deviceId, createdAtUtc, modifiedAtUtc, syncVersion, syncedAtUtc.

**FR-8.5** Entity schemas SHALL remain extensible for future fields (e.g., purchase date, maintenance history) without breaking compatibility.

### FR-9: Member Tablet Modifications

**FR-9.1** Member Tablet SHALL add background synchronization service.

**FR-9.2** Member Tablet SHALL display data entered by admins on the same device.

**FR-9.3** Member Tablet SHALL maintain all existing UI and workflows unchanged.

**FR-9.4** Member Tablet SHALL receive updated Member master data from Master Laptop via sync.

### FR-10: Device Security and Pairing

**FR-10.1** New devices joining the network SHALL require a pairing ceremony using QR code scanning.

**FR-10.2** Master Laptop SHALL generate pairing QR codes for new devices to scan.

**FR-10.3** Tablets SHALL use existing QR scanning capability to scan pairing codes and establish trust.

**FR-10.4** Pairing QR code SHALL contain: device trust token, sync network identifier, and initial sync endpoint.

**FR-10.5** Once a device is paired with one trusted device, that trust SHALL propagate to all devices in the sync network.

**FR-10.6** Unpaired devices SHALL NOT be able to read or write data from the sync network.

**FR-10.7** Admin SHALL be able to revoke trust for a device from the Master Laptop.

### FR-11: Initial Data Bootstrap

**FR-11.1** New devices joining the network SHALL perform a full sync on first connection to receive all existing data.

**FR-11.2** Existing Member Tablet data SHALL be preserved and merged during initial full sync.

**FR-11.3** Full sync operation SHALL be automatic after successful pairing, requiring no user intervention.

### FR-12: Logging and Troubleshooting

**FR-12.1** System SHALL log sync events (initiated, completed, failed) with timestamps for troubleshooting.

**FR-12.2** System SHALL log equipment checkout/checkin events with deviceId for troubleshooting.

**FR-12.3** System SHALL log conflict resolution events for troubleshooting.

**FR-12.4** Logs SHALL be accessible from Master Laptop for system diagnosis.

**FR-12.5** Logs SHALL NOT be user-facing or require interpretation by non-technical users.

### FR-13: Schema Versioning and Compatibility

**FR-13.1** Devices SHALL support backward-compatible schema versions within same major version.

**FR-13.2** For destructive schema changes, all devices SHALL be required to update to matching major version before syncing.

**FR-13.3** Devices SHALL negotiate schema compatibility during sync handshake.

**FR-13.4** If schema versions are incompatible, devices SHALL display clear error message requiring app update.

### FR-14: Backup and Restore

**FR-14.1** All devices (Member Tablet, Admin Tablet, Master Laptop) SHALL perform scheduled automatic backups.

**FR-14.2** Backup files SHALL include complete local database with all synced data.

**FR-14.3** Backups SHALL be stored locally on each device with configurable retention period.

**FR-14.4** All devices SHALL provide restore functionality to recover from backup file.

**FR-14.5** Restore operation SHALL allow selecting backup file and replacing current database.

**FR-14.6** Master Laptop SHALL support exporting backup to external location (USB, network drive).

**FR-14.7** Backup files SHALL be compatible across device types for disaster recovery.

### FR-15: Master Data Push Confirmation

**FR-15.1** When Master Laptop pushes member data changes, user SHALL see explicit confirmation dialog.

**FR-15.2** Push confirmation SHALL show progress: "Pushing to 2/2 tablets" with real-time status.

**FR-15.3** Push confirmation SHALL list which devices successfully received update.

**FR-15.4** If push fails to any device, user SHALL see clear error message with affected device names.

**FR-15.5** User SHALL be able to retry failed pushes from confirmation dialog.

### FR-16: Network Status and Timeouts

**FR-16.1** Devices SHALL wait 60 seconds before marking another device as "offline" vs "syncing".

**FR-16.2** All devices SHALL display current network status: Connected, Syncing, Offline.

**FR-16.3** Devices SHALL show list of discovered paired devices with their online/offline status.

**FR-16.4** Network status SHALL update in real-time as devices join or leave the network.

### FR-17: Member Lookup (Admin Devices)

**FR-17.1** Admin Tablet and Master Laptop SHALL provide member search functionality.

**FR-17.2** Member search SHALL support searching by member name (first name, last name, or both).

**FR-17.3** Member search SHALL support searching by membership ID.

**FR-17.4** Search results SHALL display as user types (live search with minimum 2 characters).

**FR-17.5** Search results SHALL show: membership ID, full name, membership status.

**FR-17.6** Selecting a member from search results SHALL open member details or action menu (check-in, equipment checkout, view history).

**FR-17.7** Member self-service check-in SHALL continue to use QR code scanning on Member Tablet as per existing functionality.

### FR-18: Sync Protocol Specification

**FR-18.1** Devices SHALL communicate using REST API over HTTP on local network.

**FR-18.2** System SHALL define the following REST endpoints:

- `POST /api/sync/push` - Send entity changes to peer device
- `GET /api/sync/pull?since=<ISO8601_timestamp>` - Retrieve changes since timestamp
- `GET /api/sync/status` - Health check and schema version negotiation
- `POST /api/pair` - Initial pairing handshake

**FR-18.3** All sync requests SHALL include Authorization header with JWT token obtained during pairing.

**FR-18.4** Sync payloads SHALL use JSON format containing:

- `schemaVersion: String` - Semantic version (MAJOR.MINOR.PATCH)
- `deviceId: String` - Sending device identifier
- `timestamp: Instant` - Request timestamp
- `entities: Object` - Entity changes grouped by type (members, checkIns, practiceSessions, etc.)

**FR-18.5** Each entity in payload SHALL include full record data plus sync metadata (syncVersion, createdAtUtc, modifiedAtUtc).

**FR-18.6** Devices SHALL batch multiple entity types in single sync request for efficiency.

**FR-18.7** Receiving device SHALL respond with:

- `200 OK` with accepted entity count on success
- `409 Conflict` with conflicting entity details when conflicts detected
- `426 Upgrade Required` when schema versions incompatible
- `401 Unauthorized` when JWT token invalid

**FR-18.8** All sync operations SHALL be idempotent to handle network retries safely.

### FR-19: Equipment Conflict Resolution UI

**FR-19.1** When equipment checkout conflict is detected, affected admin devices SHALL display notification badge on equipment section.

**FR-19.2** Equipment view SHALL have dedicated "Conflicts" section showing all pending conflicts.

**FR-19.3** Each conflict entry SHALL display:

- Equipment serial number and ID
- First checkout: Member name, timestamp, device name
- Second checkout: Member name, timestamp, device name
- Time difference between checkouts

**FR-19.4** Tapping/clicking a conflict SHALL open conflict resolution dialog.

**FR-19.5** Conflict resolution dialog SHALL present two options:

- "Keep First Checkout" - Cancel second checkout, equipment remains with first member
- "Reassign Equipment" - Cancel first checkout, reassign equipment to second member

**FR-19.6** Conflict resolution dialog SHALL show clear consequences of each action.

**FR-19.7** Upon resolution selection, system SHALL:

- Update conflictStatus to Resolved for kept checkout
- Update conflictStatus to Cancelled for rejected checkout
- Sync resolution immediately to all devices
- Remove conflict from pending list

**FR-19.8** Cancelled checkouts SHALL be retained in database for audit purposes but marked as inactive.

### FR-20: Display Tablet Detailed Requirements

**FR-20.1** System SHALL support two types of display tablets:

- **Equipment Display**: Shows equipment availability status
- **Practice Session Display**: Shows practice performance data

**FR-20.2** Equipment Display SHALL show:

- List of all equipment with status (Available, Checked Out, Maintenance)
- For checked-out items: member name and checkout time
- Large, readable font optimized for viewing from distance
- Green/red color coding for availability status

**FR-20.3** Practice Session Display SHALL rotate through these views automatically:

- Recent practice session results (last 10-20 sessions)
- Leaderboard by discipline (pistol, rifle, shotgun) - top 10 scores
- Top movers (biggest score improvements this week)
- Most stable shooter (lowest score variance this month)
- Most improved shooter this month (highest average increase)

**FR-20.4** Display tablets SHALL rotate views every 30 seconds by default (configurable per device).

**FR-20.5** Practice Session Display SHALL support interactive filtering:

- Discipline dropdown (All, Pistol, Rifle, Shotgun)
- Time period dropdown (Today, This Week, This Month, Custom)
- Member filter (All Members, or select specific member)

**FR-20.6** When user interacts with filters, rotation SHALL pause.

**FR-20.7** After 60 seconds of idle time (no user interaction), display SHALL revert to default rotation (All disciplines, This Week, All Members).

**FR-20.8** Display tablets SHALL refresh data via sync every 10-30 seconds (configurable).

**FR-20.9** Display tablets SHALL NOT provide any data entry controls (no keyboards, no forms).

**FR-20.10** Display tablets SHALL show prominent "Display Mode" indicator at top of screen.

### FR-21: NewMemberRegistration Approval Workflow

**FR-21.1** Master Laptop SHALL display NewMemberRegistration queue showing all pending registrations.

**FR-21.2** Registration queue SHALL show: registration date, member name, membership ID (if provided), registration device.

**FR-21.3** Selecting a registration SHALL open approval dialog with full registration details.

**FR-21.4** Approval dialog SHALL allow admin to edit all member fields:

- First name, last name
- Membership ID (generate if not provided)
- Email, phone
- Membership type, status
- Any other Member entity fields

**FR-21.5** Approval dialog SHALL provide two actions:

- "Approve & Create Member" - Creates Member record, marks registration as approved
- "Reject Registration" - Soft deletes registration (marks as rejected, retains for records)

**FR-21.6** Upon approval, system SHALL:

- Create new Member record with edited/confirmed data
- Mark NewMemberRegistration as approved with timestamp
- Store link between registration and created member (registrationId in Member table)

**FR-21.7** Approved members SHALL NOT automatically sync to tablets.

**FR-21.8** Admin MUST explicitly push master data using "Push Master Data" button to sync new members to tablets.

**FR-21.9** Rejected registrations SHALL remain in database marked as rejected, visible in admin-only archive view.

**FR-21.10** Rejection SHALL include optional rejection reason field (max 500 characters).

### FR-22: Device Pairing Ceremony Flow

**FR-22.1** Master Laptop SHALL provide "Add New Device" button in settings/admin panel.

**FR-22.2** Clicking "Add New Device" SHALL:

- Prompt admin to select device type (Member Tablet, Admin Tablet, Display Tablet)
- Prompt admin to enter friendly device name (e.g., "Admin Tablet 1", "Display - Main Hall")
- Generate pairing QR code containing: JWT trust token, sync network ID, laptop endpoint URL
- Display QR code full-screen with instructions: "Scan this code from the new device"

**FR-22.3** QR code SHALL remain valid for 5 minutes, then expire requiring regeneration.

**FR-22.4** New tablet SHALL display "Pair with Network" button on first launch or in settings.

**FR-22.5** Clicking "Pair with Network" SHALL open camera for QR code scanning.

**FR-22.6** After scanning QR code, tablet SHALL:

- Display "Pairing with [Network Name]..." progress indicator
- Attempt connection to laptop endpoint
- Perform authentication handshake with JWT token
- Receive device ID, trusted device list, and initial sync endpoint

**FR-22.7** Upon successful pairing, tablet SHALL:

- Display "Connected to [Network Name]" confirmation
- Store device ID, trust token, and network configuration
- Automatically initiate full sync to receive all existing data
- Show home screen with sync status indicator

**FR-22.8** Upon successful pairing, laptop SHALL:

- Display notification: "Device paired: [Device Name] ([Device Type])"
- Add device to trusted device list
- Begin syncing trust list to all other paired devices (trust propagation)

**FR-22.9** If pairing fails (timeout, network error, invalid QR), tablet SHALL:

- Display error message: "Pairing failed: [Error reason]"
- Provide "Retry" button to scan QR again
- Provide "Cancel" button to return to settings

**FR-22.10** Pairing timeout SHALL be 30 seconds from QR scan to connection established.

**FR-22.11** Laptop SHALL maintain list of all paired devices with: device name, device type, last seen timestamp, pairing date.

**FR-22.12** Laptop SHALL provide "Revoke Trust" action for each paired device, removing it from sync network.

### FR-23: Initial Data Migration Strategy

**FR-23.1** Master Laptop SHALL support importing existing member data from CSV or database file.

**FR-23.2** Import process SHALL map CSV columns to Member entity fields with validation.

**FR-23.3** Import SHALL preserve membership IDs from existing system to maintain consistency.

**FR-23.4** After importing member data, laptop SHALL be designated as master data authority.

**FR-23.5** When existing Member Tablet pairs with laptop for first time, laptop SHALL push master member data to tablet.

**FR-23.6** If conflicts exist (same membership ID with different data), laptop version SHALL always win.

**FR-23.7** Member Tablet's historical CheckIn and PracticeSession data SHALL be preserved and merged during initial sync.

**FR-23.8** Initial sync SHALL not overwrite or delete any CheckIn or PracticeSession records from existing tablet.

**FR-23.9** After initial sync completes, both devices SHALL have:

- Complete member list from laptop
- Complete historical practice/check-in data from tablet
- Synchronized state ready for ongoing operation

**FR-23.10** Migration SHALL be one-time operation; subsequent syncs follow normal delta sync protocol.

## Non-Goals (Out of Scope)

1. **Cloud/Internet Sync** - This system operates exclusively on local networks; no cloud infrastructure or internet connectivity.

2. **Member Access from Multiple Devices** - Members can only see their data from the device they physically access; no multi-device personal accounts.

3. **Real-time Collaboration UI** - No live cursors, presence indicators, or collaborative editing interfaces.

4. **Complex Equipment Tracking** - No maintenance schedules, damage reporting, or equipment history beyond checkout/checkin.

5. **Advanced Conflict Resolution UI** - No manual conflict resolution interfaces; system uses predetermined rules.

6. **Mobile Device Cross-Platform** - Tablets are Android only; no iOS version.

7. **Laptop Native App** - Laptop app may be browser-based; native Windows app is optional.

8. **Historical Sync** - Only new/changed data syncs; no full historical re-sync unless explicitly requested.

9. **Member Profile Sync Across Sessions** - Member authentication/profiles are device-local; no shared login across devices.

10. **Automated Member Migration** - NewMemberRegistration approval is manual; no automated migration to Member records.

11. **Display Tablet Write Operations** - Display-only tablets cannot create check-ins, practice sessions, or equipment checkouts.

12. **Real-time Display Updates** - Display tablets refresh on sync intervals, not instantaneous live updates.

## Design Considerations

### UI/UX Requirements

**Member Tablet:**

- Maintain current UI/UX completely
- Add subtle sync status indicator in settings or footer
- No user-facing sync controls

**Admin Tablet:**

- Separate application build from Member Tablet (different package name: com.club.medlems.admin)
- Start with Member Tablet UI as base, add admin-specific features
- Add "Admin Mode" indicator always visible in header
- Equipment management as new top-level navigation section:
  - Equipment list with status indicators
  - Checkout/check-in interface with member search
  - Conflict resolution view with badge notification
- Member lookup for assisted check-in:
  - Search bar supporting name and membership ID
  - Live search results as user types
  - Recent members quick-access list
- Visual indicator for sync status (online/offline/syncing) in footer or notification area
- Equipment conflict resolution interface:
  - Conflicts section with badge count
  - Conflict detail dialog with reassignment options

**Display-Only Tablet:**

**Equipment Display Variant:**

- Read-only paired device with auto-refresh every 10-30s
- Full-screen equipment status board
- Large font (minimum 24pt) for distance viewing
- Color-coded status: Green (Available), Red (Checked Out), Yellow (Maintenance)
- Shows equipment serial number, type, and current holder if checked out
- No interactive controls, display-only

**Practice Session Display Variant:**

- Read-only paired device with 30-second auto-rotation (configurable)
- Large, readable display optimized for viewing from distance (minimum 24pt font)
- Rotating views:
  1. Recent practice session results (last 10-20 sessions with scores)
  2. Leaderboard by discipline (top 10 for selected discipline)
  3. Top movers this week (biggest improvements)
  4. Most stable shooter this month (lowest variance)
  5. Most improved shooter this month (highest average gain)
- Interactive filters (pauses rotation):
  - Discipline dropdown: All, Pistol, Rifle, Shotgun
  - Time period dropdown: Today, This Week, This Month, Custom Date Range
  - Member filter: All Members or select specific member
- Auto-revert to default rotation after 60 seconds idle
- Prominent "Display Mode - Practice Sessions" header
- No keyboard input, only touch/click selection controls

**Master Laptop:**

- Desktop/browser-optimized layout with multiple panels (sidebar + main content area)
- Dashboard as landing page:
  - Recent activity feed across all devices
  - Device status panel (online/offline for each paired device)
  - Quick stats: members checked in today, equipment checked out, pending registrations
- Member management as primary view:
  - Full member list with search and filter
  - Add/Edit/View member with full CRUD operations
  - Import members from CSV for initial data migration
  - Member detail shows: profile, check-in history, practice sessions, equipment checkouts
- NewMemberRegistration approval queue:
  - Pending registrations list with submission date
  - Approval dialog with editable member fields
  - Approve button creates Member record
  - Reject button with optional rejection reason
  - Archive view for approved/rejected registrations
- Equipment status overview:
  - All equipment with current status
  - Checkout history for each item
  - Conflict resolution interface (matches admin tablet functionality)
- Manual "Push Master Data" button (primary action):
  - Confirmation dialog: "Push member data to X tablets?"
  - Progress indicator showing push status per device
  - Success/failure notification with device list
  - Retry option for failed devices
- Device management panel:
  - "Add New Device" button opens pairing QR code dialog
  - List of paired devices with friendly names, types, last seen
  - Revoke trust action for each device
- Comprehensive sync status monitoring:
  - Last sync time for each device
  - Sync error log with timestamps
  - Network discovery status
- Settings panel:
  - Configure backup schedule
  - Export backup to external location
  - Restore from backup file
  - Network configuration (fallback manual IP entry)

### Sync Protocol Considerations

- Use REST API or custom TCP protocol for device-to-device communication
- Implement vector clocks or logical timestamps for distributed ordering
- Consider using multicast DNS (mDNS/Bonjour) for automatic device discovery
- Implement exponential backoff for failed sync attempts
- Use SQLite triggers or Room database observers for change tracking

### Data Model Extensions

Existing entities require these additional fields for distributed sync:

- `deviceId: String` - Identifies which device created the record
- `syncVersion: Long` - Monotonically increasing version for conflict detection
- `syncedAtUtc: Instant?` - Last successful sync timestamp

New entities with complete schemas:

**EquipmentItem:**

```kotlin
@Entity
data class EquipmentItem(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val serialNumber: String,
    val type: EquipmentType,
    val description: String? = null, // max 200 chars
    val status: EquipmentStatus,
    val deviceId: String,
    val createdAtUtc: Instant,
    val modifiedAtUtc: Instant,
    val syncVersion: Long,
    val syncedAtUtc: Instant? = null
)

enum class EquipmentType {
    TRAINING_MATERIAL
    // Future: PROTECTIVE_GEAR, RANGE_EQUIPMENT, etc.
}

enum class EquipmentStatus {
    AVAILABLE, CHECKED_OUT, MAINTENANCE, RETIRED
}
```

**EquipmentCheckout:**

```kotlin
@Entity
data class EquipmentCheckout(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val equipmentId: String,
    val membershipId: String,
    val checkedOutAtUtc: Instant,
    val checkedInAtUtc: Instant? = null,
    val checkedOutByDeviceId: String,
    val checkedInByDeviceId: String? = null,
    val checkoutNotes: String? = null, // max 500 chars
    val checkinNotes: String? = null, // max 500 chars
    val conflictStatus: ConflictStatus? = null,
    val deviceId: String,
    val createdAtUtc: Instant,
    val modifiedAtUtc: Instant,
    val syncVersion: Long,
    val syncedAtUtc: Instant? = null
)

enum class ConflictStatus {
    PENDING, RESOLVED, CANCELLED
}
```

**Member entity additions:**

- `registrationId: String?` - Link to NewMemberRegistration if created from approval

**NewMemberRegistration entity additions:**

- `approvalStatus: ApprovalStatus` - Enum (Pending, Approved, Rejected)
- `approvedAtUtc: Instant?` - Approval timestamp
- `rejectedAtUtc: Instant?` - Rejection timestamp
- `rejectionReason: String?` - Optional rejection reason (max 500 chars)
- `createdMemberId: String?` - Link to Member record if approved

## Technical Considerations

### Architecture Decisions

**Tech Stack:**

- **Android Tablets**: Kotlin, Jetpack Compose, Room database, Hilt for DI
- **Master Laptop**: Browser-based Progressive Web App (PWA) or Electron with React/TypeScript for portability
- **Sync Protocol**: REST API over HTTP with mDNS discovery, fallback to manual IP configuration
- **Database**: SQLite on all platforms with compatible schemas

**Network Topology: Hybrid Model**

- Tablets operate as peer-to-peer mesh for check-in and practice session data
- Laptop acts as optional coordinator when online:
  - Automatically receives (pulls) data from tablets
  - Manually pushes master data changes to tablets
  - Provides conflict resolution interface for equipment checkouts
- When laptop is offline, tablets continue peer-to-peer operation without degradation

**Device Security:**

- QR code pairing ceremony: Laptop generates QR code, tablets scan using existing QR capability
- Pairing QR encodes: device trust token, sync network ID, initial endpoint
- Trust propagation: device paired with any trusted device becomes trusted by all
- Shared symmetric key after pairing for encrypted sync communication
- Device revocation list maintained on laptop, synced to tablets

**Equipment ID Generation:**

- UUIDs generated for equipment items to prevent offline conflicts
- Serial numbers manually entered by admins for human identification
- Equipment checkout conflicts resolved by any admin (laptop or admin tablet)
- Conflict resolution syncs immediately to all devices

**Backup and Restore Strategy:**

- All devices perform scheduled automatic backups (daily at configurable time)
- Backup files are SQLite database exports with timestamp
- Master Laptop can export backups to external storage for disaster recovery
- Restore functionality available on all devices from settings/admin panel
- Backup files cross-compatible for migrating data between device types

**Schema Versioning:**

- Semantic versioning: MAJOR.MINOR.PATCH
- Same major version devices can sync with backward compatibility
- Breaking changes require major version bump and force all devices to update
- Schema version checked during sync handshake, incompatible devices rejected with update prompt

**Network Timeouts and Status:**

- 60-second grace period before marking device offline
- Real-time network status display on all devices
- Device discovery list with online/offline indicators
- Master data push shows progress and explicit confirmation

**Application Builds:**

- **Member Tablet**: com.club.medlems.member - Self-service check-in
- **Admin Tablet**: com.club.medlems.admin - Admin features + equipment management
- **Display Tablet - Equipment**: com.club.medlems.display.equipment - Equipment status board
- **Display Tablet - Practice**: com.club.medlems.display.practice - Practice session displays
- **Master Laptop**: Progressive Web App, installable, works offline

**Initial Data Migration:**

- Laptop imports existing member data from CSV before first pairing
- CSV columns map to Member entity fields with validation
- Laptop becomes authoritative source for member master data
- First tablet pairing receives full member list from laptop (laptop wins conflicts)
- Tablet's historical CheckIn/PracticeSession data preserved and merged
- One-time migration; subsequent syncs use delta protocol

**Member Lookup:**

- Search by name (first, last, or full name) or membership ID
- Live search with 2-character minimum
- Results show: membership ID, full name, status
- Available on Admin Tablet and Master Laptop
- QR scanning remains for member self-service on Member Tablet

**Equipment Conflict Resolution:**

- Conflicts shown in dedicated section with notification badge
- Conflict detail shows both checkout attempts with timestamps and devices
- Admin selects: Keep first checkout or Reassign to second member
- Cancelled checkout marked in database (conflictStatus=Cancelled, retained for audit)
- Resolution syncs immediately to all devices

**Time Synchronization:**

- Accept clock skew between devices (no NTP requirement)
- Use device local timestamps for event ordering
- Master data managed exclusively from laptop eliminates timestamp conflicts
- Equipment checkout conflicts resolved manually when timestamps overlap

**Critical Technical Challenges:**

1. **Conflict-Free Replicated Data Types (CRDTs)** or similar approach for equipment checkout conflicts
2. **Vector clocks** for causally ordering events across devices
3. **Efficient delta sync** - only transmit changes, not full datasets
4. **Network partition handling** - gracefully handle split-brain scenarios
5. **Data integrity** - ensure referential integrity across distributed databases

**Performance Targets:**

- Sync latency < 5 seconds when devices are online
- Device discovery < 10 seconds after network join
- Offline operation indefinitely with no degradation
- Support 500+ member records, 10,000+ practice sessions without performance issues
- Backup operation completes in < 30 seconds for typical database size
- Restore operation completes in < 60 seconds
- Display tablet auto-refresh every 10-30 seconds (configurable)

### Dependencies

- Existing Android app codebase (Kotlin, Room, Hilt)
- Network library for service discovery (e.g., jmDNS for Android, Bonjour for .NET)
- HTTP client libraries (Ktor for Android, HttpClient for .NET)
- Serialization library compatible across platforms (kotlinx.serialization or Protocol Buffers)

### Security Considerations

- Local network only, no external threats assumed initially
- Consider basic authentication for laptop master data push operations
- Device pairing/trust mechanism to prevent rogue devices joining sync network
- Equipment checkout audit trail with deviceId and admin identification

## Success Metrics

1. **Sync Reliability**: 99%+ successful sync rate when devices are online
2. **Offline Duration**: System operates correctly after 7+ days offline
3. **Data Integrity**: Zero data loss events in production testing
4. **Sync Performance**: 95% of syncs complete within 5 seconds
5. **User Adoption**: Admins successfully use equipment checkout feature in 80%+ of training sessions
6. **Conflict Rate**: < 1% of records experience sync conflicts requiring system resolution
7. **Device Discovery**: 100% success rate for automatic tablet discovery within 10 seconds

## Open Questions

### Resolved (See Architectural Decisions Above)

1. ✅ **Laptop Platform**: Browser-based PWA/Electron for portability
2. ✅ **Sync Trigger**: Hybrid - auto-pull from tablets, manual push for master data
3. ✅ **Equipment Notifications**: Yes, show notifications on sync
4. ✅ **Member Tablet Access Control**: Separate app builds (member vs admin vs display)
5. ✅ **Database Schema Versioning**: Backward compatible within major version, force updates for breaking changes
6. ✅ **Network Topology**: Hybrid - tablets peer-to-peer, laptop optional coordinator
7. ✅ **Initial Data Seeding**: Full sync on first connection after pairing
8. ✅ **Backup Strategy**: Scheduled backups on all devices, restore option for disaster recovery
9. ✅ **Equipment ID Assignment**: Auto-generated UUIDs, manual serial numbers
11. ✅ **Time Synchronization**: Accept small clock differences, no NTP required
12. ✅ **Device Authentication**: QR code pairing ceremony with trust propagation
13. ✅ **Equipment Conflicts**: Flag for manual resolution
14. ✅ **Scalability**: 2 tablets now, support 3-4 for future display screens
15. ✅ **Audit Trail**: Logging for troubleshooting only, no user-facing audit
16. ✅ **QR Code Pairing**: Laptop generates, tablets scan using existing capability
17. ✅ **Conflict Resolution Authority**: Any admin device (laptop or admin tablet)
18. ✅ **Display-Only Screens**: Read-only paired devices with interactive filtering (no writes)
19. ✅ **Network Interruption Grace Period**: 60 seconds before marking device offline
20. ✅ **Master Data Push Confirmation**: Explicit progress dialog showing device count and status

### Remaining Open Questions

None - All architectural decisions have been resolved.

---

**Document Version:** 3.0
**Created:** January 13, 2026
**Last Updated:** January 13, 2026 by sbalslev
**Status:** Comprehensive and Complete - Ready for Task Generation
