package com.kidsafe.monitor.data.local;

import androidx.annotation.NonNull;
import androidx.room.DatabaseConfiguration;
import androidx.room.InvalidationTracker;
import androidx.room.RoomDatabase;
import androidx.room.RoomOpenHelper;
import androidx.room.migration.AutoMigrationSpec;
import androidx.room.migration.Migration;
import androidx.room.util.DBUtil;
import androidx.room.util.TableInfo;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteOpenHelper;
import java.lang.Class;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class AppDatabase_Impl extends AppDatabase {
  private volatile ActivityDao _activityDao;

  @Override
  @NonNull
  protected SupportSQLiteOpenHelper createOpenHelper(@NonNull final DatabaseConfiguration config) {
    final SupportSQLiteOpenHelper.Callback _openCallback = new RoomOpenHelper(config, new RoomOpenHelper.Delegate(1) {
      @Override
      public void createAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `daily_reports` (`day` TEXT NOT NULL, `totalScreenTimeMs` INTEGER NOT NULL, `screenUnlocksApprox` INTEGER NOT NULL, `payloadJson` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`day`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS `timeline_events` (`id` TEXT NOT NULL, `day` TEXT NOT NULL, `packageName` TEXT NOT NULL, `appName` TEXT NOT NULL, `eventType` TEXT NOT NULL, `timestamp` INTEGER NOT NULL, `durationMs` INTEGER, `category` TEXT NOT NULL, `confidence` TEXT NOT NULL, `source` TEXT NOT NULL, PRIMARY KEY(`id`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS `app_limits` (`packageName` TEXT NOT NULL, `appName` TEXT NOT NULL, `category` TEXT NOT NULL, `dailyLimitMinutes` INTEGER NOT NULL, `isBlocked` INTEGER NOT NULL, `scheduleStart` TEXT, `scheduleEnd` TEXT, PRIMARY KEY(`packageName`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)");
        db.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, '7b83bbc8dc3651ed2aeecbb62a1dfd50')");
      }

      @Override
      public void dropAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("DROP TABLE IF EXISTS `daily_reports`");
        db.execSQL("DROP TABLE IF EXISTS `timeline_events`");
        db.execSQL("DROP TABLE IF EXISTS `app_limits`");
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onDestructiveMigration(db);
          }
        }
      }

      @Override
      public void onCreate(@NonNull final SupportSQLiteDatabase db) {
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onCreate(db);
          }
        }
      }

      @Override
      public void onOpen(@NonNull final SupportSQLiteDatabase db) {
        mDatabase = db;
        internalInitInvalidationTracker(db);
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onOpen(db);
          }
        }
      }

      @Override
      public void onPreMigrate(@NonNull final SupportSQLiteDatabase db) {
        DBUtil.dropFtsSyncTriggers(db);
      }

      @Override
      public void onPostMigrate(@NonNull final SupportSQLiteDatabase db) {
      }

      @Override
      @NonNull
      public RoomOpenHelper.ValidationResult onValidateSchema(
          @NonNull final SupportSQLiteDatabase db) {
        final HashMap<String, TableInfo.Column> _columnsDailyReports = new HashMap<String, TableInfo.Column>(5);
        _columnsDailyReports.put("day", new TableInfo.Column("day", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDailyReports.put("totalScreenTimeMs", new TableInfo.Column("totalScreenTimeMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDailyReports.put("screenUnlocksApprox", new TableInfo.Column("screenUnlocksApprox", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDailyReports.put("payloadJson", new TableInfo.Column("payloadJson", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDailyReports.put("updatedAt", new TableInfo.Column("updatedAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysDailyReports = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesDailyReports = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoDailyReports = new TableInfo("daily_reports", _columnsDailyReports, _foreignKeysDailyReports, _indicesDailyReports);
        final TableInfo _existingDailyReports = TableInfo.read(db, "daily_reports");
        if (!_infoDailyReports.equals(_existingDailyReports)) {
          return new RoomOpenHelper.ValidationResult(false, "daily_reports(com.kidsafe.monitor.data.local.DailyReportEntity).\n"
                  + " Expected:\n" + _infoDailyReports + "\n"
                  + " Found:\n" + _existingDailyReports);
        }
        final HashMap<String, TableInfo.Column> _columnsTimelineEvents = new HashMap<String, TableInfo.Column>(10);
        _columnsTimelineEvents.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("day", new TableInfo.Column("day", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("packageName", new TableInfo.Column("packageName", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("appName", new TableInfo.Column("appName", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("eventType", new TableInfo.Column("eventType", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("timestamp", new TableInfo.Column("timestamp", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("durationMs", new TableInfo.Column("durationMs", "INTEGER", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("category", new TableInfo.Column("category", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("confidence", new TableInfo.Column("confidence", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsTimelineEvents.put("source", new TableInfo.Column("source", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysTimelineEvents = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesTimelineEvents = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoTimelineEvents = new TableInfo("timeline_events", _columnsTimelineEvents, _foreignKeysTimelineEvents, _indicesTimelineEvents);
        final TableInfo _existingTimelineEvents = TableInfo.read(db, "timeline_events");
        if (!_infoTimelineEvents.equals(_existingTimelineEvents)) {
          return new RoomOpenHelper.ValidationResult(false, "timeline_events(com.kidsafe.monitor.data.local.TimelineEventEntity).\n"
                  + " Expected:\n" + _infoTimelineEvents + "\n"
                  + " Found:\n" + _existingTimelineEvents);
        }
        final HashMap<String, TableInfo.Column> _columnsAppLimits = new HashMap<String, TableInfo.Column>(7);
        _columnsAppLimits.put("packageName", new TableInfo.Column("packageName", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsAppLimits.put("appName", new TableInfo.Column("appName", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsAppLimits.put("category", new TableInfo.Column("category", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsAppLimits.put("dailyLimitMinutes", new TableInfo.Column("dailyLimitMinutes", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsAppLimits.put("isBlocked", new TableInfo.Column("isBlocked", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsAppLimits.put("scheduleStart", new TableInfo.Column("scheduleStart", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsAppLimits.put("scheduleEnd", new TableInfo.Column("scheduleEnd", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysAppLimits = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesAppLimits = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoAppLimits = new TableInfo("app_limits", _columnsAppLimits, _foreignKeysAppLimits, _indicesAppLimits);
        final TableInfo _existingAppLimits = TableInfo.read(db, "app_limits");
        if (!_infoAppLimits.equals(_existingAppLimits)) {
          return new RoomOpenHelper.ValidationResult(false, "app_limits(com.kidsafe.monitor.data.local.AppLimitEntity).\n"
                  + " Expected:\n" + _infoAppLimits + "\n"
                  + " Found:\n" + _existingAppLimits);
        }
        return new RoomOpenHelper.ValidationResult(true, null);
      }
    }, "7b83bbc8dc3651ed2aeecbb62a1dfd50", "a8ae5b8f21dd8244f1861245ab132362");
    final SupportSQLiteOpenHelper.Configuration _sqliteConfig = SupportSQLiteOpenHelper.Configuration.builder(config.context).name(config.name).callback(_openCallback).build();
    final SupportSQLiteOpenHelper _helper = config.sqliteOpenHelperFactory.create(_sqliteConfig);
    return _helper;
  }

  @Override
  @NonNull
  protected InvalidationTracker createInvalidationTracker() {
    final HashMap<String, String> _shadowTablesMap = new HashMap<String, String>(0);
    final HashMap<String, Set<String>> _viewTables = new HashMap<String, Set<String>>(0);
    return new InvalidationTracker(this, _shadowTablesMap, _viewTables, "daily_reports","timeline_events","app_limits");
  }

  @Override
  public void clearAllTables() {
    super.assertNotMainThread();
    final SupportSQLiteDatabase _db = super.getOpenHelper().getWritableDatabase();
    try {
      super.beginTransaction();
      _db.execSQL("DELETE FROM `daily_reports`");
      _db.execSQL("DELETE FROM `timeline_events`");
      _db.execSQL("DELETE FROM `app_limits`");
      super.setTransactionSuccessful();
    } finally {
      super.endTransaction();
      _db.query("PRAGMA wal_checkpoint(FULL)").close();
      if (!_db.inTransaction()) {
        _db.execSQL("VACUUM");
      }
    }
  }

  @Override
  @NonNull
  protected Map<Class<?>, List<Class<?>>> getRequiredTypeConverters() {
    final HashMap<Class<?>, List<Class<?>>> _typeConvertersMap = new HashMap<Class<?>, List<Class<?>>>();
    _typeConvertersMap.put(ActivityDao.class, ActivityDao_Impl.getRequiredConverters());
    return _typeConvertersMap;
  }

  @Override
  @NonNull
  public Set<Class<? extends AutoMigrationSpec>> getRequiredAutoMigrationSpecs() {
    final HashSet<Class<? extends AutoMigrationSpec>> _autoMigrationSpecsSet = new HashSet<Class<? extends AutoMigrationSpec>>();
    return _autoMigrationSpecsSet;
  }

  @Override
  @NonNull
  public List<Migration> getAutoMigrations(
      @NonNull final Map<Class<? extends AutoMigrationSpec>, AutoMigrationSpec> autoMigrationSpecs) {
    final List<Migration> _autoMigrations = new ArrayList<Migration>();
    return _autoMigrations;
  }

  @Override
  public ActivityDao activityDao() {
    if (_activityDao != null) {
      return _activityDao;
    } else {
      synchronized(this) {
        if(_activityDao == null) {
          _activityDao = new ActivityDao_Impl(this);
        }
        return _activityDao;
      }
    }
  }
}
