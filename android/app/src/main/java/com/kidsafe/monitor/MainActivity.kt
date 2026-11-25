package com.kidsafe.monitor

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.compose.*
import com.kidsafe.monitor.ui.ChildConsentScreen
import com.kidsafe.monitor.ui.ParentDashboardScreen
import com.kidsafe.monitor.ui.TimelineScreen
import com.kidsafe.monitor.ui.theme.IndigoPrimary
import com.kidsafe.monitor.ui.theme.KidSafeTheme

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    object ParentHome : Screen("parent_home", "Dashboard", Icons.Default.Dashboard)
    object Timeline : Screen("timeline", "Timeline", Icons.Default.Timeline)
    object ChildSetup : Screen("child_setup", "Device Setup", Icons.Default.PhoneAndroid)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            KidSafeTheme {
                val navController = rememberNavController()
                val items = listOf(
                    Screen.ParentHome,
                    Screen.Timeline,
                    Screen.ChildSetup
                )

                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = navBackStackEntry?.destination?.route

                Scaffold(
                    bottomBar = {
                        NavigationBar {
                            items.forEach { screen ->
                                val selected = currentRoute == screen.route
                                NavigationBarItem(
                                    icon = { Icon(screen.icon, contentDescription = screen.title) },
                                    label = { Text(screen.title) },
                                    selected = selected,
                                    onClick = {
                                        if (currentRoute != screen.route) {
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
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = Screen.ParentHome.route,
                        modifier = Modifier.padding(innerPadding)
                    ) {
                        composable(Screen.ParentHome.route) {
                            ParentDashboardScreen(
                                onNavigateTimeline = { navController.navigate(Screen.Timeline.route) },
                                onNavigateLimits = { navController.navigate(Screen.ParentHome.route) }
                            )
                        }
                        composable(Screen.Timeline.route) {
                            TimelineScreen(onBack = { navController.popBackStack() })
                        }
                        composable(Screen.ChildSetup.route) {
                            ChildConsentScreen()
                        }
                    }
                }
            }
        }
    }
}
