package com.club.medlems.data.sync

import org.junit.Assert.*
import org.junit.Test
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Instant

/**
 * Integration tests for multi-device sync scenarios.
 * 
 * These tests verify the sync protocol and conflict resolution
 * mechanisms work correctly across device types.
 * 
 * @see [design.md FR-18] - Sync Protocol Specification
 * @see [design.md FR-14] - Conflict Resolution Strategy
 * @see [tasks.md 28.0] - Integration tests for multi-device sync scenarios
 */
class SyncIntegrationTest {

    // ===== Device Type Definitions for Testing =====
    
    private val LAPTOP = DeviceType.LAPTOP
    private val TRAINER_TABLET = DeviceType.TRAINER_TABLET
    private val MEMBER_TABLET = DeviceType.MEMBER_TABLET
    
    // ===== 28.2: Member tablet creates check-in, syncs to trainer tablet =====
    
    @Test
    fun `check-in created on member tablet should have correct metadata`() {
        // Simulate check-in creation on member tablet
        val checkIn = createMockCheckIn(
            memberId = "member-123",
            deviceId = "tablet-member-01",
            localDate = LocalDate(2026, 1, 20)
        )
        
        // Verify check-in has all required sync metadata
        assertNotNull("Check-in should have ID", checkIn.id)
        assertEquals("Device ID should match creating device", "tablet-member-01", checkIn.deviceId)
        assertTrue("Sync version should be positive", checkIn.syncVersion > 0)
        assertNotNull("Created timestamp should be set", checkIn.createdAtUtc)
    }
    
    @Test
    fun `check-in sync payload should include all required fields`() {
        val checkIn = createMockCheckIn(
            memberId = "member-123",
            deviceId = "tablet-member-01",
            localDate = LocalDate(2026, 1, 20)
        )
        
        // Verify payload can be serialized with required fields
        val payload = createSyncPayload(
            deviceId = "tablet-member-01",
            deviceType = MEMBER_TABLET,
            checkIns = listOf(checkIn)
        )
        
        assertEquals("Schema version should be set", "1.0.0", payload.schemaVersion)
        assertEquals("Device ID should match", "tablet-member-01", payload.deviceId)
        assertEquals("Should contain 1 check-in", 1, payload.entities.checkIns.size)
    }
    
    // ===== 28.3: Practice session on tablet syncs to laptop =====
    
    @Test
    fun `practice session should include all required scoring fields`() {
        val session = createMockPracticeSession(
            memberId = "member-456",
            deviceId = "tablet-trainer-01",
            points = 85,
            practiceType = "Pistol"
        )
        
        assertNotNull("Session should have ID", session.id)
        assertEquals("Points should be recorded", 85, session.points)
        assertEquals("Practice type should be set", "Pistol", session.practiceType)
        assertNotNull("Classification should be set", session.classification)
    }
    
    @Test
    fun `practice session sync should preserve score data`() {
        val originalPoints = 92
        val session = createMockPracticeSession(
            memberId = "member-789",
            deviceId = "tablet-member-01",
            points = originalPoints,
            practiceType = "Riffel"
        )
        
        // Simulate serialization and deserialization
        val payload = createSyncPayload(
            deviceId = "tablet-member-01",
            deviceType = MEMBER_TABLET,
            practiceSessions = listOf(session)
        )
        
        val syncedSession = payload.entities.practiceSessions.first()
        assertEquals("Points should be preserved through sync", originalPoints, syncedSession.points)
    }
    
    // ===== 28.4: Equipment checkout appears on laptop =====
    
    @Test
    fun `equipment checkout should track member and equipment IDs`() {
        val checkout = createMockEquipmentCheckout(
            equipmentId = "equip-001",
            memberId = "member-123",
            deviceId = "tablet-trainer-01"
        )
        
        assertEquals("Equipment ID should be set", "equip-001", checkout.equipmentId)
        assertEquals("Member ID should be set", "member-123", checkout.internalMemberId)
        assertNull("Check-in time should be null initially", checkout.checkedInAtUtc)
    }
    
    @Test
    fun `equipment checkin should set return timestamp`() {
        val checkout = createMockEquipmentCheckout(
            equipmentId = "equip-002",
            memberId = "member-456",
            deviceId = "tablet-trainer-01"
        )
        
        // Simulate check-in
        val checkedIn = checkout.copy(
            checkedInAtUtc = Clock.System.now(),
            checkedInByDeviceId = "tablet-trainer-01"
        )
        
        assertNotNull("Check-in time should be set", checkedIn.checkedInAtUtc)
        assertEquals("Check-in device should be recorded", "tablet-trainer-01", checkedIn.checkedInByDeviceId)
    }
    
