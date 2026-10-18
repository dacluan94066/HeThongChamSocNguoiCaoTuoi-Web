package com.example.elderly_care_app

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.Intent
import android.provider.OpenableColumns
import io.flutter.plugin.common.MethodChannel

// PrintManager does not expose the saved URI. The user explicitly selects their
// exported PDF; no report regeneration, broad storage access or persisted grant.
class CareReportShare(private val activity: Activity) {
    private var pending: MethodChannel.Result? = null
    private var confirmation: AlertDialog? = null
    private var pickCode = 7311
    private var shareCode = 7312

    fun cancel() {
        val result = pending
        pending = null
        if (result != null) {
            activity.finishActivity(pickCode)
            activity.finishActivity(shareCode)
        }
        confirmation?.dismiss()
        confirmation = null
        result?.success(false)
    }

    fun select(result: MethodChannel.Result) {
        if (pending != null) {
            result.error("BUSY", "Document selection already open", null)
            return
        }
        // Ignore late activity results from an earlier profile/session.
        pickCode = if (pickCode >= 64000) 7311 else pickCode + 2
        shareCode = pickCode + 1
        pending = result
        try {
            activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                type = "application/pdf"
                addCategory(Intent.CATEGORY_OPENABLE)
            }, pickCode)
        } catch (_: Exception) {
            fail()
        }
    }

    private fun fail() {
        val result = pending
        pending = null
        result?.error("FILE_UNAVAILABLE", "Cannot read or share document", null)
    }

    fun onResult(code: Int, status: Int, data: Intent?) {
        if (code != pickCode && code != shareCode || pending == null) return
        if (code == shareCode) {
            // Chooser return does not prove that another app delivered the file.
            cancel()
            return
        }
        val uri = data?.data
        if (status != Activity.RESULT_OK || uri == null) {
            cancel()
            return
        }
        try {
            require(uri.scheme == "content")
            val resolver = activity.contentResolver
            resolver.openInputStream(uri)?.use { stream ->
                val header = ByteArray(5)
                var read = 0
                while (read < header.size) {
                    val count = stream.read(header, read, header.size - read)
                    if (count < 0) break
                    read += count
                }
                require(read == 5 && String(header, Charsets.US_ASCII) == "%PDF-")
            } ?: throw IllegalArgumentException()
            var name = "PDF"
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) name = it.getString(0)?.take(160) ?: "PDF"
            }
            confirmation = AlertDialog.Builder(activity)
                .setTitle("Chia sẻ PDF đã chọn?")
                .setMessage("$name\n\nHãy kiểm tra đúng hồ sơ và khoảng ngày. File có thể chứa thông tin cá nhân.")
                .setNegativeButton("Hủy") { _, _ -> cancel() }
                .setOnCancelListener { cancel() }
                .setPositiveButton("Mở bảng chia sẻ") { _, _ ->
                    if (pending != null) {
                        try {
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "application/pdf"
                                putExtra(Intent.EXTRA_STREAM, uri)
                                clipData = ClipData.newRawUri("PDF", uri)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            activity.startActivityForResult(
                                Intent.createChooser(send, "Chia sẻ báo cáo PDF"), shareCode)
                        } catch (_: Exception) {
                            fail()
                        }
                    }
                }.show()
        } catch (_: Exception) {
            fail()
        }
    }
}
