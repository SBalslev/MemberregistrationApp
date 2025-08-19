package com.club.medlems.domain

object QrParser {
    private val idRegex = Regex("id=([0-9]+)")
    fun extractMembershipId(raw: String): String? = idRegex.find(raw)?.groupValues?.get(1)
}
