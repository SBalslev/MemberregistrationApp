package com.club.medlems

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class MedlemsApp : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
