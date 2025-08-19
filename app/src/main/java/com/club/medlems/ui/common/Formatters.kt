package com.club.medlems.ui.common

import kotlinx.datetime.LocalDate

object Formatters {
    // Danish numeric date format: dd-MM-yyyy
    fun daDate(d: LocalDate?): String = when (d) {
        null -> "—"
        else -> String.format("%02d-%02d-%04d", d.dayOfMonth, d.monthNumber, d.year)
    }
}
