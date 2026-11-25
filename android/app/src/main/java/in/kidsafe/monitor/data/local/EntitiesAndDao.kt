package in.kidsafe.monitor.data.local

import androidx.room.*

@Entity(tableName = "daily_reports")
data class DailyReportEntity(
    @PrimaryKey val day: String, // YYYY-MM-DD
    val totalScreenTimeMs: Long,
    val screenUnlocksApprox: Int,
    val payloadJson: String,
    val updatedAt: Long
)

@Entity(tableName = "timeline_events")
data class TimelineEventEntity(
    @PrimaryKey val id: String,
    val day: String,
    val packageName: String,
    val appName: String,
    val eventType: String, // opened, closed, screen_unlocked, screen_off
    val timestamp: Long,
    val durationMs: Long?,
    val category: String,
    val confidence: String,
    val source: String
)

@Entity(tableName = "app_limits")
data class AppLimitEntity(
    @PrimaryKey val packageName: String,
    val appName: String,
    val category: String,
    val dailyLimitMinutes: Int,
    val isBlocked: Boolean,
    val scheduleStart: String? = null,
    val scheduleEnd: String? = null
)

@Dao
interface ActivityDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReport(report: DailyReportEntity)

    @Query("SELECT * FROM daily_reports WHERE day = :day LIMIT 1")
    suspend fun getReport(day: String): DailyReportEntity?

    @Query("SELECT * FROM daily_reports ORDER BY day DESC LIMIT 30")
    suspend fun getRecentReports(): List<DailyReportEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTimelineEvents(events: List<TimelineEventEntity>)

    @Query("SELECT * FROM timeline_events WHERE day = :day ORDER BY timestamp DESC")
    suspend fun getTimelineForDay(day: String): List<TimelineEventEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveAppLimits(limits: List<AppLimitEntity>)

    @Query("SELECT * FROM app_limits")
    suspend fun getAppLimits(): List<AppLimitEntity>

    @Query("SELECT * FROM app_limits WHERE packageName = :pkg LIMIT 1")
    suspend fun getAppLimit(pkg: String): AppLimitEntity?

    @Query("DELETE FROM daily_reports WHERE day < :cutoffDay")
    suspend fun trimOldReports(cutoffDay: String)

    @Query("DELETE FROM daily_reports")
    suspend fun clearAll()
}
