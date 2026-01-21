# Future Feature Ideas

**Created:** 2026-01-20
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

## Medium Value

### 4. Payment Reminders

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

### 5. Member Self-Service Portal (Web)

**Summary:** Web portal where members can view their own information.

**Potential Capabilities:**
- View attendance history
- View punchcard balance
- View payment history
- Update contact information
- See upcoming events/sessions

**Integration Points:**
- All existing data
- Requires authentication system

**Complexity:** High (new web app, auth)

---

### 6. Data Backup & Restore

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

### 7. Tablet Leaderboards

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

### 8. Bank CSV Import

**Summary:** Import bank statements to auto-create transactions.

**Potential Capabilities:**
- Parse bank CSV exports
- Auto-categorize transactions
- Match to existing categories
- Manual review before import

**Complexity:** Medium

---

### 9. Multi-Language Support

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
- Consider user feedback before prioritizing
