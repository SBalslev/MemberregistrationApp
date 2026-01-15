package com.club.medlems.data.repository

import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.entity.Member
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for member operations.
 */
@Singleton
class MemberRepository @Inject constructor(
    private val memberDao: MemberDao
) {
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
                memberDao.searchByNameOrId(query.trim())
            }
        }
    
    /**
     * Gets all members.
     */
    suspend fun getAllMembers(): List<Member> = withContext(Dispatchers.IO) {
        memberDao.allMembers()
    }
}
