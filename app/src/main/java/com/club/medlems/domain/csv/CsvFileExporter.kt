package com.club.medlems.domain.csv

import android.content.Context
import android.content.Intent
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class CsvFileExporter(private val context: Context) {
    private fun timestamp(): String {
        val dt = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault())
        return "%04d%02d%02d_%02d%02d%02d".format(dt.year, dt.monthNumber, dt.dayOfMonth, dt.hour, dt.minute, dt.second)
    }

    private fun exportsDir(): File = File(context.getExternalFilesDir(null), "exports").apply { mkdirs() }

    private suspend fun saveBytesToDownloads(displayName: String, mimeType: String, bytes: ByteArray) = withContext(Dispatchers.IO) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, displayName)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Medlemscheckin")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                val uri = resolver.insert(collection, values) ?: return@withContext
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
                // Mark as complete
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } else {
                // Best-effort fallback for older devices (may require WRITE_EXTERNAL_STORAGE at runtime)
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Medlemscheckin")
                if (!dir.exists()) dir.mkdirs()
                val outFile = File(dir, displayName)
                FileOutputStream(outFile).use { it.write(bytes) }
            }
        } catch (_: Throwable) {
            // Ignore copy failures to Downloads to avoid breaking the export flow
        }
    }

    suspend fun saveCsv(basename: String, content: String): File = withContext(Dispatchers.IO) {
        val ts = timestamp()
        val display = "${basename}_${ts}.csv"
        val file = File(exportsDir(), display)
        file.writeText(content)
        // Also place a copy into the public Downloads folder
        saveBytesToDownloads(display, "text/csv", content.toByteArray())
        file
    }

    fun shareIntent(file: File): Intent {
        val uri: Uri = FileProvider.getUriForFile(context, context.packageName + ".provider", file)
        return Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    suspend fun saveZip(entries: List<Pair<String, String>>): File = withContext(Dispatchers.IO) {
        val ts = timestamp()
        val display = "export_bundle_${ts}.zip"
        val file = File(exportsDir(), display)
        ZipOutputStream(file.outputStream()).use { zos ->
            entries.forEach { (name, content) ->
                val entry = ZipEntry(if (name.endsWith(".csv")) name else "$name.csv")
                zos.putNextEntry(entry)
                zos.write(content.toByteArray())
                zos.closeEntry()
            }
            // manifest with metadata
            val manifestLines = buildString {
                appendLine("generated_at=$ts")
                entries.forEach { (name, content) ->
                    val csvName = if (name.endsWith(".csv")) name else "$name.csv"
                    val rows = content.lineSequence().filter { it.isNotBlank() }.count().let { if (it > 0) it - 1 else 0 }
                    appendLine("file=$csvName rows=$rows")
                }
            }
            zos.putNextEntry(ZipEntry("manifest.txt"))
            zos.write(manifestLines.toByteArray())
            zos.closeEntry()
        }
        // Copy into the public Downloads folder
        runCatching { saveBytesToDownloads(display, "application/zip", file.readBytes()) }
        file
    }

    fun shareZipIntent(file: File): Intent {
        val uri: Uri = FileProvider.getUriForFile(context, context.packageName + ".provider", file)
        return Intent(Intent.ACTION_SEND).apply {
            type = "application/zip"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }
}
