package com.club.medlems.ui.common

import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.google.zxing.BarcodeFormat
import com.google.zxing.ResultPoint
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory

private const val TAG = "QrScannerView"

/**
 * Reusable QR code scanner composable wrapping ZXing [DecoratedBarcodeView].
 *
 * @param useBackCamera true for rear camera (id 0), false for front camera (id 1)
 * @param onQrScanned invoked on the calling thread when a QR code is decoded
 * @param onFrameProcessed optional callback invoked when the scanner processes result points
 * @param modifier layout modifier forwarded to the underlying [AndroidView]
 */
@Composable
fun QrScannerView(
    useBackCamera: Boolean,
    onQrScanned: (raw: String) -> Unit,
    onFrameProcessed: ((resultPoints: List<ResultPoint>) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var barcodeView by remember { mutableStateOf<DecoratedBarcodeView?>(null) }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            Log.i(TAG, "Creating DecoratedBarcodeView - ${if (useBackCamera) "back" else "front"} camera")
            DecoratedBarcodeView(ctx).apply {
                val formats = listOf(BarcodeFormat.QR_CODE)
                barcodeView = this
                decoderFactory = DefaultDecoderFactory(formats)

                val settings = barcodeView?.cameraSettings
                settings?.requestedCameraId = if (useBackCamera) 0 else 1
                settings?.isAutoFocusEnabled = true
                settings?.isContinuousFocusEnabled = true
                barcodeView?.cameraSettings = settings

                val callback = object : BarcodeCallback {
                    override fun barcodeResult(result: BarcodeResult?) {
                        result?.text?.let { raw ->
                            Log.i(TAG, "QR detected: ${raw.take(50)}")
                            onQrScanned(raw)
                        }
                    }

                    override fun possibleResultPoints(resultPoints: MutableList<ResultPoint>?) {
                        onFrameProcessed?.invoke(resultPoints.orEmpty())
                    }
                }

                decodeContinuous(callback)
                Log.i(TAG, "Scanner initialized")
            }
        }
    )

    DisposableEffect(Unit) {
        Log.i(TAG, "Resuming camera")
        barcodeView?.resume()
        onDispose {
            Log.i(TAG, "Pausing camera")
            barcodeView?.pause()
        }
    }
}
