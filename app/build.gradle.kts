plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Resolve Guava listenablefuture capability conflict between Android libs and Ktor JWT dependencies
configurations.configureEach {
    resolutionStrategy.capabilitiesResolution.withCapability("com.google.guava:listenablefuture") {
        select("com.google.guava:guava:0")
    }
}

android {
    namespace = "com.club.medlems"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.club.medlems"
        minSdk = 23
        targetSdk = 34
    // Auto-incrementing versionCode: use epoch seconds so each build is higher
    versionCode = (System.currentTimeMillis() / 1000L).toInt()
        versionName = "1.3.8"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        setProperty("archivesBaseName", "ISS-Skydning-Registrering-v${versionName}")
    }
    
    // Product flavors for different device roles
    flavorDimensions += "deviceRole"
    productFlavors {
        create("member") {
            dimension = "deviceRole"
            applicationIdSuffix = ""
            // Member tablet - default app name from main resources
            resValue("string", "app_name_flavor", "ISS Skydning")
            buildConfigField("String", "DEVICE_ROLE", "\"MEMBER_TABLET\"")
            buildConfigField("Boolean", "EQUIPMENT_ENABLED", "false")
        }
        create("admin") {
            dimension = "deviceRole"
            applicationIdSuffix = ".admin"
            // Admin tablet - distinct app name
            resValue("string", "app_name_flavor", "ISS Skydning Admin")
            buildConfigField("String", "DEVICE_ROLE", "\"ADMIN_TABLET\"")
            buildConfigField("Boolean", "EQUIPMENT_ENABLED", "true")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        // Use debug signing for release builds (temporary - create proper keystore later)
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.11"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" 
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.05.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    // FileProvider & storage helpers rely on core-ktx
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.3")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-text")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.compose.material3:material3:1.2.1")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    // Material Components (provides Theme.Material3.* resource styles)
    implementation("com.google.android.material:material:1.12.0")

    // Camera & QR
    implementation("androidx.camera:camera-core:1.3.2")
    implementation("androidx.camera:camera-camera2:1.3.2")
    implementation("androidx.camera:camera-lifecycle:1.3.2")
    implementation("androidx.camera:camera-view:1.3.2")
    implementation("com.google.zxing:core:3.5.3")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.3")

    // Room
    implementation("androidx.room:room-runtime:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")

    // Hilt
    implementation("com.google.dagger:hilt-android:2.49")
    ksp("com.google.dagger:hilt-android-compiler:2.49")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    implementation("com.google.accompanist:accompanist-flowlayout:0.34.0")

    // (removed) explicit javapoet override; rely on transitive versions from processors

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // WorkManager for background tasks
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    implementation("androidx.hilt:hilt-work:1.2.0")
    ksp("androidx.hilt:hilt-compiler:1.2.0")

    // Date/time
    implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.0")

    // Serialization for sync protocol
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // mDNS/DNS-SD for local network device discovery
    implementation("org.jmdns:jmdns:3.5.9")

    // Ktor embedded server for sync API (CIO engine for Android compatibility)
    val ktorVersion = "2.3.9"
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-cio:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    implementation("io.ktor:ktor-server-auth:$ktorVersion")
    implementation("io.ktor:ktor-server-auth-jwt:$ktorVersion")
    
    // Ktor client for making sync requests to peers (CIO engine for Android compatibility)
    implementation("io.ktor:ktor-client-core:$ktorVersion")
    implementation("io.ktor:ktor-client-cio:$ktorVersion")
    implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")

    // Core library desugaring for API < 26
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")

    // CSV
    implementation("com.github.doyaaaaaken:kotlin-csv-jvm:1.9.3")

    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
