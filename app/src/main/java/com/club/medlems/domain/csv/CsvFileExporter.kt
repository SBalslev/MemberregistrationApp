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

    private suspend fun saveBytesToDownloads(displayName: String, mimeType: String, bytes: ByteArray): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, displayName)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Medlemscheckin")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                val uri = resolver.insert(collection, values) ?: return@withContext false
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                true
            } else {
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Medlemscheckin")
                if (!dir.exists()) dir.mkdirs()
                val outFile = File(dir, displayName)
                FileOutputStream(outFile).use { it.write(bytes) }
                true
            }
        } catch (_: Throwable) {
            false
        }
    }

    data class CsvExport(
        val file: File,
        // Relative (user-friendly) path like Downloads/Medlemscheckin/xxx.csv
        val publicPath: String?,
        // Absolute filesystem path if determinable (may be null on failure)
        val absolutePublicPath: String?
    )

    suspend fun saveCsv(basename: String, content: String): CsvExport = withContext(Dispatchers.IO) {
        val ts = timestamp()
        val display = "${basename}_${ts}.csv"
        val file = File(exportsDir(), display)
        file.writeText(content)
        val ok = saveBytesToDownloads(display, "text/csv", content.toByteArray())
        val relative = if (ok) "Download/Medlemscheckin/$display" else null
        val absolute = if (ok) {
            try {
                val base = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                File(base, "Medlemscheckin/$display").absolutePath
            } catch (_: Throwable) { null }
        } else null
        CsvExport(file, relative, absolute)
    }

    fun shareIntent(file: File): Intent {
        val uri: Uri = FileProvider.getUriForFile(context, context.packageName + ".provider", file)
        return Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    suspend fun saveZip(entries: List<Pair<String, String>>): CsvExport = withContext(Dispatchers.IO) {
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
        val ok = runCatching { saveBytesToDownloads(display, "application/zip", file.readBytes()) }.getOrDefault(false)
        val relative = if (ok) "Download/Medlemscheckin/$display" else null
        val absolute = if (ok) {
            try {
                val base = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                File(base, "Medlemscheckin/$display").absolutePath
            } catch (_: Throwable) { null }
        } else null
        CsvExport(file, relative, absolute)
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
