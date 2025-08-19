package com.club.medlems.domain

import com.club.medlems.data.entity.PracticeType

object ClassificationOptions {
    private val rifle = listOf(
        "BK 1","BK 2","BK 3","BK 4","J 1","J 2","ST 1","ST 2","ST 3","Å 1","Å 2","Å 3","SE 1","SE 2","SE 3","FRI 1","FRI 2"
    )
    private val airRifle = listOf(
        "BK 1","BK 2","BK 3","J 1","J 2","ST 1","ST 2","ST 3","Å 1","Å 2","SE 1","SE 2","FRI 1","FRI 2"
    )
    private val pistol = listOf(
        "BK","JUN","1H 1","1H 2","1H 3","2H 1","2H 2","SE1","SE2","FRI"
    )
    private val airPistol = listOf(
        "BK","JUN","1H 1","1H 2","2H 1","2H 2","SE","FRI"
    )
    private val other = listOf(
        "22 Mod","GP 32","GPA","GR","GM","22M"
    )

    private val optionsByType: Map<PracticeType, List<String>> = mapOf(
        PracticeType.Riffel to rifle,
        PracticeType.LuftRiffel to airRifle,
        PracticeType.Pistol to pistol,
        PracticeType.LuftPistol to airPistol,
        PracticeType.Andet to other
    )

    fun optionsFor(type: PracticeType): List<String> = optionsByType[type].orEmpty()

    fun isValid(type: PracticeType, classification: String?): Boolean =
        classification != null && optionsFor(type).contains(classification)
}
