# SKV registration tracking - Implementation tasks

**Feature:** SKV registration tracking
**Created:** 2026-01-23
**Status:** Planning
**Last Updated:** 2026-01-23
**Updated By:** sbalslev
**Related Documents:**

- [PRD](prd.md)

---

## Overview

This plan covers laptop-only SKV registration tracking, weapon management, and Excel export. SKV data is not synced to tablets.

---

## Phase 1: Data model and storage (laptop)

- [ ] **1.1** Add SKV registration and weapon tables to the laptop database
- [ ] **1.2** Add repository helpers for CRUD operations
- [ ] **1.3** Ensure SKV data is excluded from sync payloads
- [ ] **1.4** Implement lazy default SKV6 not_started for members without records

---

## Phase 2: Controlled lists

- [ ] **2.1** Seed controlled lists in the laptop app
- [ ] **2.2** Wire list usage to SKV weapon forms
- [ ] **2.3** Capture sources and citations when available

---

## Phase 3: Member UI

- [ ] **3.1** Add SKV section under member details
- [ ] **3.2** Add SKV status and approval date editing
- [ ] **3.3** Add weapons table with add, edit, and delete actions
- [ ] **3.4** Add inline validation and save summary

---

## Phase 4: Admin export

- [ ] **4.1** Add admin export entry for SKV
- [ ] **4.2** Define export file naming and default save location
- [ ] **4.3** Confirm export inclusion rules for inactive members and deleted weapons
- [ ] **4.4** Confirm member name format in export
- [ ] **4.5** Export to Excel with separate tabs for registrations and weapons
- [ ] **4.6** Add export tests for column layout and data coverage

---

## Phase 5: Testing and validation

- [ ] **5.1** Unit tests for default SKV handling
- [ ] **5.2** Unit tests for validation rules
- [ ] **5.3** Integration tests for member UI save and edit flows
- [ ] **5.4** Scenario tests for export content and tab layout

---

## Acceptance criteria

- [ ] SKV data is stored only on the laptop
- [ ] SKV records default to SKV6 not_started when missing
- [ ] Admin can edit SKV status, level, and approval date
- [ ] Admin can manage weapons with type and caliber from controlled lists
- [ ] Excel export includes registrations and weapons in separate tabs
- [ ] No SKV data appears in tablet sync payloads
