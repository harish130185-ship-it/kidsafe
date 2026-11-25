package com.kidsafe.monitor.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val IndigoPrimary = Color(0xFF4F46E5)
val IndigoPrimaryLight = Color(0xFFEEF2FF)
val TealSecondary = Color(0xFF14B8A6)
val BackgroundLight = Color(0xFFF8FAFC)
val DarkBackground = Color(0xFF0F172A)
val CardBackgroundLight = Color(0xFFFFFFFF)
val CardBackgroundDark = Color(0xFF1E293B)
val SuccessGreen = Color(0xFF10B981)
val WarningAmber = Color(0xFFF59E0B)
val DangerRed = Color(0xFFEF4444)
val MainTextLight = Color(0xFF0F172A)
val MainTextDark = Color(0xFFF8FAFC)
val MutedText = Color(0xFF64748B)

private val LightColorScheme = lightColorScheme(
    primary = IndigoPrimary,
    onPrimary = Color.White,
    primaryContainer = IndigoPrimaryLight,
    secondary = TealSecondary,
    onSecondary = Color.White,
    background = BackgroundLight,
    surface = CardBackgroundLight,
    onBackground = MainTextLight,
    onSurface = MainTextLight,
    error = DangerRed
)

private val DarkColorScheme = darkColorScheme(
    primary = IndigoPrimary,
    onPrimary = Color.White,
    secondary = TealSecondary,
    onSecondary = Color.White,
    background = DarkBackground,
    surface = CardBackgroundDark,
    onBackground = MainTextDark,
    onSurface = MainTextDark,
    error = DangerRed
)

@Composable
fun KidSafeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
