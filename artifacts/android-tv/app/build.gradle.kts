import com.android.build.gradle.internal.api.BaseVariantOutputImpl

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Endereço que a TV abre: produção em debug e release. Para testar contra o
// dev.sh no emulador, passe -PtvUrl=http://10.0.2.2:21153/tv (10.0.2.2 =
// localhost da máquina visto de dentro do emulador).
val prodTvUrl = "https://smart-tv-ads.vercel.app/tv"
val tvUrl: String = providers.gradleProperty("tvUrl").orNull ?: prodTvUrl

// Versão vem da release no CI (-PversionName=1.2.3, sufixo -rc1 aceito). O
// versionCode cresce junto para o Android aceitar instalar por cima:
// major*1000000 + minor*1000 + patch (1.2.3 -> 1002003).
val appVersionName: String = providers.gradleProperty("versionName").orNull ?: "1.0.0"
val appVersionCode: Int = run {
    val m = Regex("""(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.]+)?""").matchEntire(appVersionName)
        ?: throw GradleException("versionName inválido: '$appVersionName' (use X.Y.Z ou X.Y.Z-sufixo)")
    val (major, minor, patch) = m.destructured.toList().take(3).map { it.toInt() }
    if (minor > 999 || patch > 999 || major > 2000) {
        throw GradleException("versionName '$appVersionName': major até 2000, minor e patch até 999")
    }
    major * 1_000_000 + minor * 1_000 + patch
}

// Keystore de release fora do git (ver README). Perder o arquivo impede
// atualizar o APK por cima nas TVs já instaladas.
val releaseKeystore: String? = System.getenv("SIGNAGE_KEYSTORE")

android {
    namespace = "com.smarttvads.signage"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.smarttvads.signage"
        minSdk = 21
        targetSdk = 34
        versionCode = appVersionCode
        versionName = appVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("SIGNAGE_KEYSTORE_PASS")
                keyAlias = System.getenv("SIGNAGE_KEY_ALIAS")
                keyPassword = System.getenv("SIGNAGE_KEY_PASS")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "TV_URL", "\"$tvUrl\"")
            // Cleartext só no debug, para o -PtvUrl=http://... do dev.sh.
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "TV_URL", "\"$tvUrl\"")
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            signingConfig = signingConfigs.findByName("release")
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

    applicationVariants.all {
        val suffix = if (buildType.name == "debug") "-debug" else ""
        outputs.all {
            (this as BaseVariantOutputImpl).outputFileName = "signage-tv-${versionName}$suffix.apk"
        }
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

tasks.configureEach {
    if (name == "packageRelease") {
        doFirst {
            if (releaseKeystore == null) {
                throw GradleException(
                    "Keystore de release ausente: defina SIGNAGE_KEYSTORE, SIGNAGE_KEYSTORE_PASS, " +
                        "SIGNAGE_KEY_ALIAS e SIGNAGE_KEY_PASS (ver artifacts/android-tv/README.md).",
                )
            }
        }
    }
}