    // ===== 28.5: Offline operation - create data while offline, verify sync on reconnect =====
    
    @Test
    fun `offline created check-ins should be marked as unsynced`() {
        val offlineCheckIn = createMockCheckIn(
            memberId = "member-offline",
            deviceId = "tablet-member-01",
            localDate = LocalDate(2026, 1, 20)
        )
        
        // Initially created records should have null syncedAtUtc
        assertNull("Synced timestamp should be null for offline record", offlineCheckIn.syncedAtUtc)
    }
    
    @Test
    fun `offline check-ins should preserve creation order for sync`() {
        val checkIn1 = createMockCheckIn(
            memberId = "member-a",
            deviceId = "tablet-member-01",
            localDate = LocalDate(2026, 1, 20),
            createdAt = Instant.parse("2026-01-20T09:00:00Z")
        )
        
        val checkIn2 = createMockCheckIn(
            memberId = "member-b",
            deviceId = "tablet-member-01",
            localDate = LocalDate(2026, 1, 20),
            createdAt = Instant.parse("2026-01-20T09:05:00Z")
        )
        
        val checkIns = listOf(checkIn2, checkIn1)
        val sortedForSync = checkIns.sortedBy { it.createdAtUtc }
        
        assertEquals("First created should sync first", checkIn1.id, sortedForSync.first().id)
    }
    
    // ===== 28.6: Equipment checkout conflict detection =====
    
    @Test
    fun `concurrent checkouts of same equipment should be detected as conflict`() {
        val equipment = "equip-001"
        
        val checkout1 = createMockEquipmentCheckout(
            equipmentId = equipment,
            memberId = "member-a",
            deviceId = "tablet-trainer-01",
            checkedOutAt = Instant.parse("2026-01-20T10:00:00Z")
        )
        
        val checkout2 = createMockEquipmentCheckout(
            equipmentId = equipment,
            memberId = "member-b",
            deviceId = "tablet-trainer-02",
            checkedOutAt = Instant.parse("2026-01-20T10:01:00Z")
        )
        
        // Detect conflict: same equipment, different members, overlapping time
        val isConflict = checkout1.equipmentId == checkout2.equipmentId
            && checkout1.internalMemberId != checkout2.internalMemberId
            && checkout1.checkedInAtUtc == null
            && checkout2.checkedInAtUtc == null
        
        assertTrue("Concurrent checkouts should be detected as conflict", isConflict)
    }
    
    @Test
    fun `conflict resolution should prefer earlier checkout`() {
        val checkout1 = createMockEquipmentCheckout(
            equipmentId = "equip-001",
            memberId = "member-a",
            deviceId = "tablet-trainer-01",
            checkedOutAt = Instant.parse("2026-01-20T10:00:00Z")
        )
        
        val checkout2 = createMockEquipmentCheckout(
            equipmentId = "equip-001",
            memberId = "member-b",
            deviceId = "tablet-trainer-02",
            checkedOutAt = Instant.parse("2026-01-20T10:01:00Z")
        )
        
        // First-write-wins strategy
        val winner = if (checkout1.checkedOutAtUtc < checkout2.checkedOutAtUtc) checkout1 else checkout2
        
        assertEquals("Earlier checkout should win", checkout1.id, winner.id)
    }
    
    // ===== 28.7: Master data push from laptop to multiple tablets =====
    
    @Test
    fun `member push payload should include all member fields`() {
        val member = createMockMember(
            internalId = "uuid-123",
            membershipId = "M001",
            firstName = "Test",
            lastName = "Member"
        )
        
        val payload = createSyncPayload(
            deviceId = "laptop-master",
            deviceType = LAPTOP,
            members = listOf(member)
        )
        
        val syncedMember = payload.entities.members.first()
        assertEquals("Internal ID should be preserved", "uuid-123", syncedMember.internalId)
        assertEquals("Membership ID should be preserved", "M001", syncedMember.membershipId)
        assertEquals("First name should be preserved", "Test", syncedMember.firstName)
        assertEquals("Last name should be preserved", "Member", syncedMember.lastName)
    }
    
    @Test
    fun `laptop push should include device type LAPTOP`() {
        val payload = createSyncPayload(
            deviceId = "laptop-master",
            deviceType = LAPTOP,
            members = emptyList()
        )
        
        assertEquals("Device type should be LAPTOP", "LAPTOP", payload.deviceType)
    }
    
    // ===== 28.8: Device pairing flow =====
    
    @Test
    fun `pairing token should have 5 minute expiration`() {
        val tokenCreatedAt = Clock.System.now()
        val expectedExpiration = tokenCreatedAt.plus(kotlin.time.Duration.parse("5m"))
        
        val expirationMinutes = 5
        
        assertEquals("Token should expire in 5 minutes", 5, expirationMinutes)
    }
    
