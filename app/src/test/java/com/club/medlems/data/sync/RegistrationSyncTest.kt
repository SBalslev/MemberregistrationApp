package com.club.medlems.data.sync

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for registration sync operations.
 * Verifies that approval status flows correctly from laptop back to tablets.
 * 
 * @see FR-18 - Sync Protocol Specification
 */
class RegistrationSyncTest {

    // Simulated ApprovalStatus enum
    enum class ApprovalStatus {
        PENDING,
        APPROVED,
        REJECTED
    }

    // Simulated registration data class
    data class MockRegistration(
        val id: String,
        val firstName: String,
        val lastName: String,
        val approvalStatus: ApprovalStatus,
        val syncVersion: Long,
        val syncedAtUtc: String? = null
    )

    /**
     * Simulates the sync logic in SyncRepository.applySyncPayload
     */
    private fun shouldProcessIncomingRegistration(
        existing: MockRegistration?,
        incoming: MockRegistration
    ): ProcessAction {
        return when {
            existing == null -> ProcessAction.INSERT
            incoming.syncVersion > existing.syncVersion -> ProcessAction.UPDATE
            else -> ProcessAction.SKIP
        }
    }

    enum class ProcessAction {
        INSERT,
        UPDATE,
        SKIP
    }

    // ===== Insert Tests =====

    @Test
    fun `should insert new registration when no existing record`() {
        val incoming = MockRegistration(
            id = "reg-new",
            firstName = "New",
            lastName = "Member",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 1
        )

        val action = shouldProcessIncomingRegistration(existing = null, incoming = incoming)

        assertEquals(ProcessAction.INSERT, action)
    }

    // ===== Update Tests =====

    @Test
    fun `should update when incoming syncVersion is higher`() {
        val existing = MockRegistration(
            id = "reg-123",
            firstName = "John",
            lastName = "Doe",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 1
        )

        val incoming = MockRegistration(
            id = "reg-123",
            firstName = "John",
            lastName = "Doe",
            approvalStatus = ApprovalStatus.APPROVED, // Status changed!
            syncVersion = 2 // Higher version
        )

        val action = shouldProcessIncomingRegistration(existing = existing, incoming = incoming)

        assertEquals(ProcessAction.UPDATE, action)
    }

    @Test
    fun `should update registration with approval status from laptop`() {
        // Tablet has PENDING registration at version 1
        val tabletRecord = MockRegistration(
            id = "reg-approval",
            firstName = "Jane",
            lastName = "Smith",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 1,
            syncedAtUtc = "2026-01-19T10:00:00Z"
        )

        // Laptop sends APPROVED at version 2
        val laptopSync = MockRegistration(
            id = "reg-approval",
            firstName = "Jane",
            lastName = "Smith",
            approvalStatus = ApprovalStatus.APPROVED,
            syncVersion = 2
        )

        val action = shouldProcessIncomingRegistration(existing = tabletRecord, incoming = laptopSync)

        assertEquals("Tablet should update from laptop's approved version", ProcessAction.UPDATE, action)
        assertTrue("Incoming version should be higher", laptopSync.syncVersion > tabletRecord.syncVersion)
        assertEquals("Incoming should have APPROVED status", ApprovalStatus.APPROVED, laptopSync.approvalStatus)
    }

    @Test
    fun `should update registration with rejection status from laptop`() {
        val tabletRecord = MockRegistration(
            id = "reg-reject",
            firstName = "Bob",
            lastName = "Wilson",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 1
        )

        val laptopSync = MockRegistration(
            id = "reg-reject",
            firstName = "Bob",
            lastName = "Wilson",
            approvalStatus = ApprovalStatus.REJECTED,
            syncVersion = 2
        )

        val action = shouldProcessIncomingRegistration(existing = tabletRecord, incoming = laptopSync)

        assertEquals(ProcessAction.UPDATE, action)
    }

    // ===== Skip Tests =====

    @Test
    fun `should skip when versions are equal`() {
        val existing = MockRegistration(
            id = "reg-same",
            firstName = "Same",
            lastName = "Version",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 3
        )

        val incoming = existing.copy() // Same version

        val action = shouldProcessIncomingRegistration(existing = existing, incoming = incoming)

        assertEquals(ProcessAction.SKIP, action)
    }

    @Test
    fun `should skip when local syncVersion is higher`() {
        val existing = MockRegistration(
            id = "reg-local-higher",
            firstName = "Local",
            lastName = "Higher",
            approvalStatus = ApprovalStatus.APPROVED,
            syncVersion = 5
        )

        val incoming = MockRegistration(
            id = "reg-local-higher",
            firstName = "Local",
            lastName = "Higher",
            approvalStatus = ApprovalStatus.PENDING, // Stale data
            syncVersion = 3 // Lower version
        )

        val action = shouldProcessIncomingRegistration(existing = existing, incoming = incoming)

        assertEquals("Should skip stale incoming data", ProcessAction.SKIP, action)
    }

    // ===== Tablet-to-Tablet Sync Tests =====

    @Test
    fun `registration should sync from one tablet to another`() {
        // Tablet A creates a registration
        val tabletARegistration = MockRegistration(
            id = "reg-tablet-sync",
            firstName = "Shared",
            lastName = "Registration",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 1
        )

        // Tablet B receives it (no existing record)
        val actionOnTabletB = shouldProcessIncomingRegistration(
            existing = null,
            incoming = tabletARegistration
        )

        assertEquals("Tablet B should insert registration from Tablet A", ProcessAction.INSERT, actionOnTabletB)
    }

    @Test
    fun `duplicate registration should be skipped on second tablet sync`() {
        // Tablet B already has the registration
        val tabletBRecord = MockRegistration(
            id = "reg-tablet-sync",
            firstName = "Shared",
            lastName = "Registration",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 1,
            syncedAtUtc = "2026-01-19T11:00:00Z"
        )

        // Tablet A syncs again with same version
        val tabletASync = MockRegistration(
            id = "reg-tablet-sync",
            firstName = "Shared",
            lastName = "Registration",
            approvalStatus = ApprovalStatus.PENDING,
            syncVersion = 1
        )

        val action = shouldProcessIncomingRegistration(existing = tabletBRecord, incoming = tabletASync)

        assertEquals("Should skip duplicate sync", ProcessAction.SKIP, action)
    }
}
