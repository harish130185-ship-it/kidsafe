package com.kidsafe.monitor

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.*
import com.kidsafe.monitor.data.remote.ApiClient
import com.kidsafe.monitor.data.remote.PasswordLoginRequest
import com.kidsafe.monitor.ui.ChildConsentScreen
import com.kidsafe.monitor.ui.ParentDashboardScreen
import com.kidsafe.monitor.ui.ParentPortalScreen
import com.kidsafe.monitor.ui.TimelineScreen
import com.kidsafe.monitor.ui.theme.DangerRed
import com.kidsafe.monitor.ui.theme.IndigoPrimary
import com.kidsafe.monitor.ui.theme.KidSafeTheme
import com.kidsafe.monitor.ui.theme.MutedText
import kotlinx.coroutines.launch
import java.security.MessageDigest

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    object ParentHome : Screen("parent_home", "Kid Mode", Icons.Default.Dashboard)
    object Timeline : Screen("timeline", "Timeline", Icons.Default.Timeline)
    object ChildSetup : Screen("child_setup", "Device Setup", Icons.Default.PhoneAndroid)
    object ParentPortal : Screen("parent_portal", "Parent Mode", Icons.Default.SupervisorAccount)
}

class MainActivity : ComponentActivity() {

    private val screenReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
            if (context != null && (intent?.action == android.content.Intent.ACTION_SCREEN_OFF || intent?.action == android.content.Intent.ACTION_USER_PRESENT)) {
                com.kidsafe.monitor.service.MonitorManager.syncNow(context)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            val filter = android.content.IntentFilter().apply {
                addAction(android.content.Intent.ACTION_SCREEN_OFF)
                addAction(android.content.Intent.ACTION_USER_PRESENT)
            }
            registerReceiver(screenReceiver, filter)
        } catch (_: Exception) {}

