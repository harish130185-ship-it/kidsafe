package com.kidsafe.monitor.ui

import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsafe.monitor.UsageCollector
import com.kidsafe.monitor.data.local.AppDatabase
import com.kidsafe.monitor.service.MonitorManager
import com.kidsafe.monitor.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class AppUsageUi(
    val name: String,
    val packageName: String,
    val category: String,
    val durationText: String,
    val limitMinutes: Int? = null,
    val isBlocked: Boolean = false
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ParentDashboardScreen(
    onNavigateTimeline: () -> Unit,
    onNavigateLimits: () -> Unit
) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("kidsafe_prefs", Context.MODE_PRIVATE) }
    val childName = remember { prefs.getString("child_name", "Child") ?: "Child" }

    var isMonitoringActive by remember { mutableStateOf(false) }
    var batteryLevel by remember { mutableStateOf(85) }
    var screenTimeMs by remember { mutableStateOf(0L) }
    var unlocksCount by remember { mutableStateOf(0) }
    var appUsageList by remember { mutableStateOf<List<AppUsageUi>>(emptyList()) }
    var isDataLoaded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            isMonitoringActive = MonitorManager.isConsentGranted(context)

            // Read actual device battery
            val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val bat = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            batteryLevel = if (bat in 1..100) bat else {
                val bIntent = context.registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
                val lvl = bIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val scl = bIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
                if (lvl >= 0 && scl > 0) ((lvl / scl.toFloat()) * 100).toInt().coerceIn(1, 100) else 80
            }

            // Collect real UsageStats from Android OS
            val db = AppDatabase.getInstance(context)
            val todayReport = try {
                UsageCollector.collectToday(context)
            } catch (_: Exception) { null }

            var finalScreenTime = todayReport?.optLong("totalScreenTimeMs", 0L) ?: 0L
            var finalUnlocks = todayReport?.optInt("screenUnlocksApprox", 0) ?: 0
            val day = todayReport?.optString("day", "") ?: ""

            // Fallback to local Room cache if device is locked / returned 0ms
            if (finalScreenTime == 0L && day.isNotBlank()) {
                val cached = db.activityDao().getReport(day)
                if (cached != null && cached.totalScreenTimeMs > 0L) {
                    finalScreenTime = cached.totalScreenTimeMs
                    finalUnlocks = Math.max(finalUnlocks, cached.screenUnlocksApprox)
                }
            }

            val appsArray = todayReport?.optJSONArray("apps")
            val loadedApps = mutableListOf<AppUsageUi>()
            if (appsArray != null && appsArray.length() > 0) {
                for (i in 0 until appsArray.length()) {
                    val a = appsArray.getJSONObject(i)
                    val durMs = a.optLong("durationMs", 0L)
                    val mins = (durMs / 60000L).toInt()
                    val durText = if (mins >= 60) "${mins / 60}h ${mins % 60}m" else "${mins}m"
                    loadedApps.add(
                        AppUsageUi(
                            name = a.optString("name", a.getString("package")),
                            packageName = a.getString("package"),
                            category = a.optString("category", "App"),
                            durationText = durText
                        )
                    )
                }
            }

            screenTimeMs = finalScreenTime
            unlocksCount = finalUnlocks
            appUsageList = loadedApps
            isDataLoaded = true

            // Trigger immediate background sync to web dashboard
            try {
                MonitorManager.syncNow(context)
            } catch (_: Exception) {}
        }
    }

    val totalMins = (screenTimeMs / 60000L).toInt()
    val screenTimeText = if (totalMins >= 60) "${totalMins / 60}h ${totalMins % 60}m" else "${totalMins}m"

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(vertical = 16.dp)
    ) {
        // 1. Header with Device Info & Status Pill
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "KidSafe Activity Monitor",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = "This Device: ${Build.MODEL}",
                        fontSize = 12.sp,
                        color = MutedText
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconButton(
                        onClick = {
                            MonitorManager.syncNow(context)
                            android.widget.Toast.makeText(context, "⚡ Syncing live activity to web dashboard...", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Sync Now",
                            tint = IndigoPrimary
                        )
                    }

                    Surface(
                        color = if (isMonitoringActive) SuccessGreen.copy(alpha = 0.15f) else DangerRed.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Text(
                            text = if (isMonitoringActive) "● Active" else "● Inactive",
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isMonitoringActive) SuccessGreen else DangerRed
                        )
                    }
                }
            }
        }

        // 2. Real Device Status Card
        item {
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(IndigoPrimary),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = childName.take(1).uppercase(),
                                color = Color.White,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "$childName's Phone",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                            Text(
                                text = "${Build.MANUFACTURER} ${Build.MODEL} • 🔋 $batteryLevel%",
                                fontSize = 12.sp,
                                color = MutedText
                            )
                        }
                    }

                    Surface(
                        color = SuccessGreen.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = "Supervised",
                            color = SuccessGreen,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }

        // 3. Real Today's Summary Grid
        item {
            Text(
                text = "Today's Summary",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(8.dp))

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    SummaryMetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Screen Time",
                        value = screenTimeText,
                        subtext = "Target: 2h daily",
                        icon = Icons.Default.AccessTime,
                        iconTint = IndigoPrimary
                    )
                    SummaryMetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Unlocks",
                        value = "$unlocksCount",
                        subtext = if (unlocksCount > 0) "$unlocksCount times unlocked" else "Screen locked/idle",
                        icon = Icons.Default.LockOpen,
                        iconTint = TealSecondary
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    SummaryMetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Apps Active",
                        value = "${appUsageList.size}",
                        subtext = "Used on this phone",
                        icon = Icons.Default.Apps,
                        iconTint = WarningAmber
                    )
                    SummaryMetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Protection",
                        value = if (isMonitoringActive) "Protected" else "Setup Needed",
                        subtext = if (isMonitoringActive) "Syncing to Cloud" else "Open Device Setup",
                        icon = Icons.Default.CheckCircle,
                        iconTint = if (isMonitoringActive) SuccessGreen else DangerRed
                    )
                }
            }
        }

        // 4. Most-Used Applications Section
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Most-Used Applications",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                TextButton(onClick = onNavigateTimeline) {
                    Text("Timeline", color = IndigoPrimary, fontWeight = FontWeight.Bold)
                }
            }
        }

        if (appUsageList.isEmpty()) {
            item {
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(modifier = Modifier.padding(24.dp), contentAlignment = Alignment.Center) {
                        Text(
                            text = if (isMonitoringActive) "No apps recorded yet today. Usage updates automatically as apps are opened." else "Please open 'Device Setup' tab to enable monitoring.",
                            fontSize = 13.sp,
                            color = MutedText,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        } else {
            items(appUsageList) { app ->
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(1.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(IndigoPrimaryLight),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Android,
                                    contentDescription = null,
                                    tint = IndigoPrimary
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(text = app.name, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                Text(text = app.category, fontSize = 11.sp, color = MutedText)
                            }
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text(text = app.durationText, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text(
                                text = "Today",
                                fontSize = 11.sp,
                                color = MutedText
                            )
                        }
                    }
                }
            }
        }

        // 5. Activity Timeline Button
        item {
            Button(
                onClick = onNavigateTimeline,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
            ) {
                Icon(imageVector = Icons.Default.Timeline, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("View Real-Time Activity Timeline")
            }
        }
    }
}

@Composable
fun SummaryMetricCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    subtext: String,
    icon: ImageVector,
    iconTint: Color
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = title.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MutedText)
                Icon(imageVector = icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(18.dp))
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = value, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = subtext, fontSize = 11.sp, color = MutedText)
        }
    }
}
