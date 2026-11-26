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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsafe.monitor.UsageCollector
import com.kidsafe.monitor.data.local.AppDatabase
import com.kidsafe.monitor.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class TimelineItemUi(
    val timeText: String,
    val appName: String,
    val eventText: String,
    val durationText: String? = null,
    val category: String,
    val isScreenEvent: Boolean = false,
    val confidence: String = "High confidence",
    val source: String = "UsageStats"
)

@Composable
fun TimelineScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var selectedFilter by remember { mutableStateOf("Today") }
    var timelineList by remember { mutableStateOf<List<TimelineItemUi>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(selectedFilter) {
        withContext(Dispatchers.IO) {
            val db = AppDatabase.getInstance(context)
            val todayReport = try {
                UsageCollector.collectToday(context)
            } catch (_: Exception) { null }

            val tArray = todayReport?.optJSONArray("timeline")
            val items = mutableListOf<TimelineItemUi>()
            val timeFmt = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US)

            if (tArray != null && tArray.length() > 0) {
                for (i in 0 until tArray.length()) {
                    val obj = tArray.getJSONObject(i)
                    val tMs = obj.optLong("time", System.currentTimeMillis())
                    val durMs = obj.optLong("durationMs", 0L)
                    val durText = if (durMs > 0) "${(durMs / 60000L).coerceAtLeast(1L)}m" else null
                    val cat = obj.optString("category", "App")
                    items.add(
                        TimelineItemUi(
                            timeText = timeFmt.format(java.util.Date(tMs)),
                            appName = obj.optString("name", "Application"),
                            eventText = obj.optString("event", "opened"),
                            durationText = durText,
                            category = cat,
                            isScreenEvent = cat == "System" || obj.optString("package") == "system.device"
                        )
                    )
                }
            }

            timelineList = items.reversed()
            isLoading = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 16.dp)
    ) {
        // Top Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back")
            }
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(
                    text = "Activity Timeline",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    text = "Real-Time Device Events",
                    fontSize = 12.sp,
                    color = MutedText
                )
            }
        }

        // Filter Chips
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("Today", "All Activity").forEach { filter ->
                val isSelected = selectedFilter == filter
                FilterChip(
                    selected = isSelected,
                    onClick = { selectedFilter = filter },
                    label = { Text(filter, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = IndigoPrimary,
                        selectedLabelColor = Color.White
                    ),
                    shape = RoundedCornerShape(20.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Chronological Event Feed
        if (timelineList.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No activity events recorded yet today.\nTimeline will show app switches and screen unlocks as the phone is used.",
                    color = MutedText,
                    fontSize = 13.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    lineHeight = 20.sp
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(timelineList) { item ->
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
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                Box(
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(CircleShape)
                                        .background(if (item.isScreenEvent) TealSecondary.copy(alpha = 0.15f) else IndigoPrimaryLight),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = if (item.isScreenEvent) Icons.Default.LockOpen else Icons.Default.Apps,
                                        contentDescription = null,
                                        tint = if (item.isScreenEvent) TealSecondary else IndigoPrimary,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(text = item.appName, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(
                                        text = "${item.eventText}${item.durationText?.let { " • $it" } ?: ""}",
                                        fontSize = 12.sp,
                                        color = MutedText
                                    )
                                }
                            }

                            Text(
                                text = item.timeText,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = IndigoPrimary
                            )
                        }
                    }
                }
            }
        }
    }
}
