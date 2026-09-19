# App Android para TV e TV box — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APK Android (TV e TV box) que abre sozinho, carrega `/tv` numa WebView em tela cheia e deixa o `tv.html` existente decidir entre tela de vínculo (QR) e painel.

**Architecture:** Casca nativa mínima em Kotlin: uma `Activity` sem AppCompat com WebView criada por código, registrada como launcher comum, launcher de TV e tela inicial (`HOME`). Lógica testável isolada em classes puras (`ConnectivityGuard`, `WatchdogReload`) e num `WebViewClient` próprio que traduz callbacks em três eventos (`onMainFrameFailed`, `onPageLoaded`, `onRendererGone`). No `tv.html`, só esconder o gatilho de tela cheia quando o user agent traz `SignageApp/`.

**Tech Stack:** Kotlin 2.0.21, Android Gradle Plugin 8.7.3, Gradle wrapper 8.11.1, JDK 17, compileSdk 35 / targetSdk 34 / minSdk 21, JUnit 4 + Robolectric 4.14.1 (JVM), AndroidX Test (instrumentado). `tv.html` ES5 + vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-app-android-tv-design.md`

## Global Constraints

- Módulo em `artifacts/android-tv/`, projeto Gradle independente — fora do workspace pnpm e do build da Vercel.
- `applicationId` e `namespace`: `com.smarttvads.signage`. `minSdk 21`, `targetSdk 34`, `versionName "1.0.0"`, `versionCode 1`.
- Somente paisagem. `android.software.leanback` e `android.hardware.touchscreen` com `required="false"`.
- Permissões: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`. Nenhuma outra.
- `TV_URL`: release `https://smart-tv-ads.vercel.app/tv`; debug `http://10.0.2.2:21153/tv`; ambos sobrescrevíveis por `-PtvUrl=`.
- Cleartext (`http://`) só no debug.
- User agent = UA padrão + ` SignageApp/<versionName>`.
- Backoff de nova tentativa: 5 s → 10 s → 20 s → 40 s → 60 s (teto), resetado após carga ok.
- Reload preventivo diário às 04:00, horário local.
- Sem AppCompat, sem R8/minify, sem dependência de runtime além da stdlib do Kotlin.
- Keystore de release fora do git, lido de `SIGNAGE_KEYSTORE`, `SIGNAGE_KEYSTORE_PASS`, `SIGNAGE_KEY_ALIAS`, `SIGNAGE_KEY_PASS`.
- APK de saída: `signage-tv-<versionName>.apk` (release) e `signage-tv-<versionName>-debug.apk` (debug).
- `tv.html` continua ES5 (sem `let`/`const`/arrow/template string).
- Textos para o usuário em português. Comentários no estilo do repo: português, explicam o porquê.
- `allowBackup="false"`: um backup restaurado noutra box clonaria a key da TV (`localStorage` da WebView).

**Desvio registrado da spec:** a spec pede teste instrumentado em emulador Android TV API 29. Neste Mac (Apple Silicon) a imagem de TV API 29 só existe em x86 e não roda. O teste instrumentado usa `system-images;android-31;android-tv;arm64-v8a` (a mais próxima); comportamento específico do Android 10 (boot/tela inicial) fica no checklist manual da TV box real. O teste instrumentado usa `evaluateJavascript` em vez de Espresso-Web: a tela de QR aparece de forma assíncrona e um laço de espera com JS é mais simples e sem dependência extra. O caso "device criado pela API com a key lida da página → painel aparece em até 10 s" da spec não está em `TvScreenTest` — criar um device exige autenticação de admin, que o teste instrumentado não tem; ele é coberto pelo E2E manual do Step 5 da Task 9 (device inserido no banco de dev local, vinculado pela tela `/parear/<KEY>` como admin).

