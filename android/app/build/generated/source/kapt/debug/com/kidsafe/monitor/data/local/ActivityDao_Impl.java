package com.kidsafe.monitor.data.local;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Long;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class ActivityDao_Impl implements ActivityDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<DailyReportEntity> __insertionAdapterOfDailyReportEntity;

  private final EntityInsertionAdapter<TimelineEventEntity> __insertionAdapterOfTimelineEventEntity;

  private final EntityInsertionAdapter<AppLimitEntity> __insertionAdapterOfAppLimitEntity;

  private final SharedSQLiteStatement __preparedStmtOfTrimOldReports;

  private final SharedSQLiteStatement __preparedStmtOfClearAll;

  public ActivityDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfDailyReportEntity = new EntityInsertionAdapter<DailyReportEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `daily_reports` (`day`,`totalScreenTimeMs`,`screenUnlocksApprox`,`payloadJson`,`updatedAt`) VALUES (?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final DailyReportEntity entity) {
        if (entity.getDay() == null) {
          statement.bindNull(1);
        } else {
          statement.bindString(1, entity.getDay());
        }
        statement.bindLong(2, entity.getTotalScreenTimeMs());
        statement.bindLong(3, entity.getScreenUnlocksApprox());
        if (entity.getPayloadJson() == null) {
          statement.bindNull(4);
        } else {
          statement.bindString(4, entity.getPayloadJson());
        }
        statement.bindLong(5, entity.getUpdatedAt());
      }
    };
    this.__insertionAdapterOfTimelineEventEntity = new EntityInsertionAdapter<TimelineEventEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `timeline_events` (`id`,`day`,`packageName`,`appName`,`eventType`,`timestamp`,`durationMs`,`category`,`confidence`,`source`) VALUES (?,?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final TimelineEventEntity entity) {
        if (entity.getId() == null) {
          statement.bindNull(1);
        } else {
          statement.bindString(1, entity.getId());
        }
        if (entity.getDay() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getDay());
        }
        if (entity.getPackageName() == null) {
          statement.bindNull(3);
        } else {
          statement.bindString(3, entity.getPackageName());
        }
        if (entity.getAppName() == null) {
          statement.bindNull(4);
        } else {
          statement.bindString(4, entity.getAppName());
        }
        if (entity.getEventType() == null) {
          statement.bindNull(5);
        } else {
          statement.bindString(5, entity.getEventType());
        }
        statement.bindLong(6, entity.getTimestamp());
        if (entity.getDurationMs() == null) {
          statement.bindNull(7);
        } else {
          statement.bindLong(7, entity.getDurationMs());
        }
        if (entity.getCategory() == null) {
          statement.bindNull(8);
        } else {
          statement.bindString(8, entity.getCategory());
        }
        if (entity.getConfidence() == null) {
          statement.bindNull(9);
        } else {
          statement.bindString(9, entity.getConfidence());
        }
        if (entity.getSource() == null) {
          statement.bindNull(10);
        } else {
          statement.bindString(10, entity.getSource());
        }
      }
    };
    this.__insertionAdapterOfAppLimitEntity = new EntityInsertionAdapter<AppLimitEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `app_limits` (`packageName`,`appName`,`category`,`dailyLimitMinutes`,`isBlocked`,`scheduleStart`,`scheduleEnd`) VALUES (?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final AppLimitEntity entity) {
        if (entity.getPackageName() == null) {
          statement.bindNull(1);
        } else {
          statement.bindString(1, entity.getPackageName());
        }
        if (entity.getAppName() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getAppName());
        }
        if (entity.getCategory() == null) {
          statement.bindNull(3);
        } else {
          statement.bindString(3, entity.getCategory());
        }
        statement.bindLong(4, entity.getDailyLimitMinutes());
        final int _tmp = entity.isBlocked() ? 1 : 0;
        statement.bindLong(5, _tmp);
        if (entity.getScheduleStart() == null) {
          statement.bindNull(6);
        } else {
          statement.bindString(6, entity.getScheduleStart());
        }
        if (entity.getScheduleEnd() == null) {
          statement.bindNull(7);
        } else {
          statement.bindString(7, entity.getScheduleEnd());
        }
      }
    };
    this.__preparedStmtOfTrimOldReports = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM daily_reports WHERE day < ?";
        return _query;
      }
    };
    this.__preparedStmtOfClearAll = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM daily_reports";
        return _query;
      }
    };
  }

  @Override
  public Object insertReport(final DailyReportEntity report,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfDailyReportEntity.insert(report);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object insertTimelineEvents(final List<TimelineEventEntity> events,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfTimelineEventEntity.insert(events);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object saveAppLimits(final List<AppLimitEntity> limits,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfAppLimitEntity.insert(limits);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object trimOldReports(final String cutoffDay,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfTrimOldReports.acquire();
        int _argIndex = 1;
        if (cutoffDay == null) {
          _stmt.bindNull(_argIndex);
        } else {
          _stmt.bindString(_argIndex, cutoffDay);
        }
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfTrimOldReports.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object clearAll(final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfClearAll.acquire();
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfClearAll.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object getReport(final String day,
      final Continuation<? super DailyReportEntity> $completion) {
    final String _sql = "SELECT * FROM daily_reports WHERE day = ? LIMIT 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    if (day == null) {
      _statement.bindNull(_argIndex);
    } else {
      _statement.bindString(_argIndex, day);
    }
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<DailyReportEntity>() {
      @Override
      @Nullable
      public DailyReportEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfDay = CursorUtil.getColumnIndexOrThrow(_cursor, "day");
          final int _cursorIndexOfTotalScreenTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "totalScreenTimeMs");
          final int _cursorIndexOfScreenUnlocksApprox = CursorUtil.getColumnIndexOrThrow(_cursor, "screenUnlocksApprox");
          final int _cursorIndexOfPayloadJson = CursorUtil.getColumnIndexOrThrow(_cursor, "payloadJson");
          final int _cursorIndexOfUpdatedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAt");
          final DailyReportEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpDay;
            if (_cursor.isNull(_cursorIndexOfDay)) {
              _tmpDay = null;
            } else {
              _tmpDay = _cursor.getString(_cursorIndexOfDay);
            }
            final long _tmpTotalScreenTimeMs;
            _tmpTotalScreenTimeMs = _cursor.getLong(_cursorIndexOfTotalScreenTimeMs);
            final int _tmpScreenUnlocksApprox;
            _tmpScreenUnlocksApprox = _cursor.getInt(_cursorIndexOfScreenUnlocksApprox);
            final String _tmpPayloadJson;
            if (_cursor.isNull(_cursorIndexOfPayloadJson)) {
              _tmpPayloadJson = null;
            } else {
              _tmpPayloadJson = _cursor.getString(_cursorIndexOfPayloadJson);
            }
            final long _tmpUpdatedAt;
            _tmpUpdatedAt = _cursor.getLong(_cursorIndexOfUpdatedAt);
            _result = new DailyReportEntity(_tmpDay,_tmpTotalScreenTimeMs,_tmpScreenUnlocksApprox,_tmpPayloadJson,_tmpUpdatedAt);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getRecentReports(final Continuation<? super List<DailyReportEntity>> $completion) {
    final String _sql = "SELECT * FROM daily_reports ORDER BY day DESC LIMIT 30";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<DailyReportEntity>>() {
      @Override
      @NonNull
      public List<DailyReportEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfDay = CursorUtil.getColumnIndexOrThrow(_cursor, "day");
          final int _cursorIndexOfTotalScreenTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "totalScreenTimeMs");
          final int _cursorIndexOfScreenUnlocksApprox = CursorUtil.getColumnIndexOrThrow(_cursor, "screenUnlocksApprox");
          final int _cursorIndexOfPayloadJson = CursorUtil.getColumnIndexOrThrow(_cursor, "payloadJson");
          final int _cursorIndexOfUpdatedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAt");
          final List<DailyReportEntity> _result = new ArrayList<DailyReportEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final DailyReportEntity _item;
            final String _tmpDay;
            if (_cursor.isNull(_cursorIndexOfDay)) {
              _tmpDay = null;
            } else {
              _tmpDay = _cursor.getString(_cursorIndexOfDay);
            }
            final long _tmpTotalScreenTimeMs;
            _tmpTotalScreenTimeMs = _cursor.getLong(_cursorIndexOfTotalScreenTimeMs);
            final int _tmpScreenUnlocksApprox;
            _tmpScreenUnlocksApprox = _cursor.getInt(_cursorIndexOfScreenUnlocksApprox);
            final String _tmpPayloadJson;
            if (_cursor.isNull(_cursorIndexOfPayloadJson)) {
              _tmpPayloadJson = null;
            } else {
              _tmpPayloadJson = _cursor.getString(_cursorIndexOfPayloadJson);
            }
            final long _tmpUpdatedAt;
            _tmpUpdatedAt = _cursor.getLong(_cursorIndexOfUpdatedAt);
            _item = new DailyReportEntity(_tmpDay,_tmpTotalScreenTimeMs,_tmpScreenUnlocksApprox,_tmpPayloadJson,_tmpUpdatedAt);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getTimelineForDay(final String day,
      final Continuation<? super List<TimelineEventEntity>> $completion) {
    final String _sql = "SELECT * FROM timeline_events WHERE day = ? ORDER BY timestamp DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    if (day == null) {
      _statement.bindNull(_argIndex);
    } else {
      _statement.bindString(_argIndex, day);
    }
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<TimelineEventEntity>>() {
      @Override
      @NonNull
      public List<TimelineEventEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDay = CursorUtil.getColumnIndexOrThrow(_cursor, "day");
          final int _cursorIndexOfPackageName = CursorUtil.getColumnIndexOrThrow(_cursor, "packageName");
          final int _cursorIndexOfAppName = CursorUtil.getColumnIndexOrThrow(_cursor, "appName");
          final int _cursorIndexOfEventType = CursorUtil.getColumnIndexOrThrow(_cursor, "eventType");
          final int _cursorIndexOfTimestamp = CursorUtil.getColumnIndexOrThrow(_cursor, "timestamp");
          final int _cursorIndexOfDurationMs = CursorUtil.getColumnIndexOrThrow(_cursor, "durationMs");
          final int _cursorIndexOfCategory = CursorUtil.getColumnIndexOrThrow(_cursor, "category");
          final int _cursorIndexOfConfidence = CursorUtil.getColumnIndexOrThrow(_cursor, "confidence");
          final int _cursorIndexOfSource = CursorUtil.getColumnIndexOrThrow(_cursor, "source");
          final List<TimelineEventEntity> _result = new ArrayList<TimelineEventEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final TimelineEventEntity _item;
            final String _tmpId;
            if (_cursor.isNull(_cursorIndexOfId)) {
              _tmpId = null;
            } else {
              _tmpId = _cursor.getString(_cursorIndexOfId);
            }
            final String _tmpDay;
            if (_cursor.isNull(_cursorIndexOfDay)) {
              _tmpDay = null;
            } else {
              _tmpDay = _cursor.getString(_cursorIndexOfDay);
            }
            final String _tmpPackageName;
            if (_cursor.isNull(_cursorIndexOfPackageName)) {
              _tmpPackageName = null;
            } else {
              _tmpPackageName = _cursor.getString(_cursorIndexOfPackageName);
            }
            final String _tmpAppName;
            if (_cursor.isNull(_cursorIndexOfAppName)) {
              _tmpAppName = null;
            } else {
              _tmpAppName = _cursor.getString(_cursorIndexOfAppName);
            }
            final String _tmpEventType;
            if (_cursor.isNull(_cursorIndexOfEventType)) {
              _tmpEventType = null;
            } else {
              _tmpEventType = _cursor.getString(_cursorIndexOfEventType);
            }
            final long _tmpTimestamp;
            _tmpTimestamp = _cursor.getLong(_cursorIndexOfTimestamp);
            final Long _tmpDurationMs;
            if (_cursor.isNull(_cursorIndexOfDurationMs)) {
              _tmpDurationMs = null;
            } else {
              _tmpDurationMs = _cursor.getLong(_cursorIndexOfDurationMs);
            }
            final String _tmpCategory;
            if (_cursor.isNull(_cursorIndexOfCategory)) {
              _tmpCategory = null;
            } else {
              _tmpCategory = _cursor.getString(_cursorIndexOfCategory);
            }
            final String _tmpConfidence;
            if (_cursor.isNull(_cursorIndexOfConfidence)) {
              _tmpConfidence = null;
            } else {
              _tmpConfidence = _cursor.getString(_cursorIndexOfConfidence);
            }
            final String _tmpSource;
            if (_cursor.isNull(_cursorIndexOfSource)) {
              _tmpSource = null;
            } else {
              _tmpSource = _cursor.getString(_cursorIndexOfSource);
            }
            _item = new TimelineEventEntity(_tmpId,_tmpDay,_tmpPackageName,_tmpAppName,_tmpEventType,_tmpTimestamp,_tmpDurationMs,_tmpCategory,_tmpConfidence,_tmpSource);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getAppLimits(final Continuation<? super List<AppLimitEntity>> $completion) {
    final String _sql = "SELECT * FROM app_limits";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<AppLimitEntity>>() {
      @Override
      @NonNull
      public List<AppLimitEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfPackageName = CursorUtil.getColumnIndexOrThrow(_cursor, "packageName");
          final int _cursorIndexOfAppName = CursorUtil.getColumnIndexOrThrow(_cursor, "appName");
          final int _cursorIndexOfCategory = CursorUtil.getColumnIndexOrThrow(_cursor, "category");
          final int _cursorIndexOfDailyLimitMinutes = CursorUtil.getColumnIndexOrThrow(_cursor, "dailyLimitMinutes");
          final int _cursorIndexOfIsBlocked = CursorUtil.getColumnIndexOrThrow(_cursor, "isBlocked");
          final int _cursorIndexOfScheduleStart = CursorUtil.getColumnIndexOrThrow(_cursor, "scheduleStart");
          final int _cursorIndexOfScheduleEnd = CursorUtil.getColumnIndexOrThrow(_cursor, "scheduleEnd");
          final List<AppLimitEntity> _result = new ArrayList<AppLimitEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final AppLimitEntity _item;
            final String _tmpPackageName;
            if (_cursor.isNull(_cursorIndexOfPackageName)) {
              _tmpPackageName = null;
            } else {
              _tmpPackageName = _cursor.getString(_cursorIndexOfPackageName);
            }
            final String _tmpAppName;
            if (_cursor.isNull(_cursorIndexOfAppName)) {
              _tmpAppName = null;
            } else {
              _tmpAppName = _cursor.getString(_cursorIndexOfAppName);
            }
            final String _tmpCategory;
            if (_cursor.isNull(_cursorIndexOfCategory)) {
              _tmpCategory = null;
            } else {
              _tmpCategory = _cursor.getString(_cursorIndexOfCategory);
            }
            final int _tmpDailyLimitMinutes;
            _tmpDailyLimitMinutes = _cursor.getInt(_cursorIndexOfDailyLimitMinutes);
            final boolean _tmpIsBlocked;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsBlocked);
            _tmpIsBlocked = _tmp != 0;
            final String _tmpScheduleStart;
            if (_cursor.isNull(_cursorIndexOfScheduleStart)) {
              _tmpScheduleStart = null;
            } else {
              _tmpScheduleStart = _cursor.getString(_cursorIndexOfScheduleStart);
            }
            final String _tmpScheduleEnd;
            if (_cursor.isNull(_cursorIndexOfScheduleEnd)) {
              _tmpScheduleEnd = null;
            } else {
              _tmpScheduleEnd = _cursor.getString(_cursorIndexOfScheduleEnd);
            }
            _item = new AppLimitEntity(_tmpPackageName,_tmpAppName,_tmpCategory,_tmpDailyLimitMinutes,_tmpIsBlocked,_tmpScheduleStart,_tmpScheduleEnd);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getAppLimit(final String pkg,
      final Continuation<? super AppLimitEntity> $completion) {
    final String _sql = "SELECT * FROM app_limits WHERE packageName = ? LIMIT 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    if (pkg == null) {
      _statement.bindNull(_argIndex);
    } else {
      _statement.bindString(_argIndex, pkg);
    }
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<AppLimitEntity>() {
      @Override
      @Nullable
      public AppLimitEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfPackageName = CursorUtil.getColumnIndexOrThrow(_cursor, "packageName");
          final int _cursorIndexOfAppName = CursorUtil.getColumnIndexOrThrow(_cursor, "appName");
          final int _cursorIndexOfCategory = CursorUtil.getColumnIndexOrThrow(_cursor, "category");
          final int _cursorIndexOfDailyLimitMinutes = CursorUtil.getColumnIndexOrThrow(_cursor, "dailyLimitMinutes");
          final int _cursorIndexOfIsBlocked = CursorUtil.getColumnIndexOrThrow(_cursor, "isBlocked");
          final int _cursorIndexOfScheduleStart = CursorUtil.getColumnIndexOrThrow(_cursor, "scheduleStart");
          final int _cursorIndexOfScheduleEnd = CursorUtil.getColumnIndexOrThrow(_cursor, "scheduleEnd");
          final AppLimitEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpPackageName;
            if (_cursor.isNull(_cursorIndexOfPackageName)) {
              _tmpPackageName = null;
            } else {
              _tmpPackageName = _cursor.getString(_cursorIndexOfPackageName);
            }
            final String _tmpAppName;
            if (_cursor.isNull(_cursorIndexOfAppName)) {
              _tmpAppName = null;
            } else {
              _tmpAppName = _cursor.getString(_cursorIndexOfAppName);
            }
            final String _tmpCategory;
            if (_cursor.isNull(_cursorIndexOfCategory)) {
              _tmpCategory = null;
            } else {
              _tmpCategory = _cursor.getString(_cursorIndexOfCategory);
            }
            final int _tmpDailyLimitMinutes;
            _tmpDailyLimitMinutes = _cursor.getInt(_cursorIndexOfDailyLimitMinutes);
            final boolean _tmpIsBlocked;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsBlocked);
            _tmpIsBlocked = _tmp != 0;
            final String _tmpScheduleStart;
            if (_cursor.isNull(_cursorIndexOfScheduleStart)) {
              _tmpScheduleStart = null;
            } else {
              _tmpScheduleStart = _cursor.getString(_cursorIndexOfScheduleStart);
            }
            final String _tmpScheduleEnd;
            if (_cursor.isNull(_cursorIndexOfScheduleEnd)) {
              _tmpScheduleEnd = null;
            } else {
              _tmpScheduleEnd = _cursor.getString(_cursorIndexOfScheduleEnd);
            }
            _result = new AppLimitEntity(_tmpPackageName,_tmpAppName,_tmpCategory,_tmpDailyLimitMinutes,_tmpIsBlocked,_tmpScheduleStart,_tmpScheduleEnd);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
