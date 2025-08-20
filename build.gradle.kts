// Top-level build file
plugins {
    id("com.android.application") version "8.5.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.10" apply false
    id("org.jetbrains.kotlin.kapt") version "1.9.23" apply false
    id("com.google.dagger.hilt.android") version "2.49" apply false
}

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
    // No additional buildscript classpath entries required; all plugins are declared above.
    }
}