        setContent {
            KidSafeTheme {
                val context = this
                val prefs = remember { context.getSharedPreferences("kidsafe_prefs", Context.MODE_PRIVATE) }
                val coroutineScope = rememberCoroutineScope()
                val navController = rememberNavController()

                var isParentModeUnlocked by remember { mutableStateOf(false) }
                var parentSessionToken by remember { mutableStateOf("") }
                var showParentLoginDialog by remember { mutableStateOf(false) }

                var loginEmail by remember {
                    mutableStateOf(prefs.getString("parent_email", "harishshukla1385@gmail.com") ?: "harishshukla1385@gmail.com")
                }
                var loginPassword by remember { mutableStateOf("") }
                var isPasswordVisible by remember { mutableStateOf(false) }
                var isAuthenticating by remember { mutableStateOf(false) }
                var loginError by remember { mutableStateOf<String?>(null) }

                val items = listOf(
                    Screen.ParentHome,
                    Screen.Timeline,
                    Screen.ChildSetup,
                    Screen.ParentPortal
                )

                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = navBackStackEntry?.destination?.route

                // Guardian Authentication Dialog for entering Parent Mode
                if (showParentLoginDialog) {
                    AlertDialog(
                        onDismissRequest = {
                            if (!isAuthenticating) {
                                showParentLoginDialog = false
                                loginPassword = ""
                                loginError = null
                            }
                        },
                        title = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Lock,
                                    contentDescription = null,
                                    tint = IndigoPrimary,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Parent Authentication",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 18.sp
                                )
                            }
                        },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(
                                    text = "Enter your parent email and password to open the full web activity dashboard right inside the app.",
                                    fontSize = 13.sp,
                                    color = MutedText,
                                    lineHeight = 18.sp
                                )

                                OutlinedTextField(
                                    value = loginEmail,
                                    onValueChange = { loginEmail = it },
                                    label = { Text("Parent Email") },
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
                                        loginError = null
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
                            }
                        },
                        confirmButton = {
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
                                            val serverUrl = prefs.getString("server_url", "https://kidsafe.railplus.in") ?: "https://kidsafe.railplus.in"
                                            val api = ApiClient.create(serverUrl)
                                            val resp = api.loginWithPassword(PasswordLoginRequest(email, pwd))

                                            if (resp.isSuccessful && resp.body()?.ok == true) {
                                                val token = resp.body()?.token ?: ""
                                                val md = MessageDigest.getInstance("SHA-256")
                                                val hash = md.digest(pwd.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
                                                prefs.edit().putString("parent_email", email).putString("guardian_pwd_hash", hash).apply()

                                                parentSessionToken = token
                                                isParentModeUnlocked = true
                                                showParentLoginDialog = false
                                                loginPassword = ""
                                                navController.navigate(Screen.ParentPortal.route)
                                            } else {
                                                loginError = resp.body()?.error ?: "Invalid email or password"
                                            }
                                        } catch (e: Exception) {
                                            // Offline fallback
                                            val md = MessageDigest.getInstance("SHA-256")
                                            val hash = md.digest(pwd.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
                                            val storedHash = prefs.getString("guardian_pwd_hash", "") ?: ""
                                            val storedEmail = prefs.getString("parent_email", "") ?: ""

                                            if (storedHash.isNotEmpty() && hash == storedHash &&
                                                (storedEmail.isEmpty() || storedEmail.equals(email, ignoreCase = true))
                                            ) {
                                                isParentModeUnlocked = true
                                                showParentLoginDialog = false
                                                loginPassword = ""
                                                navController.navigate(Screen.ParentPortal.route)
                                            } else {
                                                loginError = "Verification failed: ${e.message ?: "Unable to connect"}"
                                            }
                                        } finally {
                                            isAuthenticating = false
                                        }
                                    }
                                },
                                enabled = !isAuthenticating,
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                            ) {
                                if (isAuthenticating) {
                                    CircularProgressIndicator(
                                        color = Color.White,
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Verifying...")
                                } else {
                                    Text("Unlock Parent Mode", fontWeight = FontWeight.Bold)
                                }
                            }
                        },
                        dismissButton = {
                            OutlinedButton(
                                onClick = {
                                    showParentLoginDialog = false
                                    loginPassword = ""
                                    loginError = null
                                },
                                enabled = !isAuthenticating,
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("Cancel", color = MutedText)
                            }
                        }
                    )
                }

                Scaffold(
                    bottomBar = {
                        // Hide bottom bar when inside full-screen Parent Portal
                        if (currentRoute != Screen.ParentPortal.route) {
                            NavigationBar {
                                items.forEach { screen ->
                                    val selected = currentRoute == screen.route
                                    NavigationBarItem(
                                        icon = { Icon(screen.icon, contentDescription = screen.title) },
                                        label = { Text(screen.title) },
                                        selected = selected,
                                        onClick = {
                                            if (screen == Screen.ParentPortal) {
                                                if (isParentModeUnlocked) {
                                                    navController.navigate(Screen.ParentPortal.route)
                                                } else {
                                                    showParentLoginDialog = true
                                                }
                                            } else if (currentRoute != screen.route) {
                                                navController.navigate(screen.route) {
                                                    popUpTo(navController.graph.startDestinationId) {
                                                        saveState = true
                                                    }
                                                    launchSingleTop = true
                                                    restoreState = true
                                                }
                                            }
                                        },
                                        colors = NavigationBarItemDefaults.colors(
                                            selectedIconColor = IndigoPrimary,
                                            indicatorColor = IndigoPrimary.copy(alpha = 0.12f)
                                        )
                                    )
                                }
                            }
                        }
                    }
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = Screen.ParentHome.route,
                        modifier = Modifier.padding(innerPadding)
                    ) {
                        composable(Screen.ParentHome.route) {
                            ParentDashboardScreen(
                                onNavigateTimeline = { navController.navigate(Screen.Timeline.route) },
                                onNavigateLimits = { navController.navigate(Screen.ParentHome.route) },
                                onSwitchParentMode = {
                                    if (isParentModeUnlocked) {
                                        navController.navigate(Screen.ParentPortal.route)
                                    } else {
                                        showParentLoginDialog = true
                                    }
                                }
                            )
                        }
                        composable(Screen.Timeline.route) {
                            TimelineScreen(onBack = { navController.popBackStack() })
                        }
                        composable(Screen.ChildSetup.route) {
                            ChildConsentScreen(
                                onNavigateHome = {
                                    navController.navigate(Screen.ParentHome.route) {
                                        popUpTo(navController.graph.startDestinationId) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            )
                        }
                        composable(Screen.ParentPortal.route) {
                            val serverUrl = prefs.getString("server_url", "https://kidsafe.railplus.in") ?: "https://kidsafe.railplus.in"
                            ParentPortalScreen(
                                serverUrl = serverUrl,
                                sessionToken = parentSessionToken,
                                onExitKidMode = {
                                    isParentModeUnlocked = false
                                    navController.navigate(Screen.ParentHome.route) {
                                        popUpTo(navController.graph.startDestinationId) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(screenReceiver)
        } catch (_: Exception) {}
    }
}
