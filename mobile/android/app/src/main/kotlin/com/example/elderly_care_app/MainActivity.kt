package com.example.elderly_care_app

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent

class MainActivity : FlutterActivity() {
    private var carePrint: CareReportPrint? = null
    private var careShare: CareReportShare? = null
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        carePrint = CareReportPrint(this)
        careShare = CareReportShare(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "elderly_care/report_print")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "print" -> carePrint?.print(call.argument<String>("html"), result)
                    "share" -> careShare?.select(result)
                    "cancel" -> { carePrint?.cancel(); careShare?.cancel(); result.success(null) }
                    else -> result.notImplemented()
                }
            }
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        careShare?.onResult(requestCode, resultCode, data)
    }
    override fun onDestroy() {
        carePrint?.cancel()
        careShare?.cancel()
        carePrint = null
        super.onDestroy()
    }
}
