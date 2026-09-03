package com.club.medlems.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class PairingProfileTransferTest {
    private val profile = PairingProfileTransferData(
        networkId = "NET-test",
        deviceId = "device-id",
        deviceInfo = """{"id":"device-id"}""",
        trustedDevices = """[]""",
        connectionProfiles = """{}""",
        persistentToken = "persistent-token",
        deviceTokens = """{}"""
    )

    @Test
    fun `encrypted profile decrypts with the export passphrase`() {
        val encrypted = PairingProfileTransfer.encrypt(profile, "correct horse battery staple")

        assertNotEquals(profile.networkId, encrypted)
        assertEquals(profile, PairingProfileTransfer.decrypt(encrypted, "correct horse battery staple"))
    }

    @Test(expected = PairingProfileTransferException::class)
    fun `encrypted profile rejects an incorrect passphrase`() {
        val encrypted = PairingProfileTransfer.encrypt(profile, "correct horse battery staple")

        PairingProfileTransfer.decrypt(encrypted, "incorrect horse battery staple")
    }

    @Test(expected = PairingProfileTransferException::class)
    fun `profile requires a sufficiently long passphrase`() {
        PairingProfileTransfer.encrypt(profile, "too-short")
    }
}
