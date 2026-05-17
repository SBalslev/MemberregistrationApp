package com.club.medlems.data.repository

import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.Member
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.Collator
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

private val danishCollator: Collator = Collator.getInstance(Locale("da", "DK")).apply {
    strength = Collator.PRIMARY
}

private fun List<Member>.sortedDanish(): List<Member> =
    sortedWith(Comparator { a, b ->
        val last = danishCollator.compare(a.lastName.orEmpty(), b.lastName.orEmpty())
        if (last != 0) last else danishCollator.compare(a.firstName.orEmpty(), b.firstName.orEmpty())
    })

/** Sorts by prefix-first relevance, then Danish alphabetical within each tier. */
private fun List<Member>.sortedByRelevance(query: String): List<Member> {
    val q = query.trim().lowercase()
    fun Member.rank(): Int {
        val first = firstName.orEmpty().lowercase()
        val last = lastName.orEmpty().lowercase()
        val full = "$first $last"
        val id = membershipId?.lowercase().orEmpty()
        return when {
            first.startsWith(q) || last.startsWith(q) || full.startsWith(q) || id.startsWith(q) -> 0
            else -> 1
        }
    }
    return sortedWith(Comparator { a, b ->
        val rankCmp = a.rank().compareTo(b.rank())
        if (rankCmp != 0) rankCmp
        else {
            val last = danishCollator.compare(a.lastName.orEmpty(), b.lastName.orEmpty())
            if (last != 0) last else danishCollator.compare(a.firstName.orEmpty(), b.firstName.orEmpty())
        }
    })
}

/**
 * Repository for member operations.
 */
@Singleton
class MemberRepository @Inject constructor(
    private val memberDao: MemberDao
) {
    /**
     * Gets a member by their internal ID (primary key).
     */
    suspend fun getMemberByInternalId(internalId: String): Member? = 
        withContext(Dispatchers.IO) {
            memberDao.getByInternalId(internalId)
        }
    
    /**
     * Gets a member by their membership ID.
     */
    suspend fun getMemberByMembershipId(membershipId: String): Member? = 
        withContext(Dispatchers.IO) {
            memberDao.get(membershipId)
        }
    
    /**
     * Searches for members by name or membership ID.
     * Returns up to 20 active members matching the query.
     */
    suspend fun searchMembersByName(query: String): List<Member> = 
        withContext(Dispatchers.IO) {
            if (query.isBlank()) {
                emptyList()
            } else {
                memberDao.searchByNameOrId(query.trim()).sortedByRelevance(query.trim())
            }
        }
    
    /**
     * Gets all members.
     */
    suspend fun getAllMembers(): List<Member> = withContext(Dispatchers.IO) {
        memberDao.allMembers()
    }
}
