package com.kidsafe.monitor.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.kidsafe.monitor.ui.theme.DangerRed
import com.kidsafe.monitor.ui.theme.IndigoPrimary

class AndroidBridge(private val onExit: () -> Unit) {
    @JavascriptInterface
    fun exitKidMode() {
        Handler(Looper.getMainLooper()).post {
            onExit()
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ParentPortalScreen(
    serverUrl: String,
    sessionToken: String,
    onExitKidMode: () -> Unit
) {
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var progress by remember { mutableStateOf(0) }

    // Intercept hardware back button to exit directly to Kid Mode
    BackHandler {
        onExitKidMode()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onExitKidMode) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Exit to Kid Mode",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.SupervisorAccount,
                            contentDescription = null,
                            tint = IndigoPrimary,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Parents Mode",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                },
                actions = {
                    // Refresh button
                    IconButton(onClick = { webViewInstance?.reload() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Reload",
                            tint = IndigoPrimary
                        )
                    }

                    // Exit to Kid Mode button (Red badge)
                    Button(
                        onClick = onExitKidMode,
                        colors = ButtonDefaults.buttonColors(containerColor = DangerRed),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = null,
                            modifier = Modifier.size(15.dp),
                            tint = Color.White
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Kid Mode",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            val tokenParam = if (sessionToken.isNotBlank()) sessionToken else "123456789"
            val baseUrl = if (serverUrl.startsWith("http")) serverUrl.trimEnd('/') else "https://kidsafe.railplus.in"
            val targetUrl = "$baseUrl/?portal=android&token=$tokenParam"

            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )

                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.databaseEnabled = true
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true
                        settings.cacheMode = WebSettings.LOAD_DEFAULT

                        addJavascriptInterface(AndroidBridge(onExitKidMode), "AndroidBridge")

                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                isLoading = true
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                isLoading = false
                                // Auto-inject parent session token so it opens the dashboard directly without asking for login
                                val js = """
                                    (function() {
                                        try {
                                            if (window.state) {
                                                window.state.sessionToken = '$tokenParam';
                                            }
                                            sessionStorage.setItem('kidsafe_session', '$tokenParam');
                                            const login = document.getElementById('loginSection');
                                            const dash = document.getElementById('dashboardSection');
                                            if (login && dash) {
                                                login.style.display = 'none';
                                                dash.style.display = 'block';
                                                if (window.initDashboard) window.initDashboard();
                                            }
                                        } catch(e) {}
                                    })();
                                """.trimIndent()
                                view?.evaluateJavascript(js, null)
                            }
                        }

                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                progress = newProgress
                            }
                        }

                        loadUrl(targetUrl)
                        webViewInstance = this
                    }
                },
                update = {
                    webViewInstance = it
                }
            )

            // Linear Progress Indicator
            if (isLoading && progress < 100) {
                LinearProgressIndicator(
                    progress = { progress / 100f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter),
                    color = IndigoPrimary
                )
            }
        }
    }
}
