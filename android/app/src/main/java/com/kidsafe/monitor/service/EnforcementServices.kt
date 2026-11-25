package com.kidsafe.monitor.service

import android.accessibilityservice.AccessibilityService
import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import com.kidsafe.monitor.data.local.AppDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class KidSafeDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Toast.makeText(context, "KidSafe protection enabled with guardian authority", Toast.LENGTH_SHORT).show()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        return "Disabling device administrator will stop parental monitoring protection. Enter guardian password to proceed."
    }
}

class KidSafeAccessibilityService : AccessibilityService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val packageName = event.packageName?.toString() ?: return

        // Ignore system packages & our own app
        if (packageName == applicationContext.packageName || 
            packageName.startsWith("com.android.systemui") || 
            packageName == "com.google.android.inputmethod.latin") {
            return
        }

        serviceScope.launch {
            val db = AppDatabase.getInstance(applicationContext)
            val limit = db.activityDao().getAppLimit(packageName)
            if (limit != null && limit.isBlocked) {
                // Return to home screen when blocked app attempts to open
                val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(homeIntent)
                launch(Dispatchers.Main) {
                    Toast.makeText(
                        applicationContext,
                        "🛡️ ${limit.appName} is paused by your parent's schedule.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    override fun onInterrupt() {}
}
