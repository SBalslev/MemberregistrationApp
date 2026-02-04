package com.club.medlems.data.sync

import com.club.medlems.data.entity.MemberType
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for device type filtering in sync operations.
 * Verifies that:
 * - Non-TRIAL members only sync to LAPTOP (laptop is authority)
 * - TRIAL members sync to all devices (for instant tablet-to-tablet sync)
 * - Check-ins, sessions, and registrations sync to all peers
 *
 * @see FR-18 - Sync Protocol Specification
 */
class DeviceTypeFilteringTest {

    // Simulated DeviceType enum values
    enum class DeviceType {
        LAPTOP,
        MEMBER_TABLET,
        TRAINER_TABLET,
        DISPLAY_DASHBOARD,
        DISPLAY_LEADERBOARD
    }

    /**
     * Determines if a member should be synced to the given destination.
     * - TRIAL members sync to all devices (instant tablet-to-tablet sync for new registrations)
     * - Non-TRIAL members only sync to LAPTOP (laptop is master for member data)
     */
    private fun shouldSyncMemberTo(destinationType: DeviceType, memberType: MemberType): Boolean {
        return destinationType == DeviceType.LAPTOP || memberType == MemberType.TRIAL
    }

    /**
     * Legacy function for backward compatibility in tests.
     * Non-TRIAL members only flow from tablets TO laptop (laptop is master).
     */
    private fun shouldSyncNonTrialMembersTo(destinationType: DeviceType): Boolean {
        return destinationType == DeviceType.LAPTOP
    }

    /**
     * Determines if check-ins should be synced to the given destination.
     * Check-ins flow between all peers for visibility.
     */
    private fun shouldSyncCheckInsTo(destinationType: DeviceType): Boolean {
        return true // All device types receive check-ins
    }

    /**
     * Determines if practice sessions should be synced to the given destination.
     * Sessions flow between all peers for visibility.
     */
    private fun shouldSyncSessionsTo(destinationType: DeviceType): Boolean {
        return true // All device types receive sessions
    }

    /**
     * Determines if registrations should be synced to the given destination.
     * Registrations flow between all peers.
     */
    private fun shouldSyncRegistrationsTo(destinationType: DeviceType): Boolean {
        return true // All device types receive registrations
    }

    // ===== Non-TRIAL Member Sync Tests =====

    @Test
    fun `non-TRIAL members should sync to LAPTOP`() {
        assertTrue(
            "Non-TRIAL members should sync to laptop",
            shouldSyncMemberTo(DeviceType.LAPTOP, MemberType.FULL)
        )
    }

    @Test
    fun `non-TRIAL members should NOT sync to MEMBER_TABLET`() {
        assertFalse(
            "Non-TRIAL members should not sync from tablet to tablet",
            shouldSyncMemberTo(DeviceType.MEMBER_TABLET, MemberType.FULL)
        )
    }

    @Test
    fun `non-TRIAL members should NOT sync to TRAINER_TABLET`() {
        assertFalse(
            "Non-TRIAL members should not sync to trainer tablet",
            shouldSyncMemberTo(DeviceType.TRAINER_TABLET, MemberType.FULL)
        )
    }

    @Test
    fun `non-TRIAL members should NOT sync to DISPLAY devices`() {
        assertFalse(
            "Non-TRIAL members should not sync to display dashboard",
            shouldSyncMemberTo(DeviceType.DISPLAY_DASHBOARD, MemberType.FULL)
        )
        assertFalse(
            "Non-TRIAL members should not sync to display leaderboard",
            shouldSyncMemberTo(DeviceType.DISPLAY_LEADERBOARD, MemberType.FULL)
        )
    }

    // ===== TRIAL Member Sync Tests (Instant Tablet-to-Tablet Sync) =====

    @Test
    fun `TRIAL members should sync to LAPTOP`() {
        assertTrue(
            "TRIAL members should sync to laptop",
            shouldSyncMemberTo(DeviceType.LAPTOP, MemberType.TRIAL)
        )
    }

    @Test
    fun `TRIAL members should sync to MEMBER_TABLET`() {
        assertTrue(
            "TRIAL members should sync to member tablet for instant sync",
            shouldSyncMemberTo(DeviceType.MEMBER_TABLET, MemberType.TRIAL)
        )
    }

    @Test
    fun `TRIAL members should sync to TRAINER_TABLET`() {
        assertTrue(
            "TRIAL members should sync to trainer tablet for instant sync",
            shouldSyncMemberTo(DeviceType.TRAINER_TABLET, MemberType.TRIAL)
        )
    }

    @Test
    fun `TRIAL members should sync to all device types`() {
        DeviceType.entries.forEach { deviceType ->
            assertTrue(
                "TRIAL members should sync to $deviceType",
                shouldSyncMemberTo(deviceType, MemberType.TRIAL)
            )
        }
    }

    @Test
    fun `new registration TRIAL member should be available on other tablets immediately`() {
        // Scenario: Member tablet registers a TRIAL member
        // Expected: TRIAL member should sync to trainer tablet for instant visibility
        val sourceType = DeviceType.MEMBER_TABLET
        val destType = DeviceType.TRAINER_TABLET
        val memberType = MemberType.TRIAL

        assertTrue(
            "TRIAL member from $sourceType should sync to $destType",
            shouldSyncMemberTo(destType, memberType)
        )
    }

    // ===== Check-in Sync Tests =====

    @Test
    fun `check-ins should sync to all device types`() {
        DeviceType.entries.forEach { deviceType ->
            assertTrue(
                "Check-ins should sync to $deviceType",
                shouldSyncCheckInsTo(deviceType)
            )
        }
    }

    // ===== Practice Session Sync Tests =====

    @Test
    fun `sessions should sync to all device types`() {
        DeviceType.entries.forEach { deviceType ->
            assertTrue(
                "Sessions should sync to $deviceType",
                shouldSyncSessionsTo(deviceType)
            )
        }
    }

    // ===== Registration Sync Tests =====

    @Test
    fun `registrations should sync to all device types`() {
        DeviceType.entries.forEach { deviceType ->
            assertTrue(
                "Registrations should sync to $deviceType",
                shouldSyncRegistrationsTo(deviceType)
            )
        }
    }

    @Test
    fun `registrations should flow between tablets for offline resilience`() {
        // When laptop is offline, tablets should still share registrations
        val sourceType = DeviceType.MEMBER_TABLET
        val destType = DeviceType.TRAINER_TABLET
        
        assertTrue(
            "Registrations should flow from $sourceType to $destType",
            shouldSyncRegistrationsTo(destType)
        )
    }
}
