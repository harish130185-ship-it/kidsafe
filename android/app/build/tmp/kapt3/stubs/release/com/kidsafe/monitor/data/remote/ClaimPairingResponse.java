package com.kidsafe.monitor.data.remote;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000 \n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0010\u000b\n\u0000\n\u0002\u0010\u000e\n\u0002\b\u0014\n\u0002\u0010\b\n\u0002\b\u0002\b\u0087\b\u0018\u00002\u00020\u0001B5\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u0012\b\u0010\u0004\u001a\u0004\u0018\u00010\u0005\u0012\b\u0010\u0006\u001a\u0004\u0018\u00010\u0005\u0012\b\u0010\u0007\u001a\u0004\u0018\u00010\u0005\u0012\b\u0010\b\u001a\u0004\u0018\u00010\u0005\u00a2\u0006\u0002\u0010\tJ\t\u0010\u0011\u001a\u00020\u0003H\u00c6\u0003J\u000b\u0010\u0012\u001a\u0004\u0018\u00010\u0005H\u00c6\u0003J\u000b\u0010\u0013\u001a\u0004\u0018\u00010\u0005H\u00c6\u0003J\u000b\u0010\u0014\u001a\u0004\u0018\u00010\u0005H\u00c6\u0003J\u000b\u0010\u0015\u001a\u0004\u0018\u00010\u0005H\u00c6\u0003JC\u0010\u0016\u001a\u00020\u00002\b\b\u0002\u0010\u0002\u001a\u00020\u00032\n\b\u0002\u0010\u0004\u001a\u0004\u0018\u00010\u00052\n\b\u0002\u0010\u0006\u001a\u0004\u0018\u00010\u00052\n\b\u0002\u0010\u0007\u001a\u0004\u0018\u00010\u00052\n\b\u0002\u0010\b\u001a\u0004\u0018\u00010\u0005H\u00c6\u0001J\u0013\u0010\u0017\u001a\u00020\u00032\b\u0010\u0018\u001a\u0004\u0018\u00010\u0001H\u00d6\u0003J\t\u0010\u0019\u001a\u00020\u001aH\u00d6\u0001J\t\u0010\u001b\u001a\u00020\u0005H\u00d6\u0001R\u0018\u0010\u0006\u001a\u0004\u0018\u00010\u00058\u0006X\u0087\u0004\u00a2\u0006\b\n\u0000\u001a\u0004\b\n\u0010\u000bR\u0018\u0010\u0007\u001a\u0004\u0018\u00010\u00058\u0006X\u0087\u0004\u00a2\u0006\b\n\u0000\u001a\u0004\b\f\u0010\u000bR\u0018\u0010\u0004\u001a\u0004\u0018\u00010\u00058\u0006X\u0087\u0004\u00a2\u0006\b\n\u0000\u001a\u0004\b\r\u0010\u000bR\u0018\u0010\b\u001a\u0004\u0018\u00010\u00058\u0006X\u0087\u0004\u00a2\u0006\b\n\u0000\u001a\u0004\b\u000e\u0010\u000bR\u0016\u0010\u0002\u001a\u00020\u00038\u0006X\u0087\u0004\u00a2\u0006\b\n\u0000\u001a\u0004\b\u000f\u0010\u0010\u00a8\u0006\u001c"}, d2 = {"Lcom/kidsafe/monitor/data/remote/ClaimPairingResponse;", "", "ok", "", "deviceToken", "", "childId", "childName", "error", "(ZLjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V", "getChildId", "()Ljava/lang/String;", "getChildName", "getDeviceToken", "getError", "getOk", "()Z", "component1", "component2", "component3", "component4", "component5", "copy", "equals", "other", "hashCode", "", "toString", "app_release"})
public final class ClaimPairingResponse {
    @com.google.gson.annotations.SerializedName(value = "ok")
    private final boolean ok = false;
    @com.google.gson.annotations.SerializedName(value = "deviceToken")
    @org.jetbrains.annotations.Nullable()
    private final java.lang.String deviceToken = null;
    @com.google.gson.annotations.SerializedName(value = "childId")
    @org.jetbrains.annotations.Nullable()
    private final java.lang.String childId = null;
    @com.google.gson.annotations.SerializedName(value = "childName")
    @org.jetbrains.annotations.Nullable()
    private final java.lang.String childName = null;
    @com.google.gson.annotations.SerializedName(value = "error")
    @org.jetbrains.annotations.Nullable()
    private final java.lang.String error = null;
    
    public ClaimPairingResponse(boolean ok, @org.jetbrains.annotations.Nullable()
    java.lang.String deviceToken, @org.jetbrains.annotations.Nullable()
    java.lang.String childId, @org.jetbrains.annotations.Nullable()
    java.lang.String childName, @org.jetbrains.annotations.Nullable()
    java.lang.String error) {
        super();
    }
    
    public final boolean getOk() {
        return false;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String getDeviceToken() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String getChildId() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String getChildName() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String getError() {
        return null;
    }
    
    public final boolean component1() {
        return false;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String component2() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String component3() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String component4() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable()
    public final java.lang.String component5() {
        return null;
    }
    
    @org.jetbrains.annotations.NotNull()
    public final com.kidsafe.monitor.data.remote.ClaimPairingResponse copy(boolean ok, @org.jetbrains.annotations.Nullable()
    java.lang.String deviceToken, @org.jetbrains.annotations.Nullable()
    java.lang.String childId, @org.jetbrains.annotations.Nullable()
    java.lang.String childName, @org.jetbrains.annotations.Nullable()
    java.lang.String error) {
        return null;
    }
    
    @java.lang.Override()
    public boolean equals(@org.jetbrains.annotations.Nullable()
    java.lang.Object other) {
        return false;
    }
    
    @java.lang.Override()
    public int hashCode() {
        return 0;
    }
    
    @java.lang.Override()
    @org.jetbrains.annotations.NotNull()
    public java.lang.String toString() {
        return null;
    }
}