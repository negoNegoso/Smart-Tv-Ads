plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Endereço que a TV abre. Produção fixa no APK; debug aponta para o Vite do
// dev.sh visto de dentro do emulador (10.0.2.2 = localhost da máquina).
val prodTvUrl = "https://smart-tv-ads.vercel.app/tv"
val devTvUrl = "http://10.0.2.2:21153/tv"
val tvUrlOverride: String? = providers.gradleProperty("tvUrl").orNull

android {
    namespace = "com.smarttvads.signage"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.smarttvads.signage"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "TV_URL", "\"${tvUrlOverride ?: devTvUrl}\"")
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "TV_URL", "\"${tvUrlOverride ?: prodTvUrl}\"")
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
}
