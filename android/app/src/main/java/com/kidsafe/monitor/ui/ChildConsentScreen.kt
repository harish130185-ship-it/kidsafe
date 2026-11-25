package com.kidsafe.monitor.ui

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsafe.monitor.UsageCollector
import com.kidsafe.monitor.service.MonitorManager
import com.kidsafe.monitor.ui.theme.*

@Composable
fun ChildConsentScreen() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("kidsafe_prefs", Context.MODE_PRIVATE) }

    var isMonitoringActive by remember { mutableStateOf(MonitorManager.isConsentGranted(context)) }
    var hasUsageAccess by remember { mutableStateOf(UsageCollector.granted(context)) }
    var serverUrl by remember { mutableStateOf(prefs.getString("server_url", "http://localhost:8080") ?: "") }
    var deviceToken by remember { mutableStateOf(prefs.getString("device_token", "kidsafe_device_secret_key_982374982374") ?: "") }
    var isGuardianConsentChecked by remember { mutableStateOf(isMonitoringActive) }

    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp)
            .verticalScroll(scrollState),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "KidSafe Child Device Setup",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )

        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(2.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        tint = IndigoPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Transparent Parental Monitoring",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "KidSafe only records application usage time and device unlock events. Private communications, messages, passwords, screen captures, and microphone audio are strictly never accessed or transmitted.",
                    fontSize = 13.sp,
                    color = MutedText,
                    lineHeight = 18.sp
                )
            }
        }

        // Permissions Checklist Card
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(1.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Required Permissions",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(12.dp))

                // 1. Usage Access
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(text = "1. Android Usage Access", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text(
                            text = if (hasUsageAccess) "Status: Granted" else "Required to calculate screen time",
                            fontSize = 12.sp,
                            color = if (hasUsageAccess) SuccessGreen else DangerRed
                        )
                    }
                    if (!hasUsageAccess) {
                        Button(
                            onClick = {
                                context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                })
                            },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                        ) {
                            Text("Grant", fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // Guardian consent checkbox
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Checkbox(
                checked = isGuardianConsentChecked,
                onCheckedChange = { isGuardianConsentChecked = it }
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "I confirm I am the parent or legal guardian and have explained this monitoring to the child.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onBackground
            )
        }

        // Start / Stop Monitoring Button
        Button(
            onClick = {
                val newState = !isMonitoringActive
                MonitorManager.setConsentGranted(context, newState)
                isMonitoringActive = newState
            },
            enabled = hasUsageAccess && isGuardianConsentChecked,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isMonitoringActive) DangerRed else SuccessGreen
            )
        ) {
            Text(
                text = if (isMonitoringActive) "Disable Monitoring & Stop Service" else "Enable Monitoring & Persistent Notification",
                fontWeight = FontWeight.Bold
            )
        }

        // Backend Sync Settings
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(1.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Parent Cloud Synchronization",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("Server API Endpoint") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = deviceToken,
                    onValueChange = { deviceToken = it },
                    label = { Text("Device Secret Token") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = {
                        prefs.edit()
                            .putString("server_url", serverUrl.trim())
                            .putString("device_token", deviceToken.trim())
                            .apply()
                    },
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save Cloud Sync Settings")
                }
            }
        }
    }
}
