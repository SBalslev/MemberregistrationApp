# Future Feature Ideas

**Created:** 2026-01-20
**Updated:** 2026-02-03
**Status:** Ideas for future consideration

---

## High Value / Natural Extensions

### 1. Punchcard (Klippekort) Balance Tracking

**Summary:** Track punches bought vs. used per member, with automatic deduction on check-in.

**Potential Capabilities:**
- Member punchcard balance stored in database
- Deduct punch automatically on check-in
- Balance warnings ("2 punches remaining")
- Purchase history linked to financial transactions (AMMO category)
- Low balance notifications for trainers
- Configurable punch prices and packages

**Integration Points:**
- Check-in system (Android tablets)
- Financial transactions (already tracks AMMO sales)
- Member management

**Complexity:** Medium

---

### 2. MobilePay Statement Import

**Summary:** Parse MobilePay exports to auto-create pending fee payments, reducing manual data entry.

**Potential Capabilities:**
- Import MobilePay CSV or PDF statements
- Auto-match payments to members by name or phone number
- Create pending fee payments automatically
- Handle unmatched payments (manual assignment)
- Duplicate detection

**Integration Points:**
- Financial transactions (pending payments)
- Member database (matching)

**Complexity:** Medium-High (parsing, matching logic)

---

### 3. Attendance Reports & Statistics

**Summary:** Training attendance reports and statistics for club management.

**Potential Capabilities:**
- Attendance by member (monthly, yearly)
- Attendance by weekday/time slot
- Most active members leaderboard
- Trend charts (attendance over time)
- Inactive member detection
- Export to Excel for board meetings
- Practice session statistics

**Integration Points:**
- Check-in data
- Practice sessions
- Member management

**Complexity:** Medium

---

### 4. Børneattester Tracking

**Summary:** Track when the last børneattest (child safety certificate) was requested or approved for each trainer.

**Potential Capabilities:**
- Store børneattest request date per trainer
- Store approval/confirmation date
- Expiration tracking (certificates are typically valid for 3 years)
- Reminder alerts when certificates are expiring
- Overview dashboard showing all trainers and their certificate status
- History log of previous certificates

**Integration Points:**
- Trainer/user management
- Laptop app (display certificate status)
- Notification system (for reminders)

**Complexity:** Low-Medium

---

### 5. Member Notes for Check-in

**Summary:** Add notes on a member that show up on the trainer app when that member checks in.

**Potential Capabilities:**
- Add/edit notes per member
- Notes displayed prominently on check-in confirmation
- Different note types/categories (e.g., "ask for updated address", "payment reminder", "medical info")
- Mark notes as resolved/archived
- Timestamp and author tracking for notes

**Integration Points:**
- Member database
- Tablet check-in display
- Laptop member management

**Complexity:** Low-Medium

---

### 6. Cloud-Based Member Status Page

**Summary:** A new web page to replace the existing legacy page (https://iss-skydning.dk/Skytte/login.php?id=...) that reads from the cloud database.

**Potential Capabilities:**
- Display member status (known member, unknown, etc.)
- Show member photo
- Show membership fee payment status for current year
- License validity (if applicable)
- Integration with the cloud sync database

**Integration Points:**
- Cloud database (online-database-sync)
- PHP API
- Existing website infrastructure

**Complexity:** Medium

---

### 7. Check-in Payment Reminder

**Summary:** Display payment reminder on check-in when a member needs to pay their membership fee.

**Potential Capabilities:**
- Flag shown on check-in confirmation screen
- Visual indicator (color/icon) for unpaid status
- Option to mark as "reminded" to avoid repeated notices
- Configurable reminder period (e.g., start showing after January 1st)

**Integration Points:**
- Financial transactions (fee status)
- Check-in display
- Member database

**Complexity:** Low

---

## Medium Value

### 8. Trainer ID Card View

**Summary:** Allow trainers to view their ID card directly in the trainer app.

**Potential Capabilities:**
- Display trainer's own ID card/profile
- Show photo, name, and trainer status
- Display any relevant certifications
- QR code for verification (optional)

**Integration Points:**
- Trainer profiles
- Tablet app (trainer mode)

**Complexity:** Low

### 9. Payment Reminders

**Summary:** Email reminders for members with unpaid fees.

**Potential Capabilities:**
- Email reminders for unpaid fees
- Configurable reminder templates (Danish)
- Scheduled reminder batches
- Track reminder history per member
- Opt-out handling

**Integration Points:**
- Financial transactions (fee status)
- Member contact info (email)

**Complexity:** Medium (requires email service integration)

---

### 10. Online Member Portal (Web)

**Summary:** Web portal on https://iss-skydning.dk/Skytte/ where members can view their own information, reading data from the cloud database.

**Potential Capabilities:**
- View practice session history (from cloud database)
- See training statistics for the last 12 months and beyond
- View attendance trends and patterns
- View punchcard balance (if implemented)
- View payment history and membership fee status
- Update contact information and membership data
- See upcoming events/sessions

**Integration Points:**
- Cloud database (online-database-sync)
- PHP API
- Existing website infrastructure
- Authentication system (member login)

**Complexity:** High (new web app, auth, cloud integration)

---

### 11. Data Backup & Restore

**Summary:** Automated backup and restore functionality.

**Potential Capabilities:**
- Scheduled automatic backups
- Export full database to file
- Import/restore from backup
- Cloud backup option (OneDrive, Google Drive)
- Backup verification

**Integration Points:**
- SQLite database
- Photo storage

**Complexity:** Low-Medium

---

## Lower Priority

### 12. Tablet Leaderboards

**Summary:** Display leaderboards on tablets showing top attendees.

**Potential Capabilities:**
- Top 10 attendees this month/year
- Member photos on leaderboard (uses thumbnails)
- Streak tracking (consecutive weeks)
- Category leaderboards (juniors, seniors)

**Integration Points:**
- Check-in data
- Photo thumbnails (already implemented)
- PracticeDisplay tablet variant

**Complexity:** Low-Medium

---

### 13. Bank CSV Import

**Summary:** Import bank statements to auto-create transactions.

**Potential Capabilities:**
- Parse bank CSV exports
- Auto-categorize transactions
- Match to existing categories
- Manual review before import

**Complexity:** Medium

---

### 14. Multi-Language Support

**Summary:** Support for languages beyond Danish.

**Potential Capabilities:**
- English translation
- Language switcher
- i18n framework integration

**Complexity:** High (many strings to translate)

---

## Notes

- Punchcard tracking is the most natural next step, connecting check-ins with finances
- MobilePay import would save significant treasurer time
- Børneattester tracking is important for legal compliance with child safety requirements
- Member notes and payment reminders on check-in are quick wins that improve trainer workflow
- Cloud-based member status page and online member portal build on the existing online-database-sync feature
- Consider user feedback before prioritizing
