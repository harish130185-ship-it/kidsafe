package com.kidsafe.monitor.data.local;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u00006\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0010\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u000e\n\u0002\b\u0002\n\u0002\u0010 \n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0003\n\u0002\u0018\u0002\n\u0002\b\u000b\bg\u0018\u00002\u00020\u0001J\u000e\u0010\u0002\u001a\u00020\u0003H\u00a7@\u00a2\u0006\u0002\u0010\u0004J\u0018\u0010\u0005\u001a\u0004\u0018\u00010\u00062\u0006\u0010\u0007\u001a\u00020\bH\u00a7@\u00a2\u0006\u0002\u0010\tJ\u0014\u0010\n\u001a\b\u0012\u0004\u0012\u00020\u00060\u000bH\u00a7@\u00a2\u0006\u0002\u0010\u0004J\u0014\u0010\f\u001a\b\u0012\u0004\u0012\u00020\r0\u000bH\u00a7@\u00a2\u0006\u0002\u0010\u0004J\u0018\u0010\u000e\u001a\u0004\u0018\u00010\r2\u0006\u0010\u000f\u001a\u00020\bH\u00a7@\u00a2\u0006\u0002\u0010\tJ\u001c\u0010\u0010\u001a\b\u0012\u0004\u0012\u00020\u00110\u000b2\u0006\u0010\u000f\u001a\u00020\bH\u00a7@\u00a2\u0006\u0002\u0010\tJ\u0016\u0010\u0012\u001a\u00020\u00032\u0006\u0010\u0013\u001a\u00020\rH\u00a7@\u00a2\u0006\u0002\u0010\u0014J\u001c\u0010\u0015\u001a\u00020\u00032\f\u0010\u0016\u001a\b\u0012\u0004\u0012\u00020\u00110\u000bH\u00a7@\u00a2\u0006\u0002\u0010\u0017J\u001c\u0010\u0018\u001a\u00020\u00032\f\u0010\u0019\u001a\b\u0012\u0004\u0012\u00020\u00060\u000bH\u00a7@\u00a2\u0006\u0002\u0010\u0017J\u0016\u0010\u001a\u001a\u00020\u00032\u0006\u0010\u001b\u001a\u00020\bH\u00a7@\u00a2\u0006\u0002\u0010\t\u00a8\u0006\u001c"}, d2 = {"Lcom/kidsafe/monitor/data/local/ActivityDao;", "", "clearAll", "", "(Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "getAppLimit", "Lcom/kidsafe/monitor/data/local/AppLimitEntity;", "pkg", "", "(Ljava/lang/String;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "getAppLimits", "", "getRecentReports", "Lcom/kidsafe/monitor/data/local/DailyReportEntity;", "getReport", "day", "getTimelineForDay", "Lcom/kidsafe/monitor/data/local/TimelineEventEntity;", "insertReport", "report", "(Lcom/kidsafe/monitor/data/local/DailyReportEntity;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "insertTimelineEvents", "events", "(Ljava/util/List;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "saveAppLimits", "limits", "trimOldReports", "cutoffDay", "app_debug"})
@androidx.room.Dao()
public abstract interface ActivityDao {
    
    @androidx.room.Insert(onConflict = 1)
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object insertReport(@org.jetbrains.annotations.NotNull()
    com.kidsafe.monitor.data.local.DailyReportEntity report, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super kotlin.Unit> $completion);
    
    @androidx.room.Query(value = "SELECT * FROM daily_reports WHERE day = :day LIMIT 1")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object getReport(@org.jetbrains.annotations.NotNull()
    java.lang.String day, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super com.kidsafe.monitor.data.local.DailyReportEntity> $completion);
    
    @androidx.room.Query(value = "SELECT * FROM daily_reports ORDER BY day DESC LIMIT 30")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object getRecentReports(@org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super java.util.List<com.kidsafe.monitor.data.local.DailyReportEntity>> $completion);
    
    @androidx.room.Insert(onConflict = 1)
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object insertTimelineEvents(@org.jetbrains.annotations.NotNull()
    java.util.List<com.kidsafe.monitor.data.local.TimelineEventEntity> events, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super kotlin.Unit> $completion);
    
    @androidx.room.Query(value = "SELECT * FROM timeline_events WHERE day = :day ORDER BY timestamp DESC")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object getTimelineForDay(@org.jetbrains.annotations.NotNull()
    java.lang.String day, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super java.util.List<com.kidsafe.monitor.data.local.TimelineEventEntity>> $completion);
    
    @androidx.room.Insert(onConflict = 1)
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object saveAppLimits(@org.jetbrains.annotations.NotNull()
    java.util.List<com.kidsafe.monitor.data.local.AppLimitEntity> limits, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super kotlin.Unit> $completion);
    
    @androidx.room.Query(value = "SELECT * FROM app_limits")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object getAppLimits(@org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super java.util.List<com.kidsafe.monitor.data.local.AppLimitEntity>> $completion);
    
    @androidx.room.Query(value = "SELECT * FROM app_limits WHERE packageName = :pkg LIMIT 1")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object getAppLimit(@org.jetbrains.annotations.NotNull()
    java.lang.String pkg, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super com.kidsafe.monitor.data.local.AppLimitEntity> $completion);
    
    @androidx.room.Query(value = "DELETE FROM daily_reports WHERE day < :cutoffDay")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object trimOldReports(@org.jetbrains.annotations.NotNull()
    java.lang.String cutoffDay, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super kotlin.Unit> $completion);
    
    @androidx.room.Query(value = "DELETE FROM daily_reports")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object clearAll(@org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super kotlin.Unit> $completion);
}