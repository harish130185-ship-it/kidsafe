package com.kidsafe.monitor.data.remote

import com.google.gson.annotations.SerializedName
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

data class SyncReportRequest(
    @SerializedName("childId") val childId: String,
    @SerializedName("day") val day: String,
    @SerializedName("screenUnlocksApprox") val screenUnlocksApprox: Int,
    @SerializedName("batteryLevel") val batteryLevel: Int,
    @SerializedName("apps") val apps: List<RemoteAppUsage>,
    @SerializedName("timeline") val timeline: List<RemoteTimelineEvent>
)

data class RemoteAppUsage(
    @SerializedName("package") val packageName: String,
    @SerializedName("name") val name: String,
    @SerializedName("category") val category: String,
    @SerializedName("durationMs") val durationMs: Long
)

data class RemoteTimelineEvent(
    @SerializedName("id") val id: String,
    @SerializedName("package") val packageName: String,
    @SerializedName("name") val name: String,
    @SerializedName("event") val event: String,
    @SerializedName("time") val time: Long,
    @SerializedName("durationMs") val durationMs: Long?,
    @SerializedName("category") val category: String,
    @SerializedName("confidence") val confidence: String,
    @SerializedName("source") val source: String
)

data class SyncResponse(
    @SerializedName("ok") val ok: Boolean,
    @SerializedName("syncedAt") val syncedAt: Long
)

data class LimitsResponse(
    @SerializedName("limits") val limits: List<RemoteLimitItem>
)

data class RemoteLimitItem(
    @SerializedName("package") val packageName: String,
    @SerializedName("name") val name: String,
    @SerializedName("category") val category: String,
    @SerializedName("dailyLimitMinutes") val dailyLimitMinutes: Int,
    @SerializedName("isBlocked") val isBlocked: Boolean
)

data class ClaimPairingRequest(
    @SerializedName("pairingCode") val pairingCode: String,
    @SerializedName("deviceName") val deviceName: String,
    @SerializedName("deviceModel") val deviceModel: String,
    @SerializedName("androidVersion") val androidVersion: String,
    @SerializedName("appGuid") val appGuid: String,
    @SerializedName("batteryLevel") val batteryLevel: Int? = null
)

data class ClaimPairingResponse(
    @SerializedName("ok") val ok: Boolean,
    @SerializedName("deviceToken") val deviceToken: String?,
    @SerializedName("childId") val childId: String?,
    @SerializedName("childName") val childName: String?,
    @SerializedName("error") val error: String?
)

data class PasswordLoginRequest(
    @SerializedName("email") val email: String,
    @SerializedName("password") val password: String
)

data class PasswordLoginResponse(
    @SerializedName("ok") val ok: Boolean,
    @SerializedName("token") val token: String? = null,
    @SerializedName("error") val error: String? = null
)

data class AppVersionResponse(
    @SerializedName("ok") val ok: Boolean = true,
    @SerializedName("versionName") val versionName: String,
    @SerializedName("versionCode") val versionCode: Int,
    @SerializedName("downloadUrl") val downloadUrl: String,
    @SerializedName("releaseNotes") val releaseNotes: String? = null
)

interface KidSafeApiService {
    @POST("api/upload")
    suspend fun uploadReport(
        @Header("Authorization") bearerToken: String,
        @Body report: SyncReportRequest
    ): Response<SyncResponse>

    @GET("api/limits")
    suspend fun fetchLimits(
        @Header("Authorization") bearerToken: String,
        @Query("childId") childId: String
    ): Response<LimitsResponse>

    @POST("api/pairing/claim")
    suspend fun claimPairing(
        @Body request: ClaimPairingRequest
    ): Response<ClaimPairingResponse>

    @POST("api/auth/password-login")
    suspend fun loginWithPassword(
        @Body request: PasswordLoginRequest
    ): Response<PasswordLoginResponse>

    @GET("api/app-version")
    suspend fun checkAppVersion(): Response<AppVersionResponse>
}

object ApiClient {
    fun create(baseUrl: String): KidSafeApiService {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .build()

        val normalizedUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        return Retrofit.Builder()
            .baseUrl(normalizedUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(KidSafeApiService::class.java)
    }
}
