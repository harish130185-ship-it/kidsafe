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
