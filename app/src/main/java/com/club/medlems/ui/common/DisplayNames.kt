package com.club.medlems.ui.common

import com.club.medlems.data.entity.PracticeType

val PracticeType.displayName: String
    get() = when (this) {
        PracticeType.Riffel -> "Riffel"
        PracticeType.Pistol -> "Pistol"
    PracticeType.LuftRiffel -> "Luftriffel"
    PracticeType.LuftPistol -> "Luftpistol"
        PracticeType.Andet -> "Andet"
    }
