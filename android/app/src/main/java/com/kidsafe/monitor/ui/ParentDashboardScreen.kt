package com.kidsafe.monitor.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsafe.monitor.ui.theme.*

data class ChildUiState(
    val id: String = "child-leo",
    val name: String = "Leo",
    val deviceName: String = "Galaxy Tab A8",
    val batteryLevel: Int = 78,
    val isOnline: Boolean = true,
    val lastSyncText: String = "4m ago",
    val todayScreenTimeMs: Long = 5700000L, // 1h 35m
    val yesterdayScreenTimeMs: Long = 5520000L, // 1h 32m
    val unlocksCount: Int = 17,
    val appsUsedCount: Int = 4,
    val dailyLimitMinutes: Int = 120
)

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
    var selectedChild by remember { mutableStateOf("Leo") }
    val childState = remember(selectedChild) {
        if (selectedChild == "Leo") {
            ChildUiState()
        } else {
            ChildUiState(
                id = "child-maya",
                name = "Maya",
                deviceName = "Pixel 6a",
                batteryLevel = 92,
                todayScreenTimeMs = 7800000L, // 2h 10m
                yesterdayScreenTimeMs = 6600000L,
                unlocksCount = 24,
                appsUsedCount = 5,
                dailyLimitMinutes = 150
            )
        }
    }

    val mostUsedApps = remember(selectedChild) {
        if (selectedChild == "Leo") listOf(
            AppUsageUi("YouTube", "com.google.android.youtube", "Entertainment", "42m", 60),
            AppUsageUi("Roblox", "com.roblox.client", "Games", "35m", 45),
            AppUsageUi("Khan Academy", "org.khanacademy.android", "Education", "15m"),
            AppUsageUi("Chrome", "com.android.chrome", "Productivity", "8m")
        ) else listOf(
            AppUsageUi("Instagram", "com.instagram.android", "Social", "55m", 45),
            AppUsageUi("YouTube", "com.google.android.youtube", "Entertainment", "40m", 90),
            AppUsageUi("Spotify", "com.spotify.music", "Entertainment", "25m"),
            AppUsageUi("Duolingo", "com.duolingo", "Education", "18m")
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(vertical = 16.dp)
    ) {
        // 1. Header with Child Switcher
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "KidSafe Monitor",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = "Family Dashboard",
                        fontSize = 13.sp,
                        color = MutedText
                    )
                }

                // Child Switcher Tabs
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(24.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(4.dp)
                ) {
                    listOf("Leo", "Maya").forEach { name ->
                        val isSelected = selectedChild == name
                        Surface(
                            onClick = { selectedChild = name },
                            shape = RoundedCornerShape(20.dp),
                            color = if (isSelected) IndigoPrimary else Color.Transparent
                        ) {
                            Text(
                                text = name,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isSelected) Color.White else MutedText
                            )
                        }
                    }
                }
            }
        }

        // 2. Device Status Card
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
                                text = childState.name.take(1),
                                color = Color.White,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "${childState.name}'s ${childState.deviceName}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                            Text(
                                text = "Synced ${childState.lastSyncText} • 🔋 ${childState.batteryLevel}%",
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
                            text = "Active",
                            color = SuccessGreen,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }

        // 3. Summary Cards Grid
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
                        value = "1h 35m",
                        subtext = "Limit: 2h daily",
                        icon = Icons.Default.AccessTime,
                        iconTint = IndigoPrimary
                    )
                    SummaryMetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Unlocks",
                        value = "${childState.unlocksCount}",
                        subtext = "Approx 1 / 40m",
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
                        title = "vs Yesterday",
                        value = "+3%",
                        subtext = "1h 32m prior",
                        icon = Icons.Default.TrendingUp,
                        iconTint = WarningAmber
                    )
                    SummaryMetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Daily Limit",
                        value = "Within Limit",
                        subtext = "25m remaining",
                        icon = Icons.Default.CheckCircle,
                        iconTint = SuccessGreen
                    )
                }
            }
        }

        // 4. Most Used Applications
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
                TextButton(onClick = onNavigateLimits) {
                    Text("Limits", color = IndigoPrimary, fontWeight = FontWeight.Bold)
                }
            }
        }

        items(mostUsedApps) { app ->
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
                            text = if (app.limitMinutes != null) "Limit: ${app.limitMinutes}m" else "No limit",
                            fontSize = 11.sp,
                            color = MutedText
                        )
                    }
                }
            }
        }

        // 5. Activity Timeline Quick Link
        item {
            Button(
                onClick = onNavigateTimeline,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
            ) {
                Icon(imageVector = Icons.Default.Timeline, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("View Complete Activity Timeline")
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
                Text(text = title.toUpperCase(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MutedText)
                Icon(imageVector = icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(18.dp))
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = value, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = subtext, fontSize = 11.sp, color = MutedText)
        }
    }
}
