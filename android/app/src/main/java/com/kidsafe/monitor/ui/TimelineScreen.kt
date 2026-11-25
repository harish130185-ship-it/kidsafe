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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsafe.monitor.ui.theme.*

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
    var selectedFilter by remember { mutableStateOf("Today") }

    val sampleTimeline = remember(selectedFilter) {
        listOf(
            TimelineItemUi("12:15 PM", "Device Screen", "Screen turned off", null, "System", true),
            TimelineItemUi("11:30 AM", "Roblox", "Game launched (moved to foreground)", "45m", "Games"),
            TimelineItemUi("10:10 AM", "Chrome", "Moved to foreground", "12m", "Productivity"),
            TimelineItemUi("09:45 AM", "YouTube", "Moved to background", "30m", "Entertainment"),
            TimelineItemUi("09:15 AM", "YouTube", "Moved to foreground", null, "Entertainment"),
            TimelineItemUi("09:05 AM", "Device Screen", "Screen unlocked", null, "System", true)
        )
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
                    text = "Android UsageEvents Telemetry",
                    fontSize = 12.sp,
                    color = MutedText
                )
            }
        }

        // Filter Pills: Today, Yesterday, Last 7 Days, Custom
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("Today", "Yesterday", "Last 7 Days").forEach { filter ->
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
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            items(sampleTimeline) { item ->
                Card(
                    shape = RoundedCornerShape(16.dp),
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
                            // Timeline dot / icon
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(CircleShape)
                                    .background(if (item.isScreenEvent) TealSecondary.copy(alpha = 0.15f) else IndigoPrimaryLight),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (item.isScreenEvent) Icons.Default.Lock else Icons.Default.Apps,
                                    contentDescription = null,
                                    tint = if (item.isScreenEvent) TealSecondary else IndigoPrimary,
                                    modifier = Modifier.size(18.dp)
                                )
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = item.timeText,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = IndigoPrimary
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "• ${item.appName}",
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 13.sp
                                    )
                                }
                                Text(
                                    text = item.eventText,
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "${item.category}${if (item.durationText != null) " • Duration: ${item.durationText}" else ""}",
                                    fontSize = 11.sp,
                                    color = MutedText
                                )
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = SuccessGreen.copy(alpha = 0.12f)
                        ) {
                            Text(
                                text = "Verified",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = SuccessGreen,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
