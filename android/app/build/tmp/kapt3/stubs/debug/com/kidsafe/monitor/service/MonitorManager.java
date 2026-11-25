package com.kidsafe.monitor.service;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000.\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\n\u0002\u0010\b\n\u0002\b\u0002\n\u0002\u0010\u000b\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u0002\n\u0002\b\u0005\b\u00c7\u0002\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002J\u000e\u0010\b\u001a\u00020\t2\u0006\u0010\n\u001a\u00020\u000bJ\u000e\u0010\f\u001a\u00020\r2\u0006\u0010\n\u001a\u00020\u000bJ\u0016\u0010\u000e\u001a\u00020\r2\u0006\u0010\n\u001a\u00020\u000b2\u0006\u0010\u000f\u001a\u00020\tJ\u000e\u0010\u0010\u001a\u00020\r2\u0006\u0010\n\u001a\u00020\u000bJ\u000e\u0010\u0011\u001a\u00020\r2\u0006\u0010\n\u001a\u00020\u000bR\u000e\u0010\u0003\u001a\u00020\u0004X\u0082T\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0005\u001a\u00020\u0006X\u0082T\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0007\u001a\u00020\u0004X\u0082T\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0012"}, d2 = {"Lcom/kidsafe/monitor/service/MonitorManager;", "", "()V", "CHANNEL_ID", "", "NOTIFICATION_ID", "", "WORK_NAME", "isConsentGranted", "", "context", "Landroid/content/Context;", "schedulePeriodicSync", "", "setConsentGranted", "granted", "showPersistentNotification", "stopMonitoring", "app_debug"})
public final class MonitorManager {
    @org.jetbrains.annotations.NotNull()
    private static final java.lang.String CHANNEL_ID = "kidsafe_persistent_monitoring";
    private static final int NOTIFICATION_ID = 2001;
    @org.jetbrains.annotations.NotNull()
    private static final java.lang.String WORK_NAME = "kidsafe_periodic_sync_work";
    @org.jetbrains.annotations.NotNull()
    public static final com.kidsafe.monitor.service.MonitorManager INSTANCE = null;
    
    private MonitorManager() {
        super();
    }
    
    public final boolean isConsentGranted(@org.jetbrains.annotations.NotNull()
    android.content.Context context) {
        return false;
    }
    
    public final void setConsentGranted(@org.jetbrains.annotations.NotNull()
    android.content.Context context, boolean granted) {
    }
    
    public final void showPersistentNotification(@org.jetbrains.annotations.NotNull()
    android.content.Context context) {
    }
    
    public final void schedulePeriodicSync(@org.jetbrains.annotations.NotNull()
    android.content.Context context) {
    }
    
    public final void stopMonitoring(@org.jetbrains.annotations.NotNull()
    android.content.Context context) {
    }
}