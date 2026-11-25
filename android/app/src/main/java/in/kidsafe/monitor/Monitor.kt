package in.kidsafe.monitor

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.concurrent.TimeUnit

object Monitor {
    private const val CHANNEL = "monitoring_notice"
    fun active(c: Context) = c.getSharedPreferences("settings", Context.MODE_PRIVATE).getBoolean("consent", false)
    fun notify(c: Context) {
        if(!active(c)) return
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Activity monitoring status", NotificationManager.IMPORTANCE_LOW))
        if(Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val notification = Notification.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle("KidSafe monitoring is enabled")
            .setContentText("App usage is being logged. Open KidSafe to stop or delete logs.")
            .setOngoing(true).build()
        nm.notify(101, notification)
    }
    fun stop(c: Context) {
        WorkManager.getInstance(c).cancelUniqueWork("daily_activity_refresh")
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(101)
    }
    fun start(c: Context) {
        if(!active(c)) return
        notify(c)
        val request = PeriodicWorkRequestBuilder<ActivityWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
            .build()
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("daily_activity_refresh", ExistingPeriodicWorkPolicy.KEEP, request)
    }
}

class BootReceiver: android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: android.content.Intent) {
        if(intent.action == android.content.Intent.ACTION_BOOT_COMPLETED) Monitor.start(context)
    }
}

class ActivityWorker(context: Context, params: WorkerParameters): Worker(context, params) {
    override fun doWork(): Result {
        val c = applicationContext
        if(!Monitor.active(c) || !UsageCollector.granted(c)) return Result.success()
        return try {
            val today = UsageCollector.collectToday(c)
            ActivityStore(c).use { db ->
                db.save(today.getString("day"), today)
                val cutoff = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -30) }
                db.trim(UsageCollector.dayString(cutoff.timeInMillis))
            }
            Monitor.notify(c)
            val prefs = c.getSharedPreferences("settings", Context.MODE_PRIVATE)
            val base = prefs.getString("server", "")!!.trim().trimEnd('/')
            val key = prefs.getString("deviceToken", "")!!.trim()
            if(base.startsWith("https://") && key.isNotBlank()) {
                val conn = URL("$base/api/upload").openConnection() as HttpURLConnection
                try {
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 12000; conn.readTimeout = 12000
                    conn.doOutput = true
                    conn.setRequestProperty("Authorization", "Bearer $key")
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use { it.write(today.toString().toByteArray(Charsets.UTF_8)) }
                    if(conn.responseCode !in 200..299) return Result.retry()
                } finally { conn.disconnect() }
            }
            Result.success()
        } catch(_: Exception) { Result.retry() }
    }
}
