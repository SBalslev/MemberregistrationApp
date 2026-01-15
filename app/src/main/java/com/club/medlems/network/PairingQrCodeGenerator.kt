package com.club.medlems.network

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Log
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.PairingQrCode
import com.club.medlems.data.sync.SyncSchemaVersion
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import java.security.SecureRandom
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Duration.Companion.minutes

/**
 * Generates pairing QR codes for the device pairing ceremony.
 * 
 * Usage Flow:
 * 1. Laptop calls [generatePairingQrCode] with device details
 * 2. Laptop displays the QR bitmap on screen
 * 3. Tablet scans the QR code and sends pairing request to endpoint
 * 
 * @see [design.md FR-22] - Device Pairing Ceremony Flow
 */
@Singleton
class PairingQrCodeGenerator @Inject constructor() {
    
    companion object {
        private const val TAG = "PairingQrCodeGenerator"
        private const val DEFAULT_QR_SIZE = 512
        private const val TOKEN_BYTES = 32 // 256-bit token
    }
    
    private val qrCodeWriter = QRCodeWriter()
    private val secureRandom = SecureRandom()
    
    /**
     * Generates a QR code bitmap for device pairing.
     * 
     * @param expectedDeviceType The type of device expected to scan this QR code
     * @param deviceName Human-friendly name to assign to the paired device
     * @param endpoint The HTTP endpoint URL where tablets should send pairing requests
     * @param networkId Unique identifier for this sync network
     * @param size Size of the QR code bitmap in pixels (default 512)
     * @return A pair of (QR Bitmap, PairingQrCode data) or null if generation fails
     */
    fun generatePairingQrCode(
        expectedDeviceType: DeviceType,
        deviceName: String,
        endpoint: String,
        networkId: String,
        size: Int = DEFAULT_QR_SIZE
    ): Pair<Bitmap, PairingQrCode>? {
        return try {
            val now = Clock.System.now()
            val expiresAt = now.plus(PairingQrCode.VALIDITY_MINUTES.minutes)
            
            val pairingQrCode = PairingQrCode(
                trustToken = generateTrustToken(),
                networkId = networkId,
                endpoint = endpoint,
                expectedDeviceType = expectedDeviceType,
                deviceName = deviceName,
                generatedAtUtc = now,
                expiresAtUtc = expiresAt,
                schemaVersion = SyncSchemaVersion.version
            )
            
            val qrString = pairingQrCode.toQrString()
            val bitmap = generateQrBitmap(qrString, size)
            
            if (bitmap != null) {
                Log.i(TAG, "Generated pairing QR code for $deviceName (expires at $expiresAt)")
                Pair(bitmap, pairingQrCode)
            } else {
                Log.e(TAG, "Failed to generate QR bitmap")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate pairing QR code", e)
            null
        }
    }
    
    /**
     * Generates a QR code bitmap from a string.
     * 
     * @param content The string content to encode
     * @param size Size of the bitmap in pixels
     * @return The QR code as a Bitmap, or null if generation fails
     */
    fun generateQrBitmap(content: String, size: Int = DEFAULT_QR_SIZE): Bitmap? {
        return try {
            val hints = mapOf(
                EncodeHintType.CHARACTER_SET to "UTF-8",
                EncodeHintType.MARGIN to 1 // Minimal quiet zone
            )
            
            val bitMatrix = qrCodeWriter.encode(
                content,
                BarcodeFormat.QR_CODE,
                size,
                size,
                hints
            )
            
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
            for (x in 0 until size) {
                for (y in 0 until size) {
                    bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
                }
            }
            
            Log.d(TAG, "Generated QR bitmap ${size}x$size for content (${content.length} chars)")
            bitmap
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate QR bitmap", e)
            null
        }
    }
    
    /**
     * Generates a cryptographically secure trust token.
     * 
     * @return Base64-encoded 256-bit random token
     */
    private fun generateTrustToken(): String {
        val bytes = ByteArray(TOKEN_BYTES)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
    
    /**
     * Validates a trust token format.
     * 
     * @param token The token to validate
     * @return True if the token has valid format
     */
    fun isValidTokenFormat(token: String): Boolean {
        return try {
            val decoded = Base64.getUrlDecoder().decode(token)
            decoded.size >= TOKEN_BYTES
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Checks if a pairing QR code data is still valid (not expired).
     * 
     * @param pairingQrCode The pairing data to check
     * @param currentTime Optional current time (defaults to now)
     * @return True if the QR code is still valid
     */
    fun isQrCodeValid(pairingQrCode: PairingQrCode, currentTime: Instant = Clock.System.now()): Boolean {
        return !pairingQrCode.isExpired(currentTime)
    }
}
