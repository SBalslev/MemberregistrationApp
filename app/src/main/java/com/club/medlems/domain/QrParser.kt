package com.club.medlems.domain

object QrParser {
    private val idRegex = Regex("id=([0-9]+)")
    private val trialMemberPrefix = "MC:"
    private val equipmentPrefix = "EQ:"
    
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

    /**
     * Extracts an equipment item ID from QR code content.
     * Expected format: "EQ:uuid-here" → "uuid-here" (EquipmentItem.id)
     *
     * Returns null if the scanned code isn't an equipment QR code (e.g. it's a
     * member card), allowing callers to fall back accordingly.
     */
    fun extractEquipmentId(raw: String): String? {
        if (!raw.startsWith(equipmentPrefix)) return null
        return raw.removePrefix(equipmentPrefix).trim().takeIf { it.isNotEmpty() }
    }

    /** Builds the QR string content to encode for a given equipment item ID. */
    fun buildEquipmentQrContent(equipmentId: String): String = "$equipmentPrefix$equipmentId"
}
