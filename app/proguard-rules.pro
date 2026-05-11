# ProGuard / R8 rules for ISS Sportsskytter
# Enable these by setting isMinifyEnabled = true in build.gradle.kts

# Keep Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.club.medlems.**$$serializer { *; }
-keepclassmembers class com.club.medlems.** {
    *** Companion;
}
-keepclasseswithmembers class com.club.medlems.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep Room entities and DAOs
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao interface *

# Keep Hilt generated classes
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep @dagger.hilt.android.lifecycle.HiltViewModel class * { *; }

# Keep Ktor engine and serialization
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# Keep ZXing for QR scanning
-keep class com.google.zxing.** { *; }
-keep class com.journeyapps.barcodescanner.** { *; }

# Keep jmDNS for network discovery
-keep class javax.jmdns.** { *; }
