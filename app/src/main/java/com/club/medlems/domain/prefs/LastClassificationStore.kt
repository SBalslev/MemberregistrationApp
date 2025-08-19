package com.club.medlems.domain.prefs

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import com.club.medlems.data.entity.PracticeType

@Singleton
class LastClassificationStore @Inject constructor(@ApplicationContext context: Context) {
    private val prefs = context.getSharedPreferences("last_classification", Context.MODE_PRIVATE)

    fun get(memberId: String): Pair<PracticeType?, String?> {
        val typeName = prefs.getString("type_$memberId", null)
        val type = typeName?.let { runCatching { PracticeType.valueOf(it) }.getOrNull() }
        val cls = prefs.getString("class_$memberId", null)
        return type to cls
    }

    fun set(memberId: String, type: PracticeType, classification: String?) {
        prefs.edit()
            .putString("type_$memberId", type.name)
            .putString("class_$memberId", classification)
            .apply()
    }
}
