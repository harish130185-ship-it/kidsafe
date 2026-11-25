# KidSafe Activity Monitor — Android + Parent Dashboard (starter)

A transparent, parental/guardian-authorized **Android app usage logger** and basic password-protected web dashboard. **This is source code, not a compiled APK or production-certified parental control solution.**

## Implemented
- Explicit guardian authorization, Android Usage Access setup, visible ongoing notification (best-effort), stop and delete local logs.
- UsageEvents-based approximate foreground app durations, app open/close timeline and approximate keyguard unlock count.
- Daily report in local SQLite, 30-day trimming, CSV export via Android Storage Access Framework.
- WorkManager periodic refresh (minimum 15 minutes, *not* exact guaranteed intervals), optional manual refresh and HTTPS upload.
- Single-child/single-family Node.js backend, parent-token sign-in, dashboard with day filter, usage summary, timeline, CSV download, server deletion and 30-day server retention.
- Manifest monitoring tool declaration (`child_monitoring`); no recording of chats, screen contents, keystrokes, contacts or microphone.

## Android build
1. Open `android/` in Android Studio (JDK 17, Android SDK 35). Allow Gradle sync. Project lists AGP 8.9.2 / Kotlin 2.1.20 and Gradle 8.11.1. Android Studio may install Gradle from the wrapper **properties file**; if command-line building, generate a standard wrapper with `gradle wrapper --gradle-version 8.11.1` or use Android Studio's bundled Gradle. The generated archive intentionally does not include a gradle-wrapper.jar binary.
2. Build > Build APK(s). Install on your own test Android device (API 28+).
3. Review disclosure with child and provide guardian consent; enable **Usage Access** and **Notifications** when prompted. Tap Enable monitoring and Refresh. Export CSV to the chosen document folder.
4. On Android 13+, notification permission must be granted before enabling tracking in this starter. On devices with special battery management, scheduled updates may be delayed.

## Parent dashboard / backend
- Install Node.js 20+. From `server/`, create distinct high-entropy keys, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` twice.
- Linux/macOS (shell): `export PARENT_TOKEN='first-random-key' DEVICE_TOKEN='second-random-key'; npm start`.
- Windows PowerShell: `$env:PARENT_TOKEN='first-random-key'; $env:DEVICE_TOKEN='second-random-key'; npm start`.
- Open `http://localhost:8080` **on the server computer only**. Login using the *parent* token.
- To sync from Android, deploy behind **HTTPS** with reverse proxy (e.g. Caddy / Nginx), persistent private `DATA_DIR` directory, and secret environment variables. In the child Android app enter `https://your-domain.example` and only the **device** token; never enter parent token on child device. Then tap Sync now.
- If deployed to a serverless host, the example backend's local JSON file is not durable; use a persistent disk or replace it with a proper database. Do not publicly expose an HTTP-only instance or commit keys to source control.

## IMPORTANT — gaps before publishing
- This is a **prototype**, not certified to comply with all Google Play policies. The notification approach is best effort: Android/OS policies can suppress or remove it. Review persistent disclosure requirements and implement a policy-compliant monitoring indicator/foreground lifecycle before Play publishing.
- Parent dashboard cookie sessions are basic; for production add a login rate limit, proper CSRF protections, account recovery, encrypted token storage on Android via Keystore, audit logs, and an authenticated device pairing/enrollment process.
- Server deletion does not reach the child device. Add verified cross-device deletion and opt-out propagation.
- Existing report is one current-day snapshot; day-boundary and off-midnight partial app sessions can affect accuracy, and previous days are not backfilled automatically.
- UsageStats events are *approximate*, not every action. Timeline capped at 2,000 events, local report is refreshed periodically, and OS/background restrictions may limit data.
- No app limits/blocking, multi-child enrollment, push notifications, notifications-content collection, GPS tracking, or child location monitoring implemented. These are future phases requiring separate platform/policy assessment.
- User-facing privacy notice, in-app verification of guardian authority, age-appropriate disclosure, encryption-at-rest, account deletion, data inventory and Play Data Safety compliance still require implementation/review for production.
- Use only on devices that you own/administer with appropriate parental authority and disclosed monitoring.

## Core code
- `android/app/src/main/java/in/kidsafe/monitor/UsageCollector.kt` — Android usage events
- `android/app/src/main/java/in/kidsafe/monitor/ActivityStore.kt` — SQLite report persistence
- `android/app/src/main/java/in/kidsafe/monitor/Monitor.kt` — WorkManager sync and notification
- `android/app/src/main/java/in/kidsafe/monitor/MainActivity.kt` — consent, permissions, CSV
- `server/server.js` — token auth, HTTPS-oriented sync API and reports
- `server/public` — responsive parent dashboard

## Reference docs
- https://developer.android.com/reference/android/app/usage/UsageStatsManager
- https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work
- https://support.google.com/googleplay/android-developer/answer/12955211
- https://support.google.com/googleplay/android-developer/answer/9888380
