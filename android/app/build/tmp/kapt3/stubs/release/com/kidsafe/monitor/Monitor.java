package com.kidsafe.monitor;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000&\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\n\u0002\u0010\u000b\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u0002\n\u0002\b\u0003\b\u00c7\u0002\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002J\u000e\u0010\u0005\u001a\u00020\u00062\u0006\u0010\u0007\u001a\u00020\bJ\u000e\u0010\t\u001a\u00020\n2\u0006\u0010\u0007\u001a\u00020\bJ\u000e\u0010\u000b\u001a\u00020\n2\u0006\u0010\u0007\u001a\u00020\bJ\u000e\u0010\f\u001a\u00020\n2\u0006\u0010\u0007\u001a\u00020\bR\u000e\u0010\u0003\u001a\u00020\u0004X\u0082T\u00a2\u0006\u0002\n\u0000\u00a8\u0006\r"}, d2 = {"Lcom/kidsafe/monitor/Monitor;", "", "()V", "CHANNEL", "", "active", "", "c", "Landroid/content/Context;", "notify", "", "start", "stop", "app_release"})
public final class Monitor {
    @org.jetbrains.annotations.NotNull()
    private static final java.lang.String CHANNEL = "monitoring_notice";
    @org.jetbrains.annotations.NotNull()
    public static final com.kidsafe.monitor.Monitor INSTANCE = null;
    
    private Monitor() {
        super();
    }
    
    public final boolean active(@org.jetbrains.annotations.NotNull()
    android.content.Context c) {
        return false;
    }
    
    public final void notify(@org.jetbrains.annotations.NotNull()
    android.content.Context c) {
    }
    
    public final void stop(@org.jetbrains.annotations.NotNull()
    android.content.Context c) {
    }
    
    public final void start(@org.jetbrains.annotations.NotNull()
    android.content.Context c) {
    }
}