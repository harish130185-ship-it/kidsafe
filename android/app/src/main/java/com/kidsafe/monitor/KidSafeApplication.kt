package com.kidsafe.monitor

import android.app.Application
import com.kidsafe.monitor.data.local.AppDatabase
import com.kidsafe.monitor.service.MonitorManager

class KidSafeApplication : Application() {

    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }

    override fun onCreate() {
        super.onCreate()
        // Initialize background monitoring schedule if guardian consent is active
        MonitorManager.schedulePeriodicSync(this)
    }
}
