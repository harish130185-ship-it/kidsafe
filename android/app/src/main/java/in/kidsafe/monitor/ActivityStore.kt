package in.kidsafe.monitor

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

class ActivityStore(context: Context): SQLiteOpenHelper(context, "activity_logs.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE daily (day TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { }
    fun save(day: String, report: JSONObject) {
        val v = ContentValues().apply { put("day", day); put("payload", report.toString()); put("updated_at", System.currentTimeMillis()) }
        writableDatabase.insertWithOnConflict("daily", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun get(day: String): JSONObject? {
        readableDatabase.rawQuery("SELECT payload FROM daily WHERE day=?", arrayOf(day)).use { c ->
            return if(c.moveToFirst()) JSONObject(c.getString(0)) else null
        }
    }
    fun clear() { writableDatabase.delete("daily", null, null) }
    fun trim(daysBefore: String) { writableDatabase.delete("daily", "day < ?", arrayOf(daysBefore)) }
}