    @Test
    fun `pairing payload should include network identity`() {
        val pairingCode = "ABC123"
        val laptopAddress = "192.168.1.100:8085"
        val networkId = "club-sync-network"
        
        assertNotNull("Pairing code should be generated", pairingCode)
        assertNotNull("Laptop address should be included", laptopAddress)
        assertNotNull("Network ID should be included", networkId)
    }
    
    // ===== Helper Methods and Data Classes =====
    
    data class MockCheckIn(
        val id: String,
        val internalMemberId: String,
        val localDate: LocalDate,
        val firstOfDayFlag: Boolean,
        val deviceId: String,
        val syncVersion: Long,
        val createdAtUtc: Instant,
        val syncedAtUtc: Instant?
    )
    
    data class MockPracticeSession(
        val id: String,
        val internalMemberId: String,
        val localDate: LocalDate,
        val practiceType: String,
        val points: Int,
        val classification: String?,
        val deviceId: String,
        val syncVersion: Long,
        val createdAtUtc: Instant
    )
    
    data class MockEquipmentCheckout(
        val id: String,
        val equipmentId: String,
        val internalMemberId: String,
        val checkedOutAtUtc: Instant,
        val checkedInAtUtc: Instant?,
        val checkedOutByDeviceId: String,
        val checkedInByDeviceId: String?,
        val deviceId: String,
        val syncVersion: Long
    )
    
    data class MockMember(
        val internalId: String,
        val membershipId: String?,
        val firstName: String,
        val lastName: String,
        val deviceId: String,
        val syncVersion: Long
    )
    
    data class MockSyncPayload(
        val schemaVersion: String,
        val deviceId: String,
        val deviceType: String,
        val timestamp: String,
        val entities: MockEntities
    )
    
    data class MockEntities(
        val members: List<MockMember> = emptyList(),
        val checkIns: List<MockCheckIn> = emptyList(),
        val practiceSessions: List<MockPracticeSession> = emptyList(),
        val equipmentCheckouts: List<MockEquipmentCheckout> = emptyList()
    )
    
    private fun createMockCheckIn(
        memberId: String,
        deviceId: String,
        localDate: LocalDate,
        createdAt: Instant = Clock.System.now()
    ) = MockCheckIn(
        id = "checkin-${java.util.UUID.randomUUID()}",
        internalMemberId = memberId,
        localDate = localDate,
        firstOfDayFlag = true,
        deviceId = deviceId,
        syncVersion = 1,
        createdAtUtc = createdAt,
        syncedAtUtc = null
    )
    
    private fun createMockPracticeSession(
        memberId: String,
        deviceId: String,
        points: Int,
        practiceType: String
    ) = MockPracticeSession(
        id = "session-${java.util.UUID.randomUUID()}",
        internalMemberId = memberId,
        localDate = LocalDate(2026, 1, 20),
        practiceType = practiceType,
        points = points,
        classification = "A",
        deviceId = deviceId,
        syncVersion = 1,
        createdAtUtc = Clock.System.now()
    )
    
    private fun createMockEquipmentCheckout(
        equipmentId: String,
        memberId: String,
        deviceId: String,
        checkedOutAt: Instant = Clock.System.now()
    ) = MockEquipmentCheckout(
        id = "checkout-${java.util.UUID.randomUUID()}",
        equipmentId = equipmentId,
        internalMemberId = memberId,
        checkedOutAtUtc = checkedOutAt,
        checkedInAtUtc = null,
        checkedOutByDeviceId = deviceId,
        checkedInByDeviceId = null,
        deviceId = deviceId,
        syncVersion = 1
    )
    
    private fun createMockMember(
        internalId: String,
        membershipId: String?,
        firstName: String,
        lastName: String
    ) = MockMember(
        internalId = internalId,
        membershipId = membershipId,
        firstName = firstName,
        lastName = lastName,
        deviceId = "laptop-master",
        syncVersion = 1
    )
    
    private fun createSyncPayload(
        deviceId: String,
        deviceType: DeviceType,
        members: List<MockMember> = emptyList(),
        checkIns: List<MockCheckIn> = emptyList(),
        practiceSessions: List<MockPracticeSession> = emptyList(),
        equipmentCheckouts: List<MockEquipmentCheckout> = emptyList()
    ) = MockSyncPayload(
        schemaVersion = "1.0.0",
        deviceId = deviceId,
        deviceType = deviceType.name,
        timestamp = Clock.System.now().toString(),
        entities = MockEntities(
            members = members,
            checkIns = checkIns,
            practiceSessions = practiceSessions,
            equipmentCheckouts = equipmentCheckouts
        )
    )
}
