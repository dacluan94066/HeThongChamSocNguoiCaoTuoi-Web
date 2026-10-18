package com.example.elderly_care_app

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintJob
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import io.flutter.plugin.common.MethodChannel

// Local HTML only. No storage permission, network resources, or automatic sharing.
class CareReportPrint(private val activity: Activity) {
    private val handler = Handler(Looper.getMainLooper())
    private var view: WebView? = null
    private var job: PrintJob? = null
    private var pending: MethodChannel.Result? = null
    private var timeout: Runnable? = null

    fun cancel() {
        job?.cancel()
        pending?.error("CANCELLED", "Report session changed", null)
        release()
    }

    private fun release() {
        timeout?.let { handler.removeCallbacks(it) }
        timeout = null
        pending = null
        job = null
        view?.destroy()
        view = null
    }

    fun print(html: String?, result: MethodChannel.Result) {
        if (view != null) {
            result.error("BUSY", "Print preview is already open", null)
            return
        }
        if (html == null || html.length > 200000 || !html.startsWith("<!doctype html>")) {
            result.error("INVALID_REPORT", "Invalid report document", null)
            return
        }
        val manager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
        if (manager == null) {
            result.error("UNAVAILABLE", "Print service unavailable", null)
            return
        }
        pending = result
        val web = WebView(activity)
        view = web
        web.settings.apply {
            javaScriptEnabled = false
            blockNetworkLoads = true
            allowFileAccess = false
            allowContentAccess = false
        }
        timeout = Runnable {
            pending?.error("TIMEOUT", "Print preview timed out", null)
            release()
        }.also { handler.postDelayed(it, 20000) }
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(webView: WebView, url: String) {
                if (pending == null || view !== webView) return
                try {
                    val source = webView.createPrintDocumentAdapter("Bao cao cham soc")
                    val adapter = object : PrintDocumentAdapter() {
                        override fun onStart() = source.onStart()
                        override fun onLayout(old: PrintAttributes?, new: PrintAttributes?, signal: CancellationSignal?, callback: LayoutResultCallback?, extras: Bundle?) {
                            source.onLayout(old, new, signal, callback, extras)
                        }
                        override fun onWrite(pages: Array<out PageRange>?, destination: ParcelFileDescriptor?, signal: CancellationSignal?, callback: WriteResultCallback?) {
                            try {
                                if (destination == null) {
                                    callback?.onWriteFailed("Chưa tạo được file PDF. Hãy chọn lại vị trí lưu.")
                                    return
                                }
                                source.onWrite(pages, destination, signal, callback)
                            } catch (_: Exception) {
                                callback?.onWriteFailed("Chưa tạo được file PDF. Hãy thử lại.")
                            }
                        }
                        override fun onFinish() {
                            source.onFinish()
                            if (view === webView) release()
                        }
                    }
                    job = manager.print("Bao cao cham soc", adapter, PrintAttributes.Builder().build())
                    timeout?.let { handler.removeCallbacks(it) }
                    timeout = null
                    pending?.success(null)
                    pending = null
                } catch (_: Exception) {
                    pending?.error("PRINT_FAILED", "Could not open print preview", null)
                    release()
                }
            }
        }
        web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
    }
}
