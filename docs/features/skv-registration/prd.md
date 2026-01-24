# SKV registration tracking - Product requirements document

**Feature:** SKV registration tracking for members
**Version:** 1.0
**Last Updated:** 2026-01-23
**Updated By:** sbalslev

---

## 1. Overview

### 1.1 Purpose

Track SKV registration status for members in the laptop app, including approval state, last approved date, and registered weapons. This data is stored only on the laptop and is not synced to tablets.

### 1.2 Background

The club needs a structured way to track SKV registrations and related weapon approvals. Today this information is maintained outside the system, which makes it harder to audit and keep current.

### 1.3 Goals

- Store SKV registration level per member
- Track approval state and last approved date
- Track member weapons linked to SKV registration
- Keep all SKV data on the laptop only
- Export SKV registration data from the laptop

### 1.4 Non-goals

- No tablet UI or storage
- No sync of SKV data to tablets
- No automated reminders in this version

---

## 2. User stories

### 2.1 Core stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| SKV-01 | Admin | Set a member SKV level and status | I can see who is registered and at what level |
| SKV-02 | Admin | Record last SKV approved date | I can confirm when approval was last granted |
| SKV-03 | Admin | Add weapons to a member SKV record | I can track approved weapons per member |
| SKV-04 | Admin | Edit or remove weapon entries | I can keep the weapon list accurate |

### 2.2 Out of scope

| Feature | Description |
|---------|-------------|
| Sync to tablets | SKV data remains on laptop only |
| Automated expiry alerts | Manual review only for now |
| Document uploads | No attachments in this version |

---

## 3. Functional requirements

### 3.1 SKV registration model

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | Yes | Unique record id |
| memberId | string | Yes | Member reference |
| skvLevel | number (1 to 6) | Yes | SKV registration level |
| status | enum | Yes | approved, requested, not_started |
| lastApprovedDate | date | No | Date SKV was last approved |
| createdAtUtc | datetime | Yes | Creation timestamp |
| updatedAtUtc | datetime | Yes | Last update timestamp |

**Business rules**

- Exactly one SKV registration per member
- Default skvLevel is 6 when status is not_started
- If SKV data is missing for a member, treat it as skvLevel 6 with status not_started
- Status semantics:
	- not_started: no lastApprovedDate value
	- requested: request initiated but not yet received
	- approved: request received and lastApprovedDate is set
- lastApprovedDate is required when status is approved

### 3.2 Weapon registration model

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | Yes | Unique weapon id |
| skvRegistrationId | string | Yes | Parent SKV registration id |
| model | string | Yes | Weapon model |
| description | string | No | Optional notes |
| serial | string | Yes | Serial number |
| type | string | Yes | Weapon type |
| caliber | string | No | Weapon caliber |
| lastReviewedDate | date | No | Last SKV review date |
| createdAtUtc | datetime | Yes | Creation timestamp |
| updatedAtUtc | datetime | Yes | Last update timestamp |

**Business rules**

- Each member can have 0 or more weapons
- Weapons can be deleted when sold or destroyed
- Weapon type and caliber use a controlled list seeded from public sources, with later revision planned

**Field constraints**

- model: max 100 characters
- description: max 500 characters
- serial: max 100 characters
- type: max 50 characters
- caliber: max 50 characters

### 3.3 Laptop-only storage

- SKV registration data is stored in the laptop database only
- SKV data is excluded from sync payloads
- Tablets do not display or edit SKV data

### 3.4 Controlled lists

- Weapon type and caliber use controlled lists
- Lists are stored locally in the laptop app and can be revised in later releases
- Sources and citations are optional for MVP, but should be recorded when available

**Initial weapon type list**

- Pistol
- Revolver
- Vekselsæt
- Riffel
- Karabin
- Haglgevær
- Luftpistol
- Luftriffel
- Salonriffel
- Grovkaliber riffel
- Sortkrudt pistol
- Sortkrudt riffel

**Initial caliber list**

- .177 / 4.5 mm
- .22 LR
- .22 WMR
- .22 Hornet
- .223 Rem
- 5.56x45 mm
- 6.5x55 mm
- 7.62x39 mm
- .308 Win
- 7.62x51 mm
- .30-06
- 9x19 mm
- 9x21 mm
- .357 Magnum
- .38 Special
- .40 S&W
- 10 mm Auto
- .45 ACP
- 12 gauge
- 20 gauge

---

## 4. UI requirements (laptop)

### 4.1 Member details

- Add an SKV section to the member details view
- Show current status, level, and last approved date
- Provide add and edit actions
- Place the SKV section under the member details view
- All UI text for SKV features must be in Danish

### 4.2 Weapons list

- List weapons in a table under the SKV section
- Provide actions to add, edit, and remove weapons

### 4.3 Admin export

- Add an export entry in the admin section
- Export includes SKV registrations and weapons

---

## 5. Validation and error handling

- Show a clear error if approved status is missing lastApprovedDate
- Allow approved status for any SKV level 1 to 6
- Allow requested status without lastApprovedDate
- If SKV data is missing, default to skvLevel 6 and not_started without blocking edits
- Use inline validation next to fields and a single summary at save time

---

## 6. Reporting and export

- Provide Excel export of all SKV registration and weapon data from the laptop
- Export is laptop-only and not synced to tablets
- Export layout uses separate tabs for registrations and weapons
- Exclude deleted weapons from export output
- Include inactive members only if they have been active within the last 12 months
- Member name format is full name with member ID in separate columns
- Export file name uses a default pattern and can be changed by the user
- Export uses a save dialog with a suggested default location

**Excel export layout**

- Sheet: SKV registrations
	- Member ID
	- Member name
	- SKV level
	- Status
	- Last approved date
	- Updated at
- Sheet: SKV weapons
	- Member ID
	- Member name
	- Weapon model
	- Weapon type
	- Caliber
	- Serial
	- Description
	- Last reviewed date
	- Updated at

**Export naming and location**

- Default file name: SKV-export-YYYY-MM-DD.xlsx
- Default location: user Documents folder

---

## 7. Acceptance criteria

- SKV data is stored only on the laptop
- Admin can set SKV level, status, and last approved date
- Admin can manage weapon records per member
- One SKV registration exists per member
- Approved status requires lastApprovedDate
- SKV data can be exported from the laptop
- Excel export includes SKV registrations and weapons on separate tabs

---

## 8. Testing and scenarios

**Core scenarios**

- Create SKV record for a member with default skvLevel 6 and status not_started
- Update status to requested without lastApprovedDate
- Update status to approved with lastApprovedDate set
- Add, edit, and delete weapons for a member
- Export SKV data and verify both tabs and required columns

**Validation scenarios**

- Block save when status is approved and lastApprovedDate is missing
- Allow approved status for any SKV level 1 to 6
