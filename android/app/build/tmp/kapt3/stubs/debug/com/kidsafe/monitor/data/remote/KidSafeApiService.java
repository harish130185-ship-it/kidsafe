package com.kidsafe.monitor.data.remote;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000*\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u000e\n\u0002\b\u0003\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\bf\u0018\u00002\u00020\u0001J(\u0010\u0002\u001a\b\u0012\u0004\u0012\u00020\u00040\u00032\b\b\u0001\u0010\u0005\u001a\u00020\u00062\b\b\u0001\u0010\u0007\u001a\u00020\u0006H\u00a7@\u00a2\u0006\u0002\u0010\bJ(\u0010\t\u001a\b\u0012\u0004\u0012\u00020\n0\u00032\b\b\u0001\u0010\u0005\u001a\u00020\u00062\b\b\u0001\u0010\u000b\u001a\u00020\fH\u00a7@\u00a2\u0006\u0002\u0010\r\u00a8\u0006\u000e"}, d2 = {"Lcom/kidsafe/monitor/data/remote/KidSafeApiService;", "", "fetchLimits", "Lretrofit2/Response;", "Lcom/kidsafe/monitor/data/remote/LimitsResponse;", "bearerToken", "", "childId", "(Ljava/lang/String;Ljava/lang/String;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "uploadReport", "Lcom/kidsafe/monitor/data/remote/SyncResponse;", "report", "Lcom/kidsafe/monitor/data/remote/SyncReportRequest;", "(Ljava/lang/String;Lcom/kidsafe/monitor/data/remote/SyncReportRequest;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "app_debug"})
public abstract interface KidSafeApiService {
    
    @retrofit2.http.POST(value = "api/upload")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object uploadReport(@retrofit2.http.Header(value = "Authorization")
    @org.jetbrains.annotations.NotNull()
    java.lang.String bearerToken, @retrofit2.http.Body()
    @org.jetbrains.annotations.NotNull()
    com.kidsafe.monitor.data.remote.SyncReportRequest report, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super retrofit2.Response<com.kidsafe.monitor.data.remote.SyncResponse>> $completion);
    
    @retrofit2.http.GET(value = "api/limits")
    @org.jetbrains.annotations.Nullable()
    public abstract java.lang.Object fetchLimits(@retrofit2.http.Header(value = "Authorization")
    @org.jetbrains.annotations.NotNull()
    java.lang.String bearerToken, @retrofit2.http.Query(value = "childId")
    @org.jetbrains.annotations.NotNull()
    java.lang.String childId, @org.jetbrains.annotations.NotNull()
    kotlin.coroutines.Continuation<? super retrofit2.Response<com.kidsafe.monitor.data.remote.LimitsResponse>> $completion);
}