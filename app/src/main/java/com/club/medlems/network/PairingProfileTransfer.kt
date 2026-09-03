package com.club.medlems.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

@Serializable
internal data class PairingProfileTransferData(
    val formatVersion: Int = 1,
    val networkId: String,
    val deviceId: String,
    val deviceInfo: String,
    val trustedDevices: String,
    val connectionProfiles: String,
    val persistentToken: String,
    val deviceTokens: String
)

@Serializable
private data class EncryptedPairingProfile(
    val formatVersion: Int = 1,
    val salt: String,
    val initializationVector: String,
    val ciphertext: String
)

internal class PairingProfileTransferException(message: String, cause: Throwable? = null) :
    IllegalArgumentException(message, cause)

internal object PairingProfileTransfer {
    private const val ITERATIONS = 210_000
    private const val KEY_LENGTH_BITS = 256
    private const val SALT_LENGTH_BYTES = 16
    private const val IV_LENGTH_BYTES = 12
    private val json = Json { ignoreUnknownKeys = false }

    fun encrypt(profile: PairingProfileTransferData, passphrase: String): String {
        validatePassphrase(passphrase)
        return try {
            val salt = ByteArray(SALT_LENGTH_BYTES).also(SecureRandom()::nextBytes)
            val initializationVector = ByteArray(IV_LENGTH_BYTES).also(SecureRandom()::nextBytes)
            val plaintext = json.encodeToString(PairingProfileTransferData.serializer(), profile)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.ENCRYPT_MODE,
                deriveKey(passphrase, salt),
                GCMParameterSpec(128, initializationVector)
            )

            json.encodeToString(
                EncryptedPairingProfile.serializer(),
                EncryptedPairingProfile(
                    salt = Base64.getEncoder().encodeToString(salt),
                    initializationVector = Base64.getEncoder().encodeToString(initializationVector),
                    ciphertext = Base64.getEncoder().encodeToString(
                        cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
                    )
                )
            )
        } catch (e: PairingProfileTransferException) {
            throw e
        } catch (e: Exception) {
            throw PairingProfileTransferException("Could not encrypt pairing configuration", e)
        }
    }

    fun decrypt(serializedProfile: String, passphrase: String): PairingProfileTransferData {
        validatePassphrase(passphrase)
        return try {
            val encrypted = json.decodeFromString(EncryptedPairingProfile.serializer(), serializedProfile)
            require(encrypted.formatVersion == 1) { "Unsupported pairing configuration version" }
            val salt = Base64.getDecoder().decode(encrypted.salt)
            val initializationVector = Base64.getDecoder().decode(encrypted.initializationVector)
            val ciphertext = Base64.getDecoder().decode(encrypted.ciphertext)
            require(salt.size == SALT_LENGTH_BYTES) { "Invalid pairing configuration salt" }
            require(initializationVector.size == IV_LENGTH_BYTES) { "Invalid pairing configuration initialization vector" }

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                deriveKey(passphrase, salt),
                GCMParameterSpec(128, initializationVector)
            )
            json.decodeFromString(
                PairingProfileTransferData.serializer(),
                String(cipher.doFinal(ciphertext), Charsets.UTF_8)
            )
        } catch (e: PairingProfileTransferException) {
            throw e
        } catch (e: Exception) {
            throw PairingProfileTransferException(
                "Could not open pairing configuration. Check the file and passphrase.",
                e
            )
        }
    }

    private fun deriveKey(passphrase: String, salt: ByteArray): SecretKeySpec {
        val password = passphrase.toCharArray()
        return try {
            val keySpec = PBEKeySpec(password, salt, ITERATIONS, KEY_LENGTH_BITS)
            val key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1")
                .generateSecret(keySpec)
                .encoded
            SecretKeySpec(key, "AES")
        } finally {
            password.fill('\u0000')
        }
    }

    private fun validatePassphrase(passphrase: String) {
        if (passphrase.length < 12) {
            throw PairingProfileTransferException("Passphrase must contain at least 12 characters")
        }
    }
}
