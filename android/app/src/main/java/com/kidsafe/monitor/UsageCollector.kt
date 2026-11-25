package com.kidsafe.monitor

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Process
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

object UsageCollector {
    private val dateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    @Synchronized 
    fun dayString(ms: Long = System.currentTimeMillis()): String = dateFmt.format(Date(ms))

    fun granted(context: Context): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        return ops.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        ) == AppOpsManager.MODE_ALLOWED
    }

    fun getAppMetadata(context: Context, packageName: String): Pair<String, String> {
        val pm = context.packageManager
        val cleanName = try {
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            val split = packageName.split(".")
            split.lastOrNull()?.replaceFirstChar { it.uppercase() } ?: packageName
        }

        val lower = packageName.toLowerCase(Locale.US)
        val category = when {
            lower.contains("youtube") || lower.contains("netflix") || lower.contains("video") || lower.contains("music") || lower.contains("spotify") -> "Entertainment"
            lower.contains("khan") || lower.contains("duolingo") || lower.contains("school") || lower.contains("edu") || lower.contains("learn") -> "Education"
            lower.contains("game") || lower.contains("roblox") || lower.contains("minecraft") || lower.contains("play") -> "Games"
            lower.contains("whatsapp") || lower.contains("instagram") || lower.contains("snapchat") || lower.contains("chat") || lower.contains("social") -> "Social"
            lower.contains("chrome") || lower.contains("browser") || lower.contains("drive") || lower.contains("docs") || lower.contains("office") -> "Productivity"
            lower.startsWith("com.android.") || lower.startsWith("com.google.android.apps.nexuslauncher") -> "System"
            else -> "Other"
        }

        return Pair(cleanName, category)
    }

    fun collect(context: Context, start: Long, end: Long): JSONObject {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val event = UsageEvents.Event()
        val events = usm.queryEvents(start, end)

        val opened = mutableMapOf<String, Long>()
        val totals = mutableMapOf<String, Long>()
        val timeline = JSONArray()
        var unlocks = 0

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val pkg = event.packageName ?: continue

            // Filter out system UI noise
            if (pkg == "com.android.systemui") continue

            val t = event.timeStamp.coerceIn(start, end)
            val (name, category) = getAppMetadata(context, pkg)

            when (event.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> {
                    if (!opened.containsKey(pkg)) opened[pkg] = t
                    if (timeline.length() < 2000) {
                        timeline.put(
                            JSONObject()
                                .put("id", "evt-$t-${pkg.hashCode()}")
                                .put("time", t)
                                .put("event", "opened")
                                .put("package", pkg)
                                .put("name", name)
                                .put("category", category)
                                .put("confidence", "high")
                                .put("source", "UsageStats")
                        )
                    }
                }
                UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
                    val began = opened.remove(pkg)
                    val duration = if (began != null) (t - began).coerceAtLeast(0L) else 0L
                    if (began != null) {
                        totals[pkg] = (totals[pkg] ?: 0L) + duration
                    }
                    if (timeline.length() < 2000) {
                        timeline.put(
                            JSONObject()
                                .put("id", "evt-$t-${pkg.hashCode()}")
                                .put("time", t)
                                .put("event", "closed")
                                .put("package", pkg)
                                .put("name", name)
                                .put("durationMs", duration)
                                .put("category", category)
                                .put("confidence", "high")
                                .put("source", "UsageStats")
                        )
                    }
                }
                UsageEvents.Event.KEYGUARD_HIDDEN -> {
                    unlocks++
                    if (timeline.length() < 2000) {
                        timeline.put(
                            JSONObject()
                                .put("id", "evt-unlock-$t")
                                .put("time", t)
                                .put("event", "screen_unlocked")
                                .put("package", "system.device")
                                .put("name", "Screen Unlocked")
                                .put("category", "System")
                                .put("confidence", "high")
                                .put("source", "UsageStats")
                        )
                    }
                }
            }
        }

        // Close any app still in foreground at snapshot end
        for ((pkg, began) in opened) {
            totals[pkg] = (totals[pkg] ?: 0L) + (end - began).coerceAtLeast(0L)
        }

        val apps = JSONArray()
        var totalScreenTimeMs = 0L
        totals.entries.sortedByDescending { it.value }.forEach { (pkg, millis) ->
            totalScreenTimeMs += millis
            val (name, category) = getAppMetadata(context, pkg)
            apps.put(
                JSONObject()
                    .put("package", pkg)
                    .put("name", name)
                    .put("category", category)
                    .put("durationMs", millis)
            )
        }

        return JSONObject()
            .put("day", dayString(start))
            .put("generatedAt", System.currentTimeMillis())
            .put("totalScreenTimeMs", totalScreenTimeMs)
            .put("screenUnlocksApprox", unlocks)
            .put("apps", apps)
            .put("timeline", timeline)
            .put("note", "Transparent parental activity metrics. No private communications, keystrokes or camera data logged.")
    }

    fun collectToday(context: Context): JSONObject {
        val c = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return collect(context, c.timeInMillis, System.currentTimeMillis())
    }
}
