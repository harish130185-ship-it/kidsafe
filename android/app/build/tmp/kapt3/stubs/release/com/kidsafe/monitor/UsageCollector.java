package com.kidsafe.monitor;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000<\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\t\n\u0002\b\u0003\n\u0002\u0010\u000e\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0010\u000b\n\u0000\b\u00c7\u0002\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002J\u001e\u0010\u0005\u001a\u00020\u00062\u0006\u0010\u0007\u001a\u00020\b2\u0006\u0010\t\u001a\u00020\n2\u0006\u0010\u000b\u001a\u00020\nJ\u000e\u0010\f\u001a\u00020\u00062\u0006\u0010\u0007\u001a\u00020\bJ\u0010\u0010\r\u001a\u00020\u000e2\b\b\u0002\u0010\u000f\u001a\u00020\nJ\"\u0010\u0010\u001a\u000e\u0012\u0004\u0012\u00020\u000e\u0012\u0004\u0012\u00020\u000e0\u00112\u0006\u0010\u0007\u001a\u00020\b2\u0006\u0010\u0012\u001a\u00020\u000eJ\u000e\u0010\u0013\u001a\u00020\u00142\u0006\u0010\u0007\u001a\u00020\bR\u000e\u0010\u0003\u001a\u00020\u0004X\u0082\u0004\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0015"}, d2 = {"Lcom/kidsafe/monitor/UsageCollector;", "", "()V", "dateFmt", "Ljava/text/SimpleDateFormat;", "collect", "Lorg/json/JSONObject;", "context", "Landroid/content/Context;", "start", "", "end", "collectToday", "dayString", "", "ms", "getAppMetadata", "Lkotlin/Pair;", "packageName", "granted", "", "app_release"})
public final class UsageCollector {
    @org.jetbrains.annotations.NotNull()
    private static final java.text.SimpleDateFormat dateFmt = null;
    @org.jetbrains.annotations.NotNull()
    public static final com.kidsafe.monitor.UsageCollector INSTANCE = null;
    
    private UsageCollector() {
        super();
    }
    
    @kotlin.jvm.Synchronized()
    @org.jetbrains.annotations.NotNull()
    public final synchronized java.lang.String dayString(long ms) {
        return null;
    }
    
    public final boolean granted(@org.jetbrains.annotations.NotNull()
    android.content.Context context) {
        return false;
    }
    
    @org.jetbrains.annotations.NotNull()
    public final kotlin.Pair<java.lang.String, java.lang.String> getAppMetadata(@org.jetbrains.annotations.NotNull()
    android.content.Context context, @org.jetbrains.annotations.NotNull()
    java.lang.String packageName) {
        return null;
    }
    
    @org.jetbrains.annotations.NotNull()
    public final org.json.JSONObject collect(@org.jetbrains.annotations.NotNull()
    android.content.Context context, long start, long end) {
        return null;
    }
    
    @org.jetbrains.annotations.NotNull()
    public final org.json.JSONObject collectToday(@org.jetbrains.annotations.NotNull()
    android.content.Context context) {
        return null;
    }
}