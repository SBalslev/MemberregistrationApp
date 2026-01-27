package com.club.medlems.domain.prefs

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import com.club.medlems.data.dao.MemberPreferenceDao
import com.club.medlems.data.entity.MemberPreference
import com.club.medlems.data.entity.PracticeType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock

/**
 * Stores member practice preferences (last selected discipline/classification).
 * Writes to both SharedPreferences (for fast local access) and Room database (for sync).
 */
@Singleton
class LastClassificationStore @Inject constructor(
    @ApplicationContext context: Context,
    private val memberPreferenceDao: MemberPreferenceDao
) {
    private val prefs = context.getSharedPreferences("last_classification", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Get the last selected practice type and classification for a member.
     * Reads from SharedPreferences for fast local access.
     */
    fun get(memberId: String): Pair<PracticeType?, String?> {
        val typeName = prefs.getString("type_$memberId", null)
        val type = typeName?.let { runCatching { PracticeType.valueOf(it) }.getOrNull() }
        val cls = prefs.getString("class_$memberId", null)
        return type to cls
    }

    /**
     * Set the last selected practice type and classification for a member.
     * Writes to both SharedPreferences (for fast local access) and Room database (for sync).
     */
    fun set(memberId: String, type: PracticeType, classification: String?) {
        // Write to SharedPreferences for fast local access
        prefs.edit()
            .putString("type_$memberId", type.name)
            .putString("class_$memberId", classification)
            .apply()

        // Write to Room database for sync (fire-and-forget)
        scope.launch {
            val preference = MemberPreference(
                memberId = memberId,
                lastPracticeType = type.name,
                lastClassification = classification,
                updatedAtUtc = Clock.System.now()
            )
            memberPreferenceDao.upsert(preference)
        }
    }

    /**
     * Apply synced preferences from laptop to local SharedPreferences.
     * Called during initial sync when receiving preferences from laptop.
     */
    suspend fun applyFromSync(preferences: List<MemberPreference>) {
        val editor = prefs.edit()
        preferences.forEach { pref ->
            if (pref.lastPracticeType != null) {
                editor.putString("type_${pref.memberId}", pref.lastPracticeType)
            }
            if (pref.lastClassification != null) {
                editor.putString("class_${pref.memberId}", pref.lastClassification)
            }
            // Also update Room database
            memberPreferenceDao.upsert(pref)
        }
        editor.apply()
    }
}
