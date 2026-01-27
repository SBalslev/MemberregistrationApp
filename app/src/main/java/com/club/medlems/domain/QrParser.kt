package com.club.medlems.domain

object QrParser {
    private val idRegex = Regex("id=([0-9]+)")
    private val trialMemberPrefix = "MC:"
    
    /**
     * Extracts member ID from QR code content.
     * Supports:
     * - Legacy format: "...id=12345..." → "12345" (membershipId)
     * - Trial member format: "MC:uuid-here" → "uuid-here" (internalId)
     * 
     * The returned ID can be looked up via MemberDao.get() which searches
     * both membershipId and internalId.
     */
    fun extractMemberId(raw: String): String? {
        // Check for trial member format first (MC:internalId)
        if (raw.startsWith(trialMemberPrefix)) {
            return raw.removePrefix(trialMemberPrefix).trim().takeIf { it.isNotEmpty() }
        }
        // Fall back to legacy id=X format
        return idRegex.find(raw)?.groupValues?.get(1)
    }
    
    /** @deprecated Use extractMemberId instead */
    @Deprecated("Use extractMemberId", ReplaceWith("extractMemberId(raw)"))
    fun extractMembershipId(raw: String): String? = extractMemberId(raw)
}