**Comandos base** (todas as tarefas Android rodam de `artifacts/android-tv/`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
ADB="$ANDROID_HOME/platform-tools/adb"
SCRATCH=/private/tmp/claude-503/-Users-yvillanova-Downloads-tv-Smart-Tv-Ads/7279b08e-d80d-460b-9f7a-24c1f96c96c3/scratchpad
```

---

## File Structure

```
artifacts/android-tv/
├── .gitignore                         # build/, .gradle/, local.properties, *.jks, *.keystore
├── README.md                          # build, assinatura, instalação na box, checklist manual
├── settings.gradle.kts                # repositórios e módulo :app
├── build.gradle.kts                   # versões dos plugins (apply false)
├── gradle.properties
├── gradlew, gradlew.bat, gradle/wrapper/*   # wrapper 8.11.1 (gerado)
└── app/
    ├── build.gradle.kts               # android {}, TV_URL por build type, assinatura, nome do APK
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── java/com/smarttvads/signage/
        │   │   ├── MainActivity.kt        # hospeda WebView: tela cheia, teclas, overlay, retry, watchdog
        │   │   ├── TvWebViewConfig.kt     # settings da WebView + user agent
        │   │   ├── TvWebViewClient.kt     # callbacks da WebView -> 3 eventos do Listener
        │   │   ├── ConnectivityGuard.kt   # backoff + "essa falha cobre a tela?" (puro)
        │   │   ├── WatchdogReload.kt      # espera até o próximo 04:00 (puro)
        │   │   └── BootReceiver.kt        # BOOT_COMPLETED -> MainActivity
        │   └── res/
        │       ├── layout/activity_main.xml
        │       ├── values/strings.xml
        │       ├── values/themes.xml
        │       ├── drawable/ic_launcher.xml
        │       └── drawable/banner.xml
        ├── test/
        │   ├── resources/robolectric.properties
        │   └── java/com/smarttvads/signage/
        │       ├── ManifestTest.kt
        │       ├── ConnectivityGuardTest.kt
        │       ├── WatchdogReloadTest.kt
        │       ├── TvWebViewConfigTest.kt
        │       ├── TvWebViewClientTest.kt
        │       ├── MainActivityTest.kt
        │       └── BootReceiverTest.kt
        └── androidTest/java/com/smarttvads/signage/
            └── TvScreenTest.kt

artifacts/signage/public/tv.html                    # modificar bloco "Tela cheia"
artifacts/signage/src/__tests__/tv-html.test.ts     # casos "dentro do app Android"
```

---

### Task 1: Esqueleto Gradle, manifest e recursos

**Files:**
- Create: `artifacts/android-tv/.gitignore`
- Create: `artifacts/android-tv/settings.gradle.kts`
- Create: `artifacts/android-tv/build.gradle.kts`
- Create: `artifacts/android-tv/gradle.properties`
- Create: `artifacts/android-tv/local.properties` (ignorado pelo git)
- Create (gerados): `artifacts/android-tv/gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`, `gradle/wrapper/gradle-wrapper.properties`
- Create: `artifacts/android-tv/app/build.gradle.kts`
- Create: `artifacts/android-tv/app/src/main/AndroidManifest.xml`
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt` (stub)
- Create: `artifacts/android-tv/app/src/main/res/values/strings.xml`
- Create: `artifacts/android-tv/app/src/main/res/values/themes.xml`
- Create: `artifacts/android-tv/app/src/main/res/drawable/ic_launcher.xml`
- Create: `artifacts/android-tv/app/src/main/res/drawable/banner.xml`
- Create: `artifacts/android-tv/app/src/test/resources/robolectric.properties`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/ManifestTest.kt`

**Interfaces:**
- Produces: `BuildConfig.TV_URL: String`, `BuildConfig.VERSION_NAME`; classe `com.smarttvads.signage.MainActivity` (stub `Activity`, preenchida na Task 5); strings `app_name`, `offline_message`, `webview_missing`; tema `Theme.Signage`.

- [ ] **Step 1: `.gitignore` e settings mínimo para gerar o wrapper**

`artifacts/android-tv/.gitignore`:

```gitignore
.gradle/
build/
local.properties
*.jks
*.keystore
.idea/
*.iml
captures/
```

`artifacts/android-tv/settings.gradle.kts` (versão mínima, só para o wrapper — completada no Step 2):

```kotlin
rootProject.name = "signage-tv"
```

Gerar o wrapper com o Gradle do sistema (9.5.1), fixando 8.11.1 (exigido pelo AGP 8.7.3):

```bash
cd artifacts/android-tv && gradle wrapper --gradle-version 8.11.1 --distribution-type bin
```

Expected: `BUILD SUCCESSFUL`; existem `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`, `gradle/wrapper/gradle-wrapper.properties` com `gradle-8.11.1-bin.zip`.

- [ ] **Step 2: Arquivos Gradle completos**

`artifacts/android-tv/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "signage-tv"
include(":app")
```

`artifacts/android-tv/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
```

`artifacts/android-tv/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
```

`artifacts/android-tv/local.properties` (não versionado):

```properties
sdk.dir=/Users/yvillanova/Library/Android/sdk
```

`artifacts/android-tv/app/build.gradle.kts`:

```kotlin
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
```

`artifacts/android-tv/app/src/test/resources/robolectric.properties` (API 29 = Android 10, alvo principal):

```properties
sdk=29
```

- [ ] **Step 3: Escrever o teste que falha**

`artifacts/android-tv/app/src/test/java/com/smarttvads/signage/ManifestTest.kt`:

```kotlin
package com.smarttvads.signage

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ManifestTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun abreMainActivity(categoria: String): Boolean {
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(categoria)
            .setPackage(context.packageName)
        return context.packageManager.queryIntentActivities(intent, 0)
            .any { it.activityInfo.name == MainActivity::class.java.name }
    }

    @Test
    fun `aparece no launcher de TV box com Android comum`() {
        assertTrue(abreMainActivity(Intent.CATEGORY_LAUNCHER))
    }

    @Test
    fun `aparece no launcher do Android TV`() {
        assertTrue(abreMainActivity(Intent.CATEGORY_LEANBACK_LAUNCHER))
    }

    @Test
    fun `pode ser escolhido como tela inicial`() {
        assertTrue(abreMainActivity(Intent.CATEGORY_HOME))
    }

    @Test
    fun `debug aponta para o Vite local visto pelo emulador`() {
        assertEquals("http://10.0.2.2:21153/tv", BuildConfig.TV_URL)
    }

    @Test
    fun `backup desligado para nao clonar a key da TV`() {
        val flags = context.applicationInfo.flags
        assertEquals(0, flags and ApplicationInfo.FLAG_ALLOW_BACKUP)
    }
}
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*ManifestTest*'`
Expected: FAIL — compilação quebra com `Unresolved reference: MainActivity` (ou manifest ausente).

- [ ] **Step 5: Manifest, stub da Activity e recursos**

`artifacts/android-tv/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <!-- Roda em Android TV e em TV box com Android comum (sem leanback nem toque). -->
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />

    <!-- allowBackup=false: um backup restaurado noutra box clonaria a key da TV. -->
    <application
        android:allowBackup="false"
        android:banner="@drawable/banner"
        android:icon="@drawable/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.Signage"
        android:usesCleartextTraffic="${usesCleartextTraffic}">

        <activity
            android:name=".MainActivity"
            android:configChanges="keyboard|keyboardHidden|navigation|orientation|screenLayout|screenSize|smallestScreenSize|uiMode|density"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="landscape">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
            <!-- Tela inicial: no Android 10+ é o que garante abrir no boot. -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.HOME" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt` (stub; Task 5 substitui):

```kotlin
package com.smarttvads.signage

import android.app.Activity

class MainActivity : Activity()
```

`artifacts/android-tv/app/src/main/res/values/strings.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Signage TV</string>
    <string name="offline_message">Sem conexão. Tentando novamente…</string>
    <string name="webview_missing">Atualize o Android System WebView nas configurações do aparelho.</string>
</resources>
```

`artifacts/android-tv/app/src/main/res/values/themes.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.Signage" parent="@android:style/Theme.Black.NoTitleBar.Fullscreen">
        <item name="android:windowBackground">@android:color/black</item>
    </style>
</resources>
```

`artifacts/android-tv/app/src/main/res/drawable/ic_launcher.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="48"
    android:viewportHeight="48">
    <path android:fillColor="#FF111111" android:pathData="M0,0h48v48h-48z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M8,12h32v20h-32z" />
    <path android:fillColor="#FF111111" android:pathData="M10,14h28v16h-28z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M18,35h12v2h-12z" />
</vector>
```

`artifacts/android-tv/app/src/main/res/drawable/banner.xml` (320×180, exigido pelo launcher do Android TV):

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="320dp"
    android:height="180dp"
    android:viewportWidth="320"
    android:viewportHeight="180">
    <path android:fillColor="#FF111111" android:pathData="M0,0h320v180h-320z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M110,45h100v65h-100z" />
    <path android:fillColor="#FF111111" android:pathData="M116,51h88v53h-88z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M140,118h40v6h-40z" />
</vector>
```

- [ ] **Step 6: Rodar e ver passar; build debug**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*ManifestTest*' && ./gradlew :app:assembleDebug`
Expected: 5 testes PASS; `BUILD SUCCESSFUL`; APK em `app/build/outputs/apk/debug/`.

- [ ] **Step 7: Commit**

```bash
cd artifacts/android-tv
git add .gitignore settings.gradle.kts build.gradle.kts gradle.properties gradlew gradlew.bat gradle/ app/
git status --short   # conferir: local.properties e build/ NÃO aparecem
git commit -m "feat(android-tv): esqueleto do app com manifest de TV e tela inicial

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `ConnectivityGuard` — backoff e decisão de falha

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/ConnectivityGuard.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/ConnectivityGuardTest.kt`

**Interfaces:**
- Produces:
  - `class ConnectivityGuard { fun nextDelayMs(): Long; fun reset() }`
  - `ConnectivityGuard.isOfflineError(isMainFrame: Boolean, httpStatus: Int?): Boolean` (companion; `httpStatus == null` = erro de rede)
  - `ConnectivityGuard.BASE_DELAY_MS = 5_000L`, `ConnectivityGuard.MAX_DELAY_MS = 60_000L`

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/android-tv/app/src/test/java/com/smarttvads/signage/ConnectivityGuardTest.kt`:

```kotlin
package com.smarttvads.signage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectivityGuardTest {

    @Test
    fun `espera dobra a cada falha ate o teto de 60 s`() {
        val guard = ConnectivityGuard()
        val esperas = List(7) { guard.nextDelayMs() }
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 40_000L, 60_000L, 60_000L, 60_000L), esperas)
    }

    @Test
    fun `reset volta a espera para 5 s`() {
        val guard = ConnectivityGuard()
        repeat(4) { guard.nextDelayMs() }
        guard.reset()
        assertEquals(5_000L, guard.nextDelayMs())
    }

    @Test
    fun `erro de rede na pagina principal cobre a tela`() {
        assertTrue(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = null))
    }

    @Test
    fun `HTTP 400 ou mais na pagina principal cobre a tela`() {
        assertTrue(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = 404))
        assertTrue(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = 503))
    }

    @Test
    fun `HTTP abaixo de 400 na pagina principal nao cobre a tela`() {
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = 304))
    }

    @Test
    fun `falha de sub-recurso nunca cobre a tela`() {
        // Imagem, iframe do YouTube ou /api/display/<key>/slides (404 = TV sem
        // vínculo): quem trata é o tv.html.
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = false, httpStatus = null))
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = false, httpStatus = 404))
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = false, httpStatus = 500))
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*ConnectivityGuardTest*'`
Expected: FAIL — `Unresolved reference: ConnectivityGuard`.

- [ ] **Step 3: Implementar**

`artifacts/android-tv/app/src/main/java/com/smarttvads/signage/ConnectivityGuard.kt`:

```kotlin
package com.smarttvads.signage

/**
 * Decide se uma falha de carga deve cobrir a tela com o aviso de "sem conexão"
 * e quanto esperar antes de tentar de novo. Sem Android: testável na JVM pura.
 *
 * Só a página principal (`/tv`) conta. Falha de sub-recurso — arte, iframe do
 * YouTube, o 404 de `/api/display/<key>/slides` que leva à tela de QR — é
 * assunto do tv.html.
 */
class ConnectivityGuard {
    private var attempt = 0

    /** Espera antes da próxima tentativa: 5 s, 10 s, 20 s, 40 s e depois 60 s. */
    fun nextDelayMs(): Long {
        val delay = minOf(BASE_DELAY_MS shl attempt.coerceAtMost(4), MAX_DELAY_MS)
        attempt++
        return delay
    }

    /** Carga bem-sucedida: a próxima falha volta a esperar 5 s. */
    fun reset() {
        attempt = 0
    }

    companion object {
        const val BASE_DELAY_MS = 5_000L
        const val MAX_DELAY_MS = 60_000L

        /** `httpStatus == null` significa erro de rede (DNS, sem Wi-Fi, timeout). */
        fun isOfflineError(isMainFrame: Boolean, httpStatus: Int?): Boolean =
            isMainFrame && (httpStatus == null || httpStatus >= 400)
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*ConnectivityGuardTest*'`
Expected: 6 testes PASS.

- [ ] **Step 5: Commit**

```bash
cd artifacts/android-tv
git add app/src/main/java/com/smarttvads/signage/ConnectivityGuard.kt app/src/test/java/com/smarttvads/signage/ConnectivityGuardTest.kt
git commit -m "feat(android-tv): backoff e decisão de falha da carga da TV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `WatchdogReload` — espera até o reload das 04:00

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/WatchdogReload.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/WatchdogReloadTest.kt`

**Interfaces:**
- Produces: `object WatchdogReload { const val RELOAD_HOUR = 4; fun delayUntilNextReloadMs(now: Calendar, hour: Int = RELOAD_HOUR): Long }` — `java.util.Calendar` (não `java.time`: `minSdk 21` não tem `java.time` sem desugaring).

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/android-tv/app/src/test/java/com/smarttvads/signage/WatchdogReloadTest.kt`:

```kotlin
package com.smarttvads.signage

import java.util.Calendar
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Test

class WatchdogReloadTest {
    private val hora = 60 * 60 * 1000L

    private fun em(h: Int, m: Int): Calendar =
        Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo")).apply {
            set(2026, Calendar.SEPTEMBER, 19, h, m, 0)
            set(Calendar.MILLISECOND, 0)
        }

    @Test
    fun `antes das 4h espera ate as 4h do mesmo dia`() {
        assertEquals(1 * hora, WatchdogReload.delayUntilNextReloadMs(em(3, 0)))
    }

    @Test
    fun `exatamente as 4h espera ate as 4h do dia seguinte`() {
        assertEquals(24 * hora, WatchdogReload.delayUntilNextReloadMs(em(4, 0)))
    }

    @Test
    fun `depois das 4h espera ate as 4h do dia seguinte`() {
        assertEquals(4 * hora + 30 * 60 * 1000L, WatchdogReload.delayUntilNextReloadMs(em(23, 30)))
    }

    @Test
    fun `nao altera o calendario recebido`() {
        val agora = em(10, 0)
        WatchdogReload.delayUntilNextReloadMs(agora)
        assertEquals(10, agora.get(Calendar.HOUR_OF_DAY))
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*WatchdogReloadTest*'`
Expected: FAIL — `Unresolved reference: WatchdogReload`.

- [ ] **Step 3: Implementar**

`artifacts/android-tv/app/src/main/java/com/smarttvads/signage/WatchdogReload.kt`:

```kotlin
package com.smarttvads.signage

import java.util.Calendar

/**
 * Hora do reload preventivo diário. WebView ligada dias a fio em box barata
 * vaza memória; recarregar de madrugada, com a loja fechada, zera isso.
 */
object WatchdogReload {
    const val RELOAD_HOUR = 4

    /** Milissegundos de `now` até o próximo `hour`:00 (sempre no futuro). */
    fun delayUntilNextReloadMs(now: Calendar, hour: Int = RELOAD_HOUR): Long {
        val next = now.clone() as Calendar
        next.set(Calendar.HOUR_OF_DAY, hour)
        next.set(Calendar.MINUTE, 0)
        next.set(Calendar.SECOND, 0)
        next.set(Calendar.MILLISECOND, 0)
        if (!next.after(now)) next.add(Calendar.DAY_OF_MONTH, 1)
        return next.timeInMillis - now.timeInMillis
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*WatchdogReloadTest*'`
Expected: 4 testes PASS.

- [ ] **Step 5: Commit**

```bash
cd artifacts/android-tv
git add app/src/main/java/com/smarttvads/signage/WatchdogReload.kt app/src/test/java/com/smarttvads/signage/WatchdogReloadTest.kt
git commit -m "feat(android-tv): cálculo do reload preventivo das 4h

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `TvWebViewConfig` e `TvWebViewClient`

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/TvWebViewConfig.kt`
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/TvWebViewClient.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/TvWebViewConfigTest.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/TvWebViewClientTest.kt`

**Interfaces:**
- Consumes: `ConnectivityGuard.isOfflineError(isMainFrame: Boolean, httpStatus: Int?)` (Task 2); `BuildConfig.VERSION_NAME` (Task 1).
- Produces:
  - `object TvWebViewConfig { const val UA_MARKER = "SignageApp"; fun userAgent(base: String, versionName: String): String; fun apply(webView: WebView, versionName: String = BuildConfig.VERSION_NAME) }`
  - `class TvWebViewClient(listener: TvWebViewClient.Listener) : WebViewClient` com `interface Listener { fun onMainFrameFailed(); fun onPageLoaded(); fun onRendererGone() }` e `internal fun onLoadResult(isMainFrame: Boolean, httpStatus: Int?)`.
  - Garantia: `onMainFrameFailed` no máximo uma vez por carga; `onPageLoaded` só quando a carga terminou sem falha da página principal.

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/android-tv/app/src/test/java/com/smarttvads/signage/TvWebViewConfigTest.kt`:

```kotlin
package com.smarttvads.signage

import android.webkit.WebSettings
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TvWebViewConfigTest {

    @Test
    fun `user agent ganha o marcador do app com a versao`() {
        assertEquals(
            "Mozilla/5.0 Chrome/74 SignageApp/1.0.0",
            TvWebViewConfig.userAgent("Mozilla/5.0 Chrome/74", "1.0.0"),
        )
    }

    @Test
    fun `configura a WebView para a TV`() {
        val webView = WebView(ApplicationProvider.getApplicationContext())
        TvWebViewConfig.apply(webView, versionName = "1.0.0")
        val s = webView.settings
        assertTrue(s.javaScriptEnabled)
        assertTrue(s.domStorageEnabled)
        assertFalse(s.mediaPlaybackRequiresUserGesture)
        assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, s.mixedContentMode)
        assertTrue(s.userAgentString.endsWith(" SignageApp/1.0.0"))
    }
}
```

`artifacts/android-tv/app/src/test/java/com/smarttvads/signage/TvWebViewClientTest.kt`:

```kotlin
package com.smarttvads.signage

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TvWebViewClientTest {
    private class Eventos : TvWebViewClient.Listener {
        var falhas = 0
        var cargas = 0
        var rendererMorto = 0
        override fun onMainFrameFailed() { falhas++ }
        override fun onPageLoaded() { cargas++ }
        override fun onRendererGone() { rendererMorto++ }
    }

    private fun pedido(principal: Boolean) = object : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse("https://smart-tv-ads.vercel.app/tv")
        override fun isForMainFrame() = principal
        override fun isRedirect() = false
        override fun hasGesture() = false
        override fun getMethod() = "GET"
        override fun getRequestHeaders(): Map<String, String> = emptyMap()
    }

    private fun resposta(status: Int) =
        WebResourceResponse("text/html", "utf-8", status, "Erro", emptyMap(), null)

    private lateinit var eventos: Eventos
    private lateinit var client: TvWebViewClient
    private lateinit var webView: WebView

    @Before
    fun prepara() {
        eventos = Eventos()
        client = TvWebViewClient(eventos)
        webView = WebView(ApplicationProvider.getApplicationContext())
    }

    @Test
    fun `carga ok avisa pagina carregada`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(1, eventos.cargas)
        assertEquals(0, eventos.falhas)
    }

    @Test
    fun `HTTP 503 na pagina principal avisa falha uma vez por carga`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onReceivedHttpError(webView, pedido(principal = true), resposta(503))
        client.onReceivedHttpError(webView, pedido(principal = true), resposta(503))
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(1, eventos.falhas)
        assertEquals(0, eventos.cargas)
    }

    @Test
    fun `erro de rede na pagina principal avisa falha`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onLoadResult(isMainFrame = true, httpStatus = null)
        assertEquals(1, eventos.falhas)
    }

    @Test
    fun `404 de sub-recurso nao e falha`() {
        // Ex.: /api/display/<key>/slides de TV sem vínculo — o tv.html mostra o QR.
        client.onPageStarted(webView, "https://x/tv", null)
        client.onReceivedHttpError(webView, pedido(principal = false), resposta(404))
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(0, eventos.falhas)
        assertEquals(1, eventos.cargas)
    }

    @Test
    fun `nova carga depois de falha pode dar certo`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onLoadResult(isMainFrame = true, httpStatus = null)
        client.onPageFinished(webView, "https://x/tv")
        client.onPageStarted(webView, "https://x/tv", null)
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(1, eventos.falhas)
        assertEquals(1, eventos.cargas)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*TvWebView*'`
Expected: FAIL — `Unresolved reference: TvWebViewConfig` / `TvWebViewClient`.

- [ ] **Step 3: Implementar**

`artifacts/android-tv/app/src/main/java/com/smarttvads/signage/TvWebViewConfig.kt`:

```kotlin
package com.smarttvads.signage

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.WebSettings
import android.webkit.WebView

/** Configuração da WebView que roda o tv.html. */
object TvWebViewConfig {
    /** O tv.html procura este marcador para saber que já está em tela cheia. */
    const val UA_MARKER = "SignageApp"

    fun userAgent(base: String, versionName: String): String = "$base $UA_MARKER/$versionName"

    @SuppressLint("SetJavaScriptEnabled")
    fun apply(webView: WebView, versionName: String = BuildConfig.VERSION_NAME) {
        webView.settings.apply {
            javaScriptEnabled = true
            // localStorage guarda a key da TV entre reinícios.
            domStorageEnabled = true
            // Vídeo e YouTube tocam sem ninguém apertar nada.
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = userAgent(userAgentString ?: "", versionName)
        }
        webView.setBackgroundColor(Color.BLACK)
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
    }
}
```

`artifacts/android-tv/app/src/main/java/com/smarttvads/signage/TvWebViewClient.kt`:

```kotlin
package com.smarttvads.signage

import android.graphics.Bitmap
import android.os.Build
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Traduz os callbacks da WebView em três eventos que a Activity entende.
 * A navegação fica dentro da WebView (comportamento padrão de WebViewClient).
 */
class TvWebViewClient(private val listener: Listener) : WebViewClient() {

    interface Listener {
        /** A página principal (`/tv`) não carregou: rede ou HTTP >= 400. */
        fun onMainFrameFailed()

        /** A página principal terminou de carregar sem falha. */
        fun onPageLoaded()

        /** O processo de renderização morreu; a WebView não serve mais. */
        fun onRendererGone()
    }

    private var failed = false

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        failed = false
    }

    override fun onPageFinished(view: WebView, url: String?) {
        if (!failed) listener.onPageLoaded()
    }

    // API 23+.
    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        onLoadResult(request.isForMainFrame, httpStatus = null)
    }

    // API 21–22: só é chamado para a página principal.
    @Deprecated("Substituído pela versão com WebResourceRequest a partir da API 23")
    override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
        if (Build.VERSION.SDK_INT < 23) onLoadResult(isMainFrame = true, httpStatus = null)
    }

    override fun onReceivedHttpError(
        view: WebView,
        request: WebResourceRequest,
        errorResponse: WebResourceResponse,
    ) {
        onLoadResult(request.isForMainFrame, errorResponse.statusCode)
    }

    // API 26+. Devolver true evita que o app inteiro caia junto.
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        listener.onRendererGone()
        return true
    }

    internal fun onLoadResult(isMainFrame: Boolean, httpStatus: Int?) {
        if (failed || !ConnectivityGuard.isOfflineError(isMainFrame, httpStatus)) return
        failed = true
        listener.onMainFrameFailed()
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*TvWebView*'`
Expected: 7 testes PASS.

Se `mediaPlaybackRequiresUserGesture` ou `mixedContentMode` falhar só no Robolectric (shadow sem suporte), NÃO remova a asserção às cegas: confira a versão do Robolectric (`RoboWebSettings`) e reporte; a configuração em si precisa ficar.

- [ ] **Step 5: Commit**

```bash
cd artifacts/android-tv
git add app/src/main/java/com/smarttvads/signage/TvWebViewConfig.kt app/src/main/java/com/smarttvads/signage/TvWebViewClient.kt app/src/test/java/com/smarttvads/signage/TvWebViewConfigTest.kt app/src/test/java/com/smarttvads/signage/TvWebViewClientTest.kt
git commit -m "feat(android-tv): configuração e client da WebView da TV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `MainActivity` — tela cheia, teclas, overlay, retry e watchdog

**Files:**
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt` (substitui o stub inteiro)
- Create: `artifacts/android-tv/app/src/main/res/layout/activity_main.xml`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/MainActivityTest.kt`

**Interfaces:**
- Consumes: `ConnectivityGuard` (Task 2), `WatchdogReload.delayUntilNextReloadMs(Calendar)` (Task 3), `TvWebViewConfig.apply(WebView)`, `TvWebViewClient(Listener)` (Task 4), `BuildConfig.TV_URL`, strings `offline_message`/`webview_missing`.
- Produces (usado pelos testes e pela Task 9):
  - `MainActivity : Activity, TvWebViewClient.Listener`
  - `internal var webView: WebView?` (leitura pública no módulo), `internal var loadAttempts: Int`
  - `MainActivity.webViewFactory: (Context) -> WebView` (companion, `internal var` — só testes trocam)
  - ids de layout `R.id.web_container`, `R.id.offline_overlay`, `R.id.webview_missing`

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/android-tv/app/src/test/java/com/smarttvads/signage/MainActivityTest.kt`:

```kotlin
package com.smarttvads.signage

import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import java.time.Duration
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class MainActivityTest {

    @After
    fun restauraFabrica() {
        MainActivity.webViewFactory = { WebView(it) }
    }

    private fun abrir(): MainActivity =
        Robolectric.buildActivity(MainActivity::class.java).setup().get()

    private fun passar(ms: Long) {
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms))
    }

    private fun MainActivity.overlay(): View = findViewById(R.id.offline_overlay)

    @Test
    fun `abre a tela da TV`() {
        val a = abrir()
        assertEquals(BuildConfig.TV_URL, shadowOf(a.webView!!).lastLoadedUrl)
    }

    @Test
    fun `tela sempre ligada e sem barras do sistema`() {
        val a = abrir()
        assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0)
        @Suppress("DEPRECATION")
        val ui = a.window.decorView.systemUiVisibility
        @Suppress("DEPRECATION")
        assertTrue(ui and View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY != 0)
        @Suppress("DEPRECATION")
        assertTrue(ui and View.SYSTEM_UI_FLAG_HIDE_NAVIGATION != 0)
    }

    @Test
    fun `voltar nao sai do painel`() {
        val a = abrir()
        val consumiu = a.onKeyDown(KeyEvent.KEYCODE_BACK, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK))
        assertTrue(consumiu)
        assertFalse(a.isFinishing)
    }

    @Test
    fun `falha na carga cobre a tela e tenta de novo com backoff`() {
        val a = abrir()
        a.onMainFrameFailed()
        assertEquals(View.VISIBLE, a.overlay().visibility)

        val antes = a.loadAttempts
        passar(4_999)
        assertEquals(antes, a.loadAttempts)
        passar(1)
        assertEquals(antes + 1, a.loadAttempts)

        a.onMainFrameFailed()
        passar(9_999)
        assertEquals(antes + 1, a.loadAttempts)
        passar(1)
        assertEquals(antes + 2, a.loadAttempts)
    }

    @Test
    fun `carga ok tira o aviso e reinicia o backoff`() {
        val a = abrir()
        a.onMainFrameFailed()
        passar(5_000)
        a.onPageLoaded()
        assertEquals(View.GONE, a.overlay().visibility)

        val antes = a.loadAttempts
        a.onMainFrameFailed()
        passar(5_000)
        assertEquals(antes + 1, a.loadAttempts)
    }

    @Test
    fun `renderer morto recria a WebView e recarrega`() {
        val a = abrir()
        val velha = a.webView
        a.onRendererGone()
        passar(0)
        assertNotNull(a.webView)
        assertNotSame(velha, a.webView)
        assertEquals(BuildConfig.TV_URL, shadowOf(a.webView!!).lastLoadedUrl)
    }

    @Test
    fun `sem WebView no sistema mostra aviso em vez de fechar`() {
        MainActivity.webViewFactory = { throw RuntimeException("MissingWebViewPackageException") }
        val a = abrir()
        assertEquals(View.VISIBLE, a.findViewById<View>(R.id.webview_missing).visibility)
        assertNull(a.webView)
        assertFalse(a.isFinishing)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*MainActivityTest*'`
Expected: FAIL — `Unresolved reference: webView` / `webViewFactory` / `R.id.offline_overlay`.

- [ ] **Step 3: Layout**

`artifacts/android-tv/app/src/main/res/layout/activity_main.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@android:color/black">

    <!-- A WebView entra aqui por código: dá para recriá-la sem refazer a tela. -->
    <FrameLayout
        android:id="@+id/web_container"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <!-- Cobre a página de erro do Chromium enquanto a carga de /tv falha. -->
    <TextView
        android:id="@+id/offline_overlay"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@android:color/black"
        android:gravity="center"
        android:text="@string/offline_message"
        android:textColor="@android:color/white"
        android:textSize="28sp"
        android:visibility="gone" />

    <TextView
        android:id="@+id/webview_missing"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@android:color/black"
        android:gravity="center"
        android:padding="48dp"
        android:text="@string/webview_missing"
        android:textColor="@android:color/white"
        android:textSize="28sp"
        android:visibility="gone" />
</FrameLayout>
```

- [ ] **Step 4: Implementar a Activity**

`artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt` (conteúdo completo):

```kotlin
package com.smarttvads.signage

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import java.util.Calendar

/**
 * Casca da TV: tela cheia nativa com a WebView em `/tv`. Quem decide entre a
 * tela de vínculo (QR) e o painel é o tv.html; aqui só cuidamos de manter a
 * página no ar — sem rede no boot, renderer morto, vazamento de memória.
 */
class MainActivity : Activity(), TvWebViewClient.Listener {

    private val handler = Handler(Looper.getMainLooper())
    private val guard = ConnectivityGuard()
    private lateinit var container: FrameLayout
    private lateinit var offlineOverlay: View
    private lateinit var webViewMissing: View

    internal var webView: WebView? = null
        private set

    /** Quantas vezes `/tv` foi pedido. Existe para os testes medirem o retry. */
    internal var loadAttempts = 0
        private set

    private val retry = Runnable { loadTv() }
    private val dailyReload = Runnable {
        loadTv()
        scheduleDailyReload()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        container = findViewById(R.id.web_container)
        offlineOverlay = findViewById(R.id.offline_overlay)
        webViewMissing = findViewById(R.id.webview_missing)
        hideSystemBars()

        if (createWebView()) {
            loadTv()
            scheduleDailyReload()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Diálogo do sistema ou toast podem trazer as barras de volta.
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        destroyWebView()
        super.onDestroy()
    }

    // Voltar não sai do painel nem navega o histórico da WebView.
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean =
        if (keyCode == KeyEvent.KEYCODE_BACK) true else super.onKeyDown(keyCode, event)

    @Deprecated("Voltar não sai do painel")
    override fun onBackPressed() {
        // Intencionalmente vazio.
    }

    override fun onMainFrameFailed() {
        offlineOverlay.visibility = View.VISIBLE
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, guard.nextDelayMs())
    }

    override fun onPageLoaded() {
        offlineOverlay.visibility = View.GONE
        guard.reset()
    }

    override fun onRendererGone() {
        // Fora do callback da WebView que está morrendo.
        handler.post {
            destroyWebView()
            if (createWebView()) loadTv()
        }
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    /** Sem WebView no sistema, mostra o aviso em vez de derrubar o app. */
    private fun createWebView(): Boolean {
        val view = try {
            webViewFactory(this)
        } catch (e: Throwable) {
            webViewMissing.visibility = View.VISIBLE
            return false
        }
        TvWebViewConfig.apply(view)
        view.webViewClient = TvWebViewClient(this)
        container.addView(
            view,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        view.requestFocus()
        webView = view
        return true
    }

    private fun destroyWebView() {
        webView?.let {
            container.removeView(it)
            it.destroy()
        }
        webView = null
    }

    private fun loadTv() {
        handler.removeCallbacks(retry)
        loadAttempts++
        webView?.loadUrl(BuildConfig.TV_URL)
    }

    private fun scheduleDailyReload() {
        handler.removeCallbacks(dailyReload)
        handler.postDelayed(dailyReload, WatchdogReload.delayUntilNextReloadMs(Calendar.getInstance()))
    }

    companion object {
        /** Os testes trocam para simular aparelho sem WebView. */
        internal var webViewFactory: (Context) -> WebView = { WebView(it) }
    }
}
```

- [ ] **Step 5: Rodar e ver passar (suíte inteira)**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest`
Expected: todos PASS (Manifest 5, ConnectivityGuard 6, WatchdogReload 4, TvWebView 7, MainActivity 7).

- [ ] **Step 6: Commit**

```bash
cd artifacts/android-tv
git add app/src/main/java/com/smarttvads/signage/MainActivity.kt app/src/main/res/layout/activity_main.xml app/src/test/java/com/smarttvads/signage/MainActivityTest.kt
git commit -m "feat(android-tv): activity em tela cheia com retry e watchdog da WebView

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `BootReceiver`

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/BootReceiver.kt`
- Modify: `artifacts/android-tv/app/src/main/AndroidManifest.xml` (receiver dentro de `<application>`)
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/BootReceiverTest.kt`

**Interfaces:**
- Consumes: `MainActivity` (Task 5).
- Produces: `class BootReceiver : BroadcastReceiver`.

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/android-tv/app/src/test/java/com/smarttvads/signage/BootReceiverTest.kt`:

```kotlin
package com.smarttvads.signage

import android.app.Application
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class BootReceiverTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    @Test
    fun `boot abre a tela da TV`() {
        BootReceiver().onReceive(app, Intent(Intent.ACTION_BOOT_COMPLETED))
        val aberta = shadowOf(app).nextStartedActivity
        assertEquals(MainActivity::class.java.name, aberta.component?.className)
        assertTrue(aberta.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
    }

    @Test
    fun `outra acao nao abre nada`() {
        BootReceiver().onReceive(app, Intent(Intent.ACTION_SCREEN_ON))
        assertNull(shadowOf(app).nextStartedActivity)
    }

    @Test
    fun `receiver registrado para o boot no manifest`() {
        val intent = Intent(Intent.ACTION_BOOT_COMPLETED).setPackage(app.packageName)
        val receivers = app.packageManager.queryBroadcastReceivers(intent, 0)
        assertTrue(receivers.any { it.activityInfo.name == BootReceiver::class.java.name })
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '*BootReceiverTest*'`
Expected: FAIL — `Unresolved reference: BootReceiver`.

- [ ] **Step 3: Implementar e registrar**

`artifacts/android-tv/app/src/main/java/com/smarttvads/signage/BootReceiver.kt`:

```kotlin
package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Abre a TV quando o aparelho liga. Até o Android 9 isso basta; do 10 em
 * diante o sistema bloqueia abrir Activity daqui e quem garante é o app ser a
 * tela inicial (ver README).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
```

Em `AndroidManifest.xml`, logo depois do `</activity>` e antes de `</application>`:

```xml
        <receiver
            android:name=".BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest`
Expected: todos PASS (inclui os 3 novos).

- [ ] **Step 5: Commit**

```bash
cd artifacts/android-tv
git add app/src/main/java/com/smarttvads/signage/BootReceiver.kt app/src/main/AndroidManifest.xml app/src/test/java/com/smarttvads/signage/BootReceiverTest.kt
git commit -m "feat(android-tv): abre a TV no boot

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: APK release assinado, nome do arquivo e README

**Files:**
- Modify: `artifacts/android-tv/app/build.gradle.kts`
- Create: `artifacts/android-tv/README.md`

**Interfaces:**
- Consumes: app completo das Tasks 1–6.
- Produces: `./gradlew assembleRelease` → `app/build/outputs/apk/release/signage-tv-1.0.0.apk`; sem keystore, falha com mensagem citando `SIGNAGE_KEYSTORE`.

- [ ] **Step 1: Confirmar o comportamento atual (falha esperada da verificação)**

Run: `cd artifacts/android-tv && ./gradlew :app:assembleRelease && ls app/build/outputs/apk/release/`
Expected: gera `app-release-unsigned.apk` — APK sem assinatura e com nome genérico. Este é o comportamento a corrigir.

- [ ] **Step 2: Assinatura, trava sem keystore e nome do APK**

Em `artifacts/android-tv/app/build.gradle.kts`:

No topo, antes de `plugins { }`:

```kotlin
import com.android.build.gradle.internal.api.BaseVariantOutputImpl
```

Depois de `val tvUrlOverride ...`:

```kotlin
// Keystore de release fora do git (ver README). Perder o arquivo impede
// atualizar o APK por cima nas TVs já instaladas.
val releaseKeystore: String? = System.getenv("SIGNAGE_KEYSTORE")
```

Dentro de `android { }`, antes de `buildTypes { }`:

```kotlin
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
```

No bloco `release { }` de `buildTypes`, acrescentar:

```kotlin
            signingConfig = signingConfigs.findByName("release")
```

Dentro de `android { }`, depois de `testOptions { }`:

```kotlin
    applicationVariants.all {
        val suffix = if (buildType.name == "debug") "-debug" else ""
        outputs.all {
            (this as BaseVariantOutputImpl).outputFileName = "signage-tv-${versionName}$suffix.apk"
        }
    }
```

No fim do arquivo, depois de `dependencies { }`:

```kotlin
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
```

- [ ] **Step 3: Verificar sem keystore — tem que falhar com a mensagem**

Run: `cd artifacts/android-tv && ./gradlew clean :app:assembleRelease 2>&1 | grep -E "Keystore de release ausente|BUILD"`
Expected: `Keystore de release ausente: defina SIGNAGE_KEYSTORE…` e `BUILD FAILED`.

- [ ] **Step 4: Verificar com keystore de teste — APK assinado e nomeado**

```bash
keytool -genkeypair -keystore "$SCRATCH/teste.jks" -alias signage -keyalg RSA -keysize 2048 \
  -validity 10000 -storepass teste123 -keypass teste123 -dname "CN=Teste" -noprompt
cd artifacts/android-tv
SIGNAGE_KEYSTORE="$SCRATCH/teste.jks" SIGNAGE_KEYSTORE_PASS=teste123 SIGNAGE_KEY_ALIAS=signage SIGNAGE_KEY_PASS=teste123 \
  ./gradlew :app:assembleRelease
BT="$ANDROID_HOME/build-tools/35.0.0"
"$BT/apksigner" verify app/build/outputs/apk/release/signage-tv-1.0.0.apk && echo ASSINADO
"$BT/aapt" dump badging app/build/outputs/apk/release/signage-tv-1.0.0.apk | grep -E "^package|sdkVersion|targetSdkVersion|leanback-launchable|launchable-activity|uses-permission"
```

Expected:
- `ASSINADO`
- `package: name='com.smarttvads.signage' versionCode='1' versionName='1.0.0'`
- `sdkVersion:'21'`, `targetSdkVersion:'34'`
- `leanback-launchable-activity: name='com.smarttvads.signage.MainActivity'` e `launchable-activity: name='com.smarttvads.signage.MainActivity'`
- exatamente as 4 permissões: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`

E o debug: `./gradlew :app:assembleDebug && ls app/build/outputs/apk/debug/` → `signage-tv-1.0.0-debug.apk`.

- [ ] **Step 5: README do módulo**

`artifacts/android-tv/README.md`:

````markdown
# Signage TV — app Android

APK para TV e TV box Android (5.0+, alvo principal Android 10). Abre sozinho
ao ligar, em tela cheia, e carrega `https://smart-tv-ads.vercel.app/tv`. Quem
decide o que aparece é o `artifacts/signage/public/tv.html`:

- TV ainda não vinculada → QR code de vínculo;
- TV vinculada → painel.

O app não tem lógica de pareamento nem de exibição. Mudou o `tv.html`, todas
as TVs pegam no próximo deploy — sem APK novo.

## Requisitos para buildar

- JDK 17
- Android SDK com `platforms;android-35` e `build-tools;35.0.0`
- `local.properties` com `sdk.dir=/caminho/do/Android/sdk` (não versionado)

## Build

```bash
cd artifacts/android-tv
./gradlew :app:testDebugUnitTest      # testes JVM
./gradlew :app:assembleDebug          # aponta para http://10.0.2.2:21153/tv (dev.sh + emulador)
./gradlew :app:assembleRelease        # aponta para produção; exige keystore
```

Outro servidor: `./gradlew :app:assembleRelease -PtvUrl=https://outro-dominio/tv`.

### Keystore de release

Gerar uma vez:

```bash
keytool -genkeypair -keystore signage-tv.jks -alias signage -keyalg RSA -keysize 2048 -validity 10000
```

**Guarde o arquivo e as senhas com backup.** Sem esse mesmo keystore o
Android recusa instalar uma versão nova por cima da instalada, e cada TV teria
que desinstalar o app — perdendo a key e exigindo novo vínculo.

Build assinado:

```bash
export SIGNAGE_KEYSTORE=/caminho/signage-tv.jks
export SIGNAGE_KEYSTORE_PASS=...
export SIGNAGE_KEY_ALIAS=signage
export SIGNAGE_KEY_PASS=...
./gradlew :app:assembleRelease
# -> app/build/outputs/apk/release/signage-tv-<versão>.apk
```

## Instalação na TV / TV box (técnico)

1. Copie `signage-tv-<versão>.apk` para um pendrive (ou baixe na box).
2. Na box, permita instalar apps de fontes desconhecidas (Configurações →
   Segurança; em Android 8+ a permissão é por app, ex.: o gerenciador de
   arquivos).
3. Abra o APK pelo gerenciador de arquivos e instale.
4. Abra **Signage TV**. Aparece o QR code.
5. Aperte **Home** no controle. Quando o Android perguntar qual tela inicial
   usar, escolha **Signage TV → Sempre**. É isso que faz o app abrir sozinho
   quando a box liga (Android 10+ não permite de outro jeito).
6. Leia o QR com o celular do administrador e vincule a TV a uma empresa. Em
   alguns segundos a TV começa a exibir.

Se a box não perguntar a tela inicial: Configurações → Apps → Apps padrão →
Tela inicial → Signage TV.

**Para mexer na box depois:** Configurações do sistema (a tecla Voltar não
sai do painel). Para devolver o launcher original, troque a tela inicial
padrão.

## Atualizar o app

Instale o APK novo por cima (mesmo keystore). Os dados ficam — a TV continua
vinculada. Conteúdo e comportamento de exibição chegam pelo deploy web.

## Comportamento

- Sem rede ao abrir: tela "Sem conexão. Tentando novamente…", nova tentativa
  em 5 s, 10 s, 20 s, 40 s e depois a cada 60 s.
- Rede cai com o painel no ar: o painel segue com a última lista.
- Motor da WebView trava: o app recria a WebView sozinho.
- Todo dia às 04:00 a página é recarregada.
- Aparelho sem Android System WebView: aviso na tela pedindo para atualizar.
- TV apagada no painel admin: volta ao QR com a mesma key.
- "Limpar dados" do app: key nova, QR novo — precisa vincular de novo.

## Checklist de teste manual

- [ ] Emulador Android TV e, se houver, uma TV box real com Android 10.
- [ ] Abrir o app → QR aparece.
- [ ] Vincular pelo celular → painel aparece em até ~10 s.
- [ ] Reiniciar o aparelho → abre sozinho e exibe.
- [ ] Sem rede no boot → aviso → volta sozinho ao reconectar.
- [ ] Peça com YouTube toca com som sem clique.
- [ ] Apagar a TV no painel → volta ao QR.
- [ ] Voltar no controle não sai do painel; Home volta ao painel.
````

- [ ] **Step 6: Commit**

```bash
cd artifacts/android-tv
git add app/build.gradle.kts README.md
git commit -m "build(android-tv): APK release assinado e README de instalação

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: `tv.html` sem gatilho de tela cheia dentro do app

**Files:**
- Modify: `artifacts/signage/public/tv.html` (bloco `// ─── Tela cheia ───`, linhas ~815–856)
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts` (dentro do `describe("tv.html: tela cheia em TV box", ...)`)

**Interfaces:**
- Consumes: marcador `SignageApp/` no user agent (Task 4, `TvWebViewConfig.UA_MARKER`).
- Produces: com `SignageApp/` no UA, `#fs-hint` fica `display: none` e nenhum listener `keydown`/`click` de tela cheia é registrado.

- [ ] **Step 1: Escrever os testes que falham**

Em `artifacts/signage/src/__tests__/tv-html.test.ts`, dentro do `describe("tv.html: tela cheia em TV box", () => { ... })`, depois do teste `"sem suporte a tela cheia não mostra aviso"`, acrescentar:

```ts
  describe("dentro do app Android", () => {
    let adicionar: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      Object.defineProperty(window.navigator, "userAgent", {
        configurable: true,
        get: () =>
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/74.0 Safari/537.36 SignageApp/1.0.0",
      });
      adicionar = vi.spyOn(document, "addEventListener");
    });

    afterEach(() => {
      adicionar.mockRestore();
      delete (window.navigator as { userAgent?: unknown }).userAgent;
    });

    it("não mostra o aviso de tela cheia", () => {
      carregarTv();
      expect(aviso().style.display).toBe("none");
    });

    // Espia o registro em vez de disparar tecla: listeners de testes
    // anteriores continuam no `document` e pediriam a tela cheia.
    it("não registra o gatilho de tela cheia", () => {
      carregarTv();
      const tipos = adicionar.mock.calls.map((c) => c[0]);
      expect(tipos).not.toContain("keydown");
      expect(tipos).not.toContain("click");
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/signage && pnpm vitest run src/__tests__/tv-html.test.ts`
Expected: os 2 novos FAIL (aviso `"block"`; `keydown` registrado); os demais PASS.

- [ ] **Step 3: Implementar (ES5)**

Em `artifacts/signage/public/tv.html`, substituir este trecho:

```js
      document.addEventListener('keydown', enterFullscreen, false);
      document.addEventListener('click', enterFullscreen, false);
      var fsEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
      for (var fi = 0; fi < fsEvents.length; fi++) {
        document.addEventListener(fsEvents[fi], updateFsHint, false);
      }
      updateFsHint();
```

por:

```js
      // Dentro do app Android (artifacts/android-tv) a tela já é cheia: sem
      // aviso e sem gatilho. O app marca o user agent com "SignageApp/<versão>".
      var inAndroidApp = /SignageApp\//.test(navigator.userAgent || '');
      if (inAndroidApp) {
        fsHint.style.display = 'none';
      } else {
        document.addEventListener('keydown', enterFullscreen, false);
        document.addEventListener('click', enterFullscreen, false);
        var fsEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
        for (var fi = 0; fi < fsEvents.length; fi++) {
          document.addEventListener(fsEvents[fi], updateFsHint, false);
        }
        updateFsHint();
      }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd artifacts/signage && pnpm vitest run src/__tests__/tv-html.test.ts`
Expected: todos PASS, incluindo os 4 testes de tela cheia já existentes (UA normal inalterado).

Conferir ES5: `grep -nE "\b(let|const)\b|=>|\`" artifacts/signage/public/tv.html` não deve mostrar nada no trecho alterado.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): sem gatilho de tela cheia dentro do app Android

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Teste instrumentado no emulador e verificação ponta a ponta

**Files:**
- Create: `artifacts/android-tv/app/src/androidTest/java/com/smarttvads/signage/TvScreenTest.kt`

**Interfaces:**
- Consumes: `MainActivity.webView` (Task 5, `internal`, visível no mesmo módulo), `tv.html` com a Task 8 aplicada, ids `#pair-screen`, `#pair-qr`, `#fs-hint`, chave `localStorage['signage.deviceKey']`.

- [ ] **Step 1: Preparar emulador Android TV API 31 (ARM64)**

```bash
SDK="$HOME/Library/Android/sdk"
"$SDK/cmdline-tools/latest/bin/sdkmanager" "system-images;android-31;android-tv;arm64-v8a"
echo no | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd -n SignageTV_API31 \
  -k "system-images;android-31;android-tv;arm64-v8a" -d tv_1080p
```

Expected: AVD `SignageTV_API31` criado (`"$SDK/emulator/emulator" -list-avds` lista).

- [ ] **Step 2: Subir servidor local e emulador**

Em terminais/background separados, na raiz do repo:

```bash
./dev.sh     # Postgres + API :8080 + Vite :21153
```

```bash
"$HOME/Library/Android/sdk/emulator/emulator" -avd SignageTV_API31 -no-snapshot-save -no-audio
```

Esperar o boot:

```bash
$ADB wait-for-device
until [ "$($ADB shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:21153/tv   # 200
```

- [ ] **Step 3: Escrever o teste instrumentado**

`artifacts/android-tv/app/src/androidTest/java/com/smarttvads/signage/TvScreenTest.kt` (nomes camelCase: DEX antigo não aceita espaço em nome de método):

```kotlin
package com.smarttvads.signage

import android.os.SystemClock
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Roda contra o dev.sh (Vite em :21153 visto como 10.0.2.2 pelo emulador).
 * O app é desinstalado ao fim de `connectedDebugAndroidTest`, então cada
 * execução começa sem key e sem device.
 */
@RunWith(AndroidJUnit4::class)
class TvScreenTest {

    @get:Rule
    val rule = ActivityScenarioRule(MainActivity::class.java)

    private fun js(script: String): String {
        val latch = CountDownLatch(1)
        var result = ""
        rule.scenario.onActivity { activity ->
            activity.webView!!.evaluateJavascript(script) {
                result = it
                latch.countDown()
            }
        }
        assertTrue("JS sem resposta: $script", latch.await(5, TimeUnit.SECONDS))
        return result
    }

    private fun waitFor(script: String, timeoutMs: Long = 20_000) {
        val end = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < end) {
            if (js(script) == "true") return
            Thread.sleep(250)
        }
        fail("Tempo esgotado esperando: $script")
    }

    private val pareando = "document.getElementById('pair-screen').className === 'visible'"

    @Test
    fun semVinculoMostraQrDePareamento() {
        waitFor(pareando)
        assertTrue(js("document.getElementById('pair-qr').src").contains("/api/qr/pair/"))
    }

    @Test
    fun keyPersisteAoRecriarAActivity() {
        waitFor(pareando)
        val antes = js("localStorage.getItem('signage.deviceKey')")
        assertTrue("key inválida: $antes", Regex("\"[0-9A-F]{16}\"").matches(antes))

        rule.scenario.recreate()
        waitFor(pareando)
        assertEquals(antes, js("localStorage.getItem('signage.deviceKey')"))
    }

    @Test
    fun dentroDoAppSemAvisoDeTelaCheia() {
        waitFor(pareando)
        assertEquals("true", js("navigator.userAgent.indexOf('SignageApp/') >= 0"))
        assertEquals("\"none\"", js("document.getElementById('fs-hint').style.display"))
    }
}
```

- [ ] **Step 4: Rodar no emulador**

Run: `cd artifacts/android-tv && ./gradlew :app:connectedDebugAndroidTest`
Expected: 3 testes PASS. (Se `semVinculoMostraQrDePareamento` estourar o tempo, conferir o Step 2: `curl` do host em `/tv` e `/api/display/XXXX/slides` → 404.)

- [ ] **Step 5: Ponta a ponta manual no emulador**

```bash
cd artifacts/android-tv
./gradlew :app:installDebug
$ADB shell cmd package set-home-activity com.smarttvads.signage/.MainActivity
$ADB shell am start -n com.smarttvads.signage/.MainActivity
sleep 8; $ADB exec-out screencap -p > "$SCRATCH/1-qr.png"
```

1. Ver `1-qr.png`: QR + key em blocos, sem aviso "Pressione OK".
2. Pegar a key: `$ADB exec-out screencap` já mostra; ou abrir no host `http://localhost:21153/parear/<KEY>`, logar como admin, escolher empresa, nome "Emulador", **Vincular TV**.
3. `sleep 10; $ADB exec-out screencap -p > "$SCRATCH/2-painel.png"` → painel (ou tela vazia de "sem peças" se a empresa não tiver campanha — o QR sumiu).
4. Reboot: `$ADB reboot && $ADB wait-for-device && until [ "$($ADB shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done; sleep 10; $ADB shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity"` → `com.smarttvads.signage/.MainActivity`; screenshot mostra o painel direto.
5. Sem rede: `$ADB shell cmd connectivity airplane-mode enable; $ADB shell am force-stop com.smarttvads.signage; $ADB shell am start -n com.smarttvads.signage/.MainActivity; sleep 5; $ADB exec-out screencap -p > "$SCRATCH/3-offline.png"` → "Sem conexão. Tentando novamente…". Depois `$ADB shell cmd connectivity airplane-mode disable; sleep 70; $ADB exec-out screencap -p > "$SCRATCH/4-volta.png"` → painel.
6. Voltar: `$ADB shell input keyevent KEYCODE_BACK; $ADB shell input keyevent KEYCODE_HOME; sleep 2; $ADB shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity"` → ainda `MainActivity`.
7. Apagar o device "Emulador" no painel admin → em até 60 s `screencap` mostra o QR com a mesma key.
8. YouTube: vincular a uma empresa com peça de YouTube e confirmar que toca (no emulador com `-no-audio`, conferir só a imagem; som na box real).

Registrar cada resultado (ok/falhou + screenshot) no relatório da tarefa. Falha em qualquer item = parar e reportar, não ajustar o teste.

- [ ] **Step 6: Commit**

```bash
cd artifacts/android-tv
git add app/src/androidTest/java/com/smarttvads/signage/TvScreenTest.kt
git commit -m "test(android-tv): QR, key persistente e UA no emulador de TV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Pendente para o usuário (box real Android 10)**

Não automatizável aqui. Entregar ao usuário o checklist do README para rodar numa TV box real com Android 10: instalar APK release, escolher tela inicial, reiniciar, YouTube com som.
