package com.kidsafe.monitor.ui

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.kidsafe.monitor.UsageCollector
import com.kidsafe.monitor.data.local.SecurePrefs
import com.kidsafe.monitor.data.remote.ApiClient
import com.kidsafe.monitor.data.remote.ClaimPairingRequest
import com.kidsafe.monitor.data.remote.PasswordLoginRequest
import com.kidsafe.monitor.service.KidSafeAccessibilityService
import com.kidsafe.monitor.service.MonitorManager
import com.kidsafe.monitor.ui.theme.*
import kotlinx.coroutines.launch
import java.security.MessageDigest
import java.util.UUID

private fun isAccessibilityServiceEnabled(context: Context): Boolean {
    return try {
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val expected = ComponentName(context, KidSafeAccessibilityService::class.java)
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabledServices)
        while (splitter.hasNext()) {
            val comp = ComponentName.unflattenFromString(splitter.next())
            if (comp == expected) return true
        }
        false
    } catch (_: Exception) {
        false
    }
}

@Composable
fun ChildConsentScreen(
    onNavigateHome: () -> Unit = {}
) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("kidsafe_prefs", Context.MODE_PRIVATE) }
    val coroutineScope = rememberCoroutineScope()

    // Guardian Authentication Gate State
    var isGuardianUnlocked by remember { mutableStateOf(false) }
    var loginEmail by remember {
        mutableStateOf(prefs.getString("parent_email", "") ?: "")
    }
    var loginPassword by remember { mutableStateOf("") }
    var isPasswordVisible by remember { mutableStateOf(false) }
    var isAuthenticating by remember { mutableStateOf(false) }
    var loginError by remember { mutableStateOf<String?>(null) }

    // Device Setup State
    var isMonitoringActive by remember { mutableStateOf(MonitorManager.isConsentGranted(context)) }
    var hasUsageAccess by remember { mutableStateOf(UsageCollector.granted(context)) }
    var hasAccessibilityAccess by remember { mutableStateOf(isAccessibilityServiceEnabled(context)) }
    var serverUrl by remember { mutableStateOf(prefs.getString("server_url", "https://kidsafe.railplus.in") ?: "https://kidsafe.railplus.in") }
    var deviceToken by remember { mutableStateOf(SecurePrefs.getSecret(context, "device_token")) }
    var pairedChildName by remember { mutableStateOf(prefs.getString("child_name", "Not Paired") ?: "Not Paired") }
    var isGuardianConsentChecked by remember { mutableStateOf(isMonitoringActive) }

    // Prominent Disclosure Dialogs (Google Play Store Policy Requirement)
    var showUsageDisclosureDialog by remember { mutableStateOf(false) }
    var showAccessibilityDisclosureDialog by remember { mutableStateOf(false) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasUsageAccess = UsageCollector.granted(context)
                hasAccessibilityAccess = isAccessibilityServiceEnabled(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { _ ->
        MonitorManager.setConsentGranted(context, true)
        isMonitoringActive = true
    }

    // Pairing Wizard State
    var pairingCodeInput by remember { mutableStateOf("") }
    var isPairingLoading by remember { mutableStateOf(false) }
    var pairingMessage by remember { mutableStateOf<String?>(null) }
    var pairingSuccess by remember { mutableStateOf(false) }

    val scrollState = rememberScrollState()

    // Helper to calculate SHA-256
    fun sha256(input: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    // ==========================================
    // 1. GUARDIAN LOGIN VERIFICATION GATE
    // ==========================================
    if (!isGuardianUnlocked) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(24.dp)
                .verticalScroll(scrollState),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Spacer(modifier = Modifier.height(20.dp))

            // Lock Icon Badge
            Box(
                modifier = Modifier
                    .size(76.dp)
                    .background(IndigoPrimary.copy(alpha = 0.12f), shape = RoundedCornerShape(38.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = "Security Lock",
                    tint = IndigoPrimary,
                    modifier = Modifier.size(38.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Guardian Authentication",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "Device Setup & Monitoring settings are password protected. Enter your KidSafe Parent Account credentials to proceed.",
                fontSize = 13.sp,
                color = MutedText,
                textAlign = TextAlign.Center,
                lineHeight = 18.sp
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Login Card
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    OutlinedTextField(
                        value = loginEmail,
                        onValueChange = { loginEmail = it },
                        label = { Text("Parent Email") },
                        placeholder = { Text("parent@example.com") },
                        leadingIcon = {
                            Icon(Icons.Default.Email, contentDescription = null, tint = IndigoPrimary)
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = loginPassword,
                        onValueChange = {
                            loginPassword = it
                            if (loginError != null) loginError = null
                        },
                        label = { Text("Parent Password") },
                        leadingIcon = {
                            Icon(Icons.Default.VpnKey, contentDescription = null, tint = IndigoPrimary)
                        },
                        trailingIcon = {
                            IconButton(onClick = { isPasswordVisible = !isPasswordVisible }) {
                                Icon(
                                    imageVector = if (isPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = if (isPasswordVisible) "Hide password" else "Show password",
                                    tint = MutedText
                                )
                            }
                        },
                        visualTransformation = if (isPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (loginError != null) {
                        Text(
                            text = loginError!!,
                            color = DangerRed,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    Button(
                        onClick = {
                            val email = loginEmail.trim().lowercase()
                            val pwd = loginPassword.trim()

                            if (email.isEmpty() || pwd.isEmpty()) {
                                loginError = "Please enter both email and password"
                                return@Button
                            }

                            isAuthenticating = true
                            loginError = null

                            coroutineScope.launch {
                                try {
                                    val safeUrl = if (serverUrl.trim().startsWith("https://")) serverUrl.trim() else "https://kidsafe.railplus.in"
                                    val api = ApiClient.create(safeUrl)
                                    val resp = api.loginWithPassword(PasswordLoginRequest(email, pwd))

                                    if (resp.isSuccessful && resp.body()?.ok == true) {
                                        // Cache hash, email, and session token in Keystore-backed SecurePrefs
                                        val hash = sha256(pwd)
                                        prefs.edit().putString("parent_email", email).apply()
                                        SecurePrefs.putSecret(context, "guardian_pwd_hash", hash)
                                        val tok = resp.body()?.token?.trim().orEmpty()
                                        if (tok.isNotBlank()) {
                                            SecurePrefs.putSecret(context, "parent_session_token", tok)
                                        }
                                        isGuardianUnlocked = true
                                    } else {
                                        loginError = resp.body()?.error ?: "Invalid email or password"
                                    }
                                } catch (e: Exception) {
                                    // Offline fallback check:
                                    val hash = sha256(pwd)
                                    val cachedHash = SecurePrefs.getSecret(context, "guardian_pwd_hash")
                                    val cachedEmail = prefs.getString("parent_email", "") ?: ""

                                    if (cachedHash.isNotEmpty() && hash == cachedHash &&
                                        (cachedEmail.isEmpty() || cachedEmail.equals(email, ignoreCase = true))
                                    ) {
                                        isGuardianUnlocked = true
                                    } else {
                                        loginError = "Connection error: ${e.message ?: "Unable to verify"}. If offline, ensure password was verified online previously."
                                    }
                                } finally {
                                    isAuthenticating = false
                                }
                            }
                        },
                        enabled = !isAuthenticating,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        if (isAuthenticating) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Verifying Guardian...")
                        } else {
                            Text("Unlock Device Setup", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { onNavigateHome() },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Cancel (Return to Dashboard)", color = MutedText)
            }
        }
        return
    }

    // ==========================================
    // 2. UNLOCKED DEVICE SETUP SCREEN
    // ==========================================
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp)
            .verticalScroll(scrollState),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Guardian Status Bar with Lock Button
        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = SuccessGreen.copy(alpha = 0.12f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.LockOpen,
                        contentDescription = null,
                        tint = SuccessGreen,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Guardian Access Active",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = SuccessGreen
                    )
                }

                Button(
                    onClick = {
                        isGuardianUnlocked = false
                        loginPassword = ""
                        onNavigateHome()
                    },
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                    modifier = Modifier.height(32.dp)
                ) {
                    Text("🔒 Lock & Exit", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // App Title
        Text(
            text = "KidSafe Child Device Setup",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )

        // Transparency Shield Card
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
                    text = "KidSafe only records application usage time and screen unlock events. Private communications, messages, passwords, screen captures, and microphone audio are strictly never accessed or transmitted.",
                    fontSize = 13.sp,
                    color = MutedText,
                    lineHeight = 18.sp
                )
            }
        }

        // ==========================================
        // 1. PAIR WITH PARENT ACCESS KEY CARD
        // ==========================================
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(2.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Key,
                        contentDescription = null,
                        tint = IndigoPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Pair with Parent Access Key",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Enter the 6-character code (e.g. KS-7921) generated on your parent dashboard:",
                    fontSize = 12.sp,
                    color = MutedText
                )
                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = pairingCodeInput,
                    onValueChange = { if (it.length <= 10) pairingCodeInput = it.uppercase() },
                    label = { Text("6-Character Pairing Code") },
                    placeholder = { Text("KS-XXXX") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("Parent Server URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = {
                        val code = pairingCodeInput.trim().uppercase()
                        val cleanUrl = serverUrl.trim()
                        if (code.isEmpty()) {
                            pairingMessage = "Please enter the pairing code from parent dashboard"
                            pairingSuccess = false
                            return@Button
                        }
                        if (!cleanUrl.startsWith("https://")) {
                            pairingMessage = "Server URL must use secure HTTPS (https://...)"
                            pairingSuccess = false
                            return@Button
                        }
                        isPairingLoading = true
                        pairingMessage = null

                        coroutineScope.launch {
                            try {
                                val api = ApiClient.create(cleanUrl)
                                var appGuid = prefs.getString("app_guid", null)
                                if (appGuid == null) {
                                    appGuid = UUID.randomUUID().toString()
                                    prefs.edit().putString("app_guid", appGuid).apply()
                                }

                                val bm = context.getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager
                                val bat = bm?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
                                val batteryLevel = if (bat in 1..100) bat else null

                                val resp = api.claimPairing(
                                    ClaimPairingRequest(
                                        pairingCode = code,
                                        deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
                                        deviceModel = Build.MODEL,
                                        androidVersion = Build.VERSION.RELEASE,
                                        appGuid = appGuid,
                                        batteryLevel = batteryLevel
                                    )
                                )

                                if (resp.isSuccessful && resp.body()?.ok == true) {
                                    val body = resp.body()!!
                                    val token = body.deviceToken?.trim().orEmpty()
                                    val cId = body.childId?.trim().orEmpty()
                                    val cName = body.childName?.trim().orEmpty().ifBlank { "Child" }

                                    if (token.isBlank() || cId.isBlank()) {
                                        pairingSuccess = false
                                        pairingMessage = "Invalid pairing response from server"
                                        return@launch
                                    }

                                    prefs.edit()
                                        .putString("server_url", cleanUrl)
                                        .putString("child_id", cId)
                                        .putString("child_name", cName)
                                        .apply()
                                    SecurePrefs.putSecret(context, "device_token", token)

                                    deviceToken = token
                                    pairedChildName = cName
                                    pairingSuccess = true
                                    pairingMessage = "Successfully paired with Parent for $cName!"

                                    // Trigger immediate instant sync
                                    MonitorManager.syncNow(context)
                                } else {
                                    pairingSuccess = false
                                    pairingMessage = resp.body()?.error ?: "Invalid or expired pairing code"
                                }
                            } catch (e: Exception) {
                                pairingSuccess = false
                                pairingMessage = "Connection failed: ${e.message}"
                            } finally {
                                isPairingLoading = false
                            }
                        }
                    },
                    enabled = !isPairingLoading,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = if (isPairingLoading) "Verifying with Parent Server..." else "Connect & Authorize Device",
                        fontWeight = FontWeight.Bold
                    )
                }

                if (pairingMessage != null) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = pairingMessage!!,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (pairingSuccess) SuccessGreen else DangerRed
                    )
                }
            }
        }

        // ==========================================
        // 2. REQUIRED PERMISSIONS CHECKLIST & PROMINENT DISCLOSURES
        // ==========================================
        if (showUsageDisclosureDialog) {
            AlertDialog(
                onDismissRequest = { showUsageDisclosureDialog = false },
                title = { Text("Usage Access Permission Disclosure", fontWeight = FontWeight.Bold, fontSize = 17.sp) },
                text = {
                    Text(
                        text = "KidSafe Activity Monitor collects foreground application package names, app usage durations, and screen unlock events using Android Usage Access (PACKAGE_USAGE_STATS) to calculate daily screen time and show reports on your paired parent dashboard.\n\nData is encrypted via HTTPS, stored strictly for your parent account, and is never sold or shared with third parties.",
                        fontSize = 13.sp,
                        lineHeight = 19.sp
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            showUsageDisclosureDialog = false
                            context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            })
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                    ) {
                        Text("I Understand & Continue")
                    }
                },
                dismissButton = {
                    OutlinedButton(onClick = { showUsageDisclosureDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        if (showAccessibilityDisclosureDialog) {
            AlertDialog(
                onDismissRequest = { showAccessibilityDisclosureDialog = false },
                title = { Text("Accessibility Service Disclosure", fontWeight = FontWeight.Bold, fontSize = 17.sp) },
                text = {
                    Text(
                        text = "KidSafe Activity Monitor uses Android's Accessibility Service API (optional) ONLY to detect the currently active app package name (TYPE_WINDOW_STATE_CHANGED) so parent-blocked apps are paused when daily limits or bedtime rules apply.\n\nWindow content retrieval is disabled (canRetrieveWindowContent = false). KidSafe never reads messages, passwords, or keystrokes.",
                        fontSize = 13.sp,
                        lineHeight = 19.sp
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            showAccessibilityDisclosureDialog = false
                            context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            })
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                    ) {
                        Text("Open Settings")
                    }
                },
                dismissButton = {
                    OutlinedButton(onClick = { showAccessibilityDisclosureDialog = false }) {
                        Text("Not Now")
                    }
                }
            )
        }

        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(1.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Required & Optional Permissions",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = "1. Android Usage Access (Required)", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text(
                            text = if (hasUsageAccess) "Status: Granted" else "Required to calculate screen time",
                            fontSize = 12.sp,
                            color = if (hasUsageAccess) SuccessGreen else DangerRed
                        )
                    }
                    if (!hasUsageAccess) {
                        Button(
                            onClick = { showUsageDisclosureDialog = true },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                        ) {
                            Text("Grant", fontSize = 12.sp)
                        }
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = "2. App Blocking Service (Optional)", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text(
                            text = if (hasAccessibilityAccess) "Status: Enabled" else "Optional: enforces parent-blocked apps",
                            fontSize = 12.sp,
                            color = if (hasAccessibilityAccess) SuccessGreen else MutedText
                        )
                    }
                    if (!hasAccessibilityAccess) {
                        OutlinedButton(
                            onClick = { showAccessibilityDisclosureDialog = true },
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("Enable", fontSize = 12.sp)
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
                text = "I confirm I am the parent or legal guardian, have reviewed the Privacy Policy, and have explained this monitoring to the child.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onBackground
            )
        }

        // ==========================================
        // 3. ENABLE MONITORING & NOTIFICATION BUTTON
        // ==========================================
        Button(
            onClick = {
                val newState = !isMonitoringActive
                if (newState && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    MonitorManager.setConsentGranted(context, newState)
                    isMonitoringActive = newState
                }
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

        // Privacy Policy Link
        TextButton(
            onClick = {
                val base = if (serverUrl.trim().startsWith("https://")) serverUrl.trim().trimEnd('/') else "https://kidsafe.railplus.in"
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("$base/privacy-policy")).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                })
            },
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) {
            Icon(imageVector = Icons.Default.PrivacyTip, contentDescription = null, modifier = Modifier.size(16.dp), tint = IndigoPrimary)
            Spacer(modifier = Modifier.width(6.dp))
            Text("View Privacy Policy & Data Deletion Info", fontSize = 12.sp, color = IndigoPrimary, fontWeight = FontWeight.SemiBold)
        }

        // Paired State Status Card
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(1.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Device Status Summary",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "• Linked Profile: $pairedChildName",
                    fontSize = 13.sp,
                    color = MutedText
                )
                Text(
                    text = "• Server URL: $serverUrl",
                    fontSize = 13.sp,
                    color = MutedText
                )
                Text(
                    text = "• Monitoring Active: ${if (isMonitoringActive) "Yes (Foreground Notification Active)" else "Inactive"}",
                    fontSize = 13.sp,
                    color = if (isMonitoringActive) SuccessGreen else DangerRed
                )
            }
        }
    }
}
