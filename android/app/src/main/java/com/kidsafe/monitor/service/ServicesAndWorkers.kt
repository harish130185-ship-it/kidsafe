package com.kidsafe.monitor.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.kidsafe.monitor.MainActivity
import com.kidsafe.monitor.data.local.AppDatabase
import com.kidsafe.monitor.data.local.DailyReportEntity
import com.kidsafe.monitor.data.local.TimelineEventEntity
import com.kidsafe.monitor.data.remote.*
import com.kidsafe.monitor.UsageCollector
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object MonitorManager {
    private const val CHANNEL_ID = "kidsafe_persistent_monitoring"
    private const val NOTIFICATION_ID = 2001
    private const val WORK_NAME = "kidsafe_periodic_sync_work"

    fun isConsentGranted(context: Context): Boolean {
        return context.getSharedPreferences("kidsafe_prefs", Context.MODE_PRIVATE)
            .getBoolean("guardian_consent_granted", false)
    }

    fun setConsentGranted(context: Context, granted: Boolean) {
        context.getSharedPreferences("kidsafe_prefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("guardian_consent_granted", granted)
            .apply()

        if (granted) {
            showPersistentNotification(context)
            schedulePeriodicSync(context)
            syncNow(context)
        } else {
            stopMonitoring(context)
        }
    }

    fun showPersistentNotification(context: Context) {
        if (!isConsentGranted(context)) return

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "KidSafe Activity Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows ongoing transparency status for parental screen time monitoring."
                setShowBadge(false)
            }
            nm.createNotificationChannel(channel)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return
        }

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.EXTRA_DOCK_STATE_UNDOCKED
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle("KidSafe Monitoring is Active")
            .setContentText("App usage is logged for parent dashboard. Tap to manage or stop.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()

        nm.notify(NOTIFICATION_ID, notification)
    }

    fun schedulePeriodicSync(context: Context) {
        if (!isConsentGranted(context)) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<KidSafeSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )
    }

    fun syncNow(context: Context) {
        if (!isConsentGranted(context)) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val oneTimeRequest = OneTimeWorkRequestBuilder<KidSafeSyncWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            "kidsafe_instant_sync_work",
            ExistingWorkPolicy.REPLACE,
            oneTimeRequest
        )
    }

    fun stopMonitoring(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID)
    }
}

class KidSafeSyncWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val context = applicationContext
        if (!MonitorManager.isConsentGranted(context) || !UsageCollector.granted(context)) {
            return@withContext Result.success()
        }

        try {
            // 1. Collect real UsageStats
            val todayReport = UsageCollector.collectToday(context)
            val day = todayReport.getString("day")
            val rawUnlocks = todayReport.getInt("screenUnlocksApprox")
            val rawScreenTime = todayReport.optLong("totalScreenTimeMs", 0L)

            // 2. Cache in Room Database with Lock/Idle Preservation
            val db = AppDatabase.getInstance(context)
            val cachedReport = db.activityDao().getReport(day)

            var activeReportJson = todayReport
            var finalScreenTime = rawScreenTime
            var finalUnlocks = rawUnlocks

            // If phone is currently locked or usageStats returned 0ms, preserve previous valid usage
            if (rawScreenTime == 0L && cachedReport != null && cachedReport.totalScreenTimeMs > 0L) {
                try {
                    activeReportJson = org.json.JSONObject(cachedReport.payloadJson)
                    finalScreenTime = cachedReport.totalScreenTimeMs
                    finalUnlocks = Math.max(rawUnlocks, cachedReport.screenUnlocksApprox)
                } catch (_: Exception) {}
            } else {
                val entity = DailyReportEntity(
                    day = day,
                    totalScreenTimeMs = finalScreenTime,
                    screenUnlocksApprox = finalUnlocks,
                    payloadJson = activeReportJson.toString(),
                    updatedAt = System.currentTimeMillis()
                )
                db.activityDao().insertReport(entity)
            }

            // Cache timeline events
            val timelineArray = activeReportJson.optJSONArray("timeline") ?: org.json.JSONArray()
            val timelineList = mutableListOf<TimelineEventEntity>()
            for (i in 0 until timelineArray.length()) {
                val obj = timelineArray.getJSONObject(i)
                timelineList.add(
                    TimelineEventEntity(
                        id = obj.optString("id", "$day-$i"),
                        day = day,
                        packageName = obj.getString("package"),
                        appName = obj.optString("name", obj.getString("package")),
                        eventType = obj.getString("event"),
                        timestamp = obj.getLong("time"),
                        durationMs = obj.optLong("durationMs", 0L),
                        category = obj.optString("category", "Other"),
                        confidence = obj.optString("confidence", "high"),
                        source = obj.optString("source", "UsageStats")
                    )
                )
            }
            if (timelineList.isNotEmpty()) {
                db.activityDao().insertTimelineEvents(timelineList)
            }

            // 3. Sync to Backend if Server URL and Device Token are configured
            val prefs = context.getSharedPreferences("kidsafe_prefs", Context.MODE_PRIVATE)
            val serverUrl = prefs.getString("server_url", "")?.trim()?.trimEnd('/') ?: ""
            val deviceToken = prefs.getString("device_token", "")?.trim() ?: ""
            val childId = prefs.getString("child_id", "child-leo") ?: "child-leo"

            if (serverUrl.startsWith("http") && deviceToken.isNotBlank()) {
                val api = ApiClient.create(serverUrl)

                // Read real battery level accurately
                val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
                val cap = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
                val batteryLevel = if (cap in 1..100) cap else {
                    val bFilter = android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)
                    val bIntent = context.registerReceiver(null, bFilter)
                    val level = bIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                    val scale = bIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
                    if (level >= 0 && scale > 0) ((level / scale.toFloat()) * 100).toInt().coerceIn(1, 100) else 75
                }

                // Convert to remote models
                val appsArray = activeReportJson.optJSONArray("apps") ?: org.json.JSONArray()
                val remoteApps = mutableListOf<RemoteAppUsage>()
                for (i in 0 until appsArray.length()) {
                    val a = appsArray.getJSONObject(i)
                    remoteApps.add(
                        RemoteAppUsage(
                            packageName = a.getString("package"),
                            name = a.optString("name", a.getString("package")),
                            category = a.optString("category", "Other"),
                            durationMs = a.getLong("durationMs")
                        )
                    )
                }

                val remoteTimeline = timelineList.map {
                    RemoteTimelineEvent(
                        id = it.id,
                        packageName = it.packageName,
                        name = it.appName,
                        event = it.eventType,
                        time = it.timestamp,
                        durationMs = it.durationMs,
                        category = it.category,
                        confidence = it.confidence,
                        source = it.source
                    )
                }

                val request = SyncReportRequest(
                    childId = childId,
                    day = day,
                    screenUnlocksApprox = finalUnlocks,
                    batteryLevel = batteryLevel,
                    apps = remoteApps,
                    timeline = remoteTimeline
                )

                val response = api.uploadReport("Bearer $deviceToken", request)
                if (!response.isSuccessful) {
                    return@withContext Result.retry()
                }

                // Check and update limits from backend
                val limitsRes = api.fetchLimits("Bearer $deviceToken", childId)
                if (limitsRes.isSuccessful && limitsRes.body() != null) {
                    val limitsEntities = limitsRes.body()!!.limits.map {
                        com.kidsafe.monitor.data.local.AppLimitEntity(
                            packageName = it.packageName,
                            appName = it.name,
                            category = it.category,
                            dailyLimitMinutes = it.dailyLimitMinutes,
                            isBlocked = it.isBlocked
                        )
                    }
                    db.activityDao().saveAppLimits(limitsEntities)
                }
            }

            MonitorManager.showPersistentNotification(context)
            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            MonitorManager.showPersistentNotification(context)
            MonitorManager.schedulePeriodicSync(context)
        }
    }
}
