package in.kidsafe.monitor

import android.app.Application
import in.kidsafe.monitor.data.local.AppDatabase
import in.kidsafe.monitor.service.MonitorManager

class KidSafeApplication : Application() {

    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }

    override fun onCreate() {
        super.onCreate()
        // Initialize background monitoring schedule if guardian consent is active
        MonitorManager.schedulePeriodicSync(this)
    }
}
