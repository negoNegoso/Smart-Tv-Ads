# Atualização automática do app Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app da TV verifica o `update.json` da última release, baixa e confere o APK novo, prepara a instalação e mostra um aviso; a tecla OK abre a confirmação do sistema.

**Architecture:** Unidades pequenas no pacote `com.smarttvads.signage`: `UpdateManifest`/`UpdatePolicy`/`Sha256` (puras), `UpdateDownloader` (HTTP síncrono), `UpdateInstaller` + `UpdateStatusReceiver` + `UpdateState` (sessão do `PackageInstaller` e o estado compartilhado), `UpdateController` (orquestra fora da main thread), integração na `MainActivity` (agenda, aviso, tecla OK) e `UpdatedReceiver` (reabre após atualizar). A pipeline passa a anexar `update.json` com o SHA-256 do APK.

**Tech Stack:** Kotlin 2.0.21, AGP 8.7.3, minSdk 21 / targetSdk 34, `HttpURLConnection`, `PackageInstaller`, `org.json`; testes JUnit 4 + Robolectric 4.14.1 (sdk=29) e `com.sun.net.httpserver.HttpServer` do JDK; GitHub Actions + `jq`.

**Spec:** `docs/superpowers/specs/2026-09-19-auto-update-android-design.md`

## Global Constraints

- Módulo `artifacts/android-tv/`, pacote `com.smarttvads.signage` (arquivos planos em `app/src/main/java/com/smarttvads/signage/`, como os existentes).
- Sem dependência de runtime nova (nada de OkHttp, WorkManager, AppCompat). Sem dependência de teste nova.
- Manifesto de atualização: `BuildConfig.UPDATE_BASE_URL + "update.json"`; APK: `BuildConfig.UPDATE_BASE_URL + manifest.apk`. Padrão `https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/`, sobrescrevível por `-PupdateBaseUrl=`.
- `update.json`: `{"versionName": String, "versionCode": Int, "apk": String, "sha256": String}`; `apk` casa `^[A-Za-z0-9._-]+\.apk$`; `sha256` casa `^[0-9a-f]{64}$`; `versionCode` > 0; `versionName` não vazio.
- Atualiza só se `versionCode` remoto > `BuildConfig.VERSION_CODE`.
- Checagem: 2 min após abrir (`UPDATE_FIRST_CHECK_MS = 120_000L`) e a cada 6 h (`UPDATE_INTERVAL_MS = 21_600_000L`).
- Timeouts HTTP: conexão 15 s, leitura 60 s.
- APKs em `cacheDir/updates/`; download em `<apk>.part` e renomeado após conferir o hash.
- Diálogo do sistema só abre ao apertar OK (`KEYCODE_DPAD_CENTER`, `KEYCODE_ENTER`, `KEYCODE_NUMPAD_ENTER`, no ACTION_UP) com atualização pronta; sem atualização pronta, OK segue para a WebView como hoje.
- Textos: `"Atualização %1$s pronta — aperte OK para instalar"`, `"Falha ao atualizar"` (some em 10 s = `UPDATE_FAILED_VISIBLE_MS = 10_000L`).
- Permissão nova única: `android.permission.REQUEST_INSTALL_PACKAGES`.
- Nenhum erro de atualização cobre o painel nem derruba o app.
- Português nos comentários (explicam o porquê) e nos textos; acentos UTF-8 reais, nunca `\uXXXX`.
- Commits: `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Branch `feat/auto-update-android`.
- `JAVA_HOME=/Users/yvillanova/Library/Java/JavaVirtualMachines/jbr-17.0.14/Contents/Home` antes de todo `./gradlew`, rodado de `artifacts/android-tv`.

**Decisão do plano (além da spec):** a spec põe a orquestração "na `MainActivity`". Para manter a Activity focada e testável, a sequência manifesto → política → download → instalador vai para `UpdateController` (fora da main thread, dependências injetáveis); a Activity só agenda, mostra o aviso e trata o OK. Cancelamento do diálogo chega como `STATUS_FAILURE_ABORTED`: a sessão morre, então a Activity pede uma nova checagem imediata, que reaproveita o APK já conferido e recria a sessão — o aviso volta, como a spec pede.

---

## File Structure

```
artifacts/android-tv/app/
├── build.gradle.kts                          # + BuildConfig.UPDATE_BASE_URL
└── src/
    ├── main/
    │   ├── AndroidManifest.xml               # + permissão, UpdateStatusReceiver, UpdatedReceiver
    │   ├── res/layout/activity_main.xml      # + update_banner
    │   ├── res/values/strings.xml            # + update_ready, update_failed
    │   └── java/com/smarttvads/signage/
    │       ├── UpdateManifest.kt             # parse/valida update.json
    │       ├── UpdatePolicy.kt               # remoto > instalado
    │       ├── Sha256.kt                     # hex do arquivo
    │       ├── UpdateDownloader.kt           # HTTP: manifesto + APK conferido
    │       ├── UpdateState.kt                # confirmação pronta + listener
    │       ├── UpdateStatusReceiver.kt       # status do PackageInstaller -> UpdateState
    │       ├── UpdateInstaller.kt            # sessão do PackageInstaller
    │       ├── UpdateController.kt           # orquestra (thread própria)
    │       ├── UpdatedReceiver.kt            # MY_PACKAGE_REPLACED -> reabre
    │       └── MainActivity.kt               # agenda, aviso, tecla OK
    └── test/java/com/smarttvads/signage/
        ├── UpdateManifestTest.kt
        ├── UpdatePolicyTest.kt
        ├── Sha256Test.kt
        ├── UpdateDownloaderTest.kt
        ├── UpdateStatusReceiverTest.kt
        ├── UpdateControllerTest.kt
        ├── UpdatedReceiverTest.kt
        ├── MainActivityUpdateTest.kt
        └── ManifestTest.kt                   # + asserts novos
.github/workflows/release.yml                 # + update.json e conferência
artifacts/android-tv/README.md                # instalação, comportamento, checklist
CLAUDE.md                                     # releases: update.json
```

---

### Task 1: `UpdateManifest`, `UpdatePolicy` e `Sha256`

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateManifest.kt`
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdatePolicy.kt`
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/Sha256.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdateManifestTest.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdatePolicyTest.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/Sha256Test.kt`

**Interfaces:**
- Produces:
  - `data class UpdateManifest(val versionName: String, val versionCode: Int, val apk: String, val sha256: String)` com `companion fun parse(json: String): UpdateManifest?`
  - `object UpdatePolicy { fun shouldUpdate(remoteCode: Int, installedCode: Int): Boolean }`
  - `object Sha256 { fun hex(file: java.io.File): String }` (hex minúsculo)

- [ ] **Step 1: Testes que falham**

`UpdateManifestTest.kt` (Robolectric: `org.json` do Android não roda na JVM pura):

```kotlin
package com.smarttvads.signage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UpdateManifestTest {
    private val sha = "a".repeat(64)

    private fun json(
        versionName: Any? = "1.2.0",
        versionCode: Any? = 1002000,
        apk: Any? = "signage-tv-1.2.0.apk",
        sha256: Any? = sha,
    ): String {
        val campos = listOfNotNull(
            versionName?.let { "\"versionName\": ${q(it)}" },
            versionCode?.let { "\"versionCode\": $it" },
            apk?.let { "\"apk\": ${q(it)}" },
            sha256?.let { "\"sha256\": ${q(it)}" },
        )
        return "{ ${campos.joinToString(", ")} }"
    }

    private fun q(v: Any) = "\"$v\""

    @Test
    fun `le o manifesto valido`() {
        assertEquals(
            UpdateManifest("1.2.0", 1002000, "signage-tv-1.2.0.apk", sha),
            UpdateManifest.parse(json()),
        )
    }

    @Test
    fun `campo faltando e invalido`() {
        assertNull(UpdateManifest.parse(json(versionName = null)))
        assertNull(UpdateManifest.parse(json(versionCode = null)))
        assertNull(UpdateManifest.parse(json(apk = null)))
        assertNull(UpdateManifest.parse(json(sha256 = null)))
    }

    @Test
    fun `versionCode zero ou negativo e invalido`() {
        assertNull(UpdateManifest.parse(json(versionCode = 0)))
        assertNull(UpdateManifest.parse(json(versionCode = -1)))
    }

    @Test
    fun `versionName vazio e invalido`() {
        assertNull(UpdateManifest.parse(json(versionName = " ")))
    }

    @Test
    fun `apk precisa ser nome de arquivo simples terminado em apk`() {
        assertNull(UpdateManifest.parse(json(apk = "../outro.apk")))
        assertNull(UpdateManifest.parse(json(apk = "pasta/app.apk")))
        assertNull(UpdateManifest.parse(json(apk = "signage-tv.zip")))
    }

    @Test
    fun `sha256 precisa ter 64 hex minusculos`() {
        assertNull(UpdateManifest.parse(json(sha256 = "abc")))
        assertNull(UpdateManifest.parse(json(sha256 = "A".repeat(64))))
        assertNull(UpdateManifest.parse(json(sha256 = "g".repeat(64))))
    }

    @Test
    fun `json quebrado e invalido`() {
        assertNull(UpdateManifest.parse("{ nao e json"))
        assertNull(UpdateManifest.parse(""))
    }
}
```

`UpdatePolicyTest.kt`:

```kotlin
package com.smarttvads.signage

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePolicyTest {
    @Test
    fun `atualiza so se a versao remota for maior`() {
        assertTrue(UpdatePolicy.shouldUpdate(remoteCode = 1002000, installedCode = 1000001))
        assertFalse(UpdatePolicy.shouldUpdate(remoteCode = 1000001, installedCode = 1000001))
        assertFalse(UpdatePolicy.shouldUpdate(remoteCode = 1000000, installedCode = 1000001))
    }
}
```

`Sha256Test.kt`:

```kotlin
package com.smarttvads.signage

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class Sha256Test {
    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `hex minusculo do conteudo do arquivo`() {
        val f: File = tmp.newFile("abc.bin").apply { writeText("abc") }
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Sha256.hex(f))
    }

    @Test
    fun `arquivo vazio`() {
        val f = tmp.newFile("vazio.bin")
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Sha256.hex(f))
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testDebugUnitTest --tests '*UpdateManifestTest*' --tests '*UpdatePolicyTest*' --tests '*Sha256Test*'`
Expected: FAIL — `Unresolved reference: UpdateManifest` / `UpdatePolicy` / `Sha256`.

- [ ] **Step 3: Implementar**

`UpdateManifest.kt`:

```kotlin
package com.smarttvads.signage

import org.json.JSONException
import org.json.JSONObject

/** Conteúdo do update.json que a pipeline anexa a cada release. */
data class UpdateManifest(
    val versionName: String,
    val versionCode: Int,
    val apk: String,
    val sha256: String,
) {
    companion object {
        // Só nome de arquivo: o APK é baixado da mesma pasta da release e
        // gravado no cache; um caminho aqui escaparia dos dois.
        private val APK_NAME = Regex("^[A-Za-z0-9._-]+\\.apk$")
        private val SHA256_HEX = Regex("^[0-9a-f]{64}$")

        /** JSON quebrado ou campo fora do formato → null: a checagem é ignorada. */
        fun parse(json: String): UpdateManifest? = try {
            val o = JSONObject(json)
            UpdateManifest(
                versionName = o.getString("versionName"),
                versionCode = o.getInt("versionCode"),
                apk = o.getString("apk"),
                sha256 = o.getString("sha256"),
            ).takeIf {
                it.versionName.isNotBlank() && it.versionCode > 0 &&
                    APK_NAME.matches(it.apk) && SHA256_HEX.matches(it.sha256)
            }
        } catch (e: JSONException) {
            null
        }
    }
}
```

`UpdatePolicy.kt`:

```kotlin
package com.smarttvads.signage

/** Só versão maior que a instalada; o Android recusaria instalar uma menor. */
object UpdatePolicy {
    fun shouldUpdate(remoteCode: Int, installedCode: Int): Boolean = remoteCode > installedCode
}
```

`Sha256.kt`:

```kotlin
package com.smarttvads.signage

import java.io.File
import java.security.MessageDigest

/** SHA-256 em hex minúsculo, o mesmo formato do `sha256sum` da pipeline. */
object Sha256 {
    fun hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: mesmo comando do Step 2.
Expected: 10 testes PASS (7 + 1 + 2).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/smarttvads/signage/UpdateManifest.kt app/src/main/java/com/smarttvads/signage/UpdatePolicy.kt app/src/main/java/com/smarttvads/signage/Sha256.kt app/src/test/java/com/smarttvads/signage/UpdateManifestTest.kt app/src/test/java/com/smarttvads/signage/UpdatePolicyTest.kt app/src/test/java/com/smarttvads/signage/Sha256Test.kt
git commit -m "feat(android-tv): manifesto, política e hash da atualização

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `UpdateDownloader` e `BuildConfig.UPDATE_BASE_URL`

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateDownloader.kt`
- Modify: `artifacts/android-tv/app/build.gradle.kts`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdateDownloaderTest.kt`
- Modify: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/ManifestTest.kt`

**Interfaces:**
- Consumes: `UpdateManifest.parse`, `Sha256.hex` (Task 1).
- Produces:
  - `class UpdateDownloader(baseUrl: String, dir: File) : UpdateController.Downloader` — **atenção:** `UpdateController.Downloader` só existe na Task 4. Nesta task a classe **não** implementa interface nenhuma; a Task 4 acrescenta `: UpdateController.Downloader` e `override`.
  - `fun fetchManifest(): UpdateManifest?`
  - `fun downloadApk(manifest: UpdateManifest): File?`
  - `BuildConfig.UPDATE_BASE_URL: String`

- [ ] **Step 1: Teste que falha**

`UpdateDownloaderTest.kt`:

```kotlin
package com.smarttvads.signage

import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import java.security.MessageDigest
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Servidor HTTP local imita o GitHub: /rel/<arquivo> redireciona (302) para
 * /real/<arquivo>, como `releases/latest/download/` faz.
 */
@RunWith(RobolectricTestRunner::class)
class UpdateDownloaderTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: HttpServer
    private val arquivos = mutableMapOf<String, ByteArray>()
    private val pedidos = mutableListOf<String>()
    private lateinit var dir: File
    private lateinit var downloader: UpdateDownloader

    private val apkBytes = "conteudo do apk".toByteArray()
    private val apkSha = MessageDigest.getInstance("SHA-256").digest(apkBytes)
        .joinToString("") { "%02x".format(it) }

    private fun manifesto(sha: String = apkSha) =
        """{"versionName":"1.2.0","versionCode":1002000,"apk":"signage-tv-1.2.0.apk","sha256":"$sha"}"""

    @Before
    fun sobe() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { ex ->
            val path = ex.requestURI.path
            pedidos += path
            when {
                path.startsWith("/rel/") -> {
                    ex.responseHeaders.add("Location", "/real/" + path.removePrefix("/rel/"))
                    ex.sendResponseHeaders(302, -1)
                }
                arquivos.containsKey(path.removePrefix("/real/")) -> {
                    val body = arquivos.getValue(path.removePrefix("/real/"))
                    ex.sendResponseHeaders(200, body.size.toLong())
                    ex.responseBody.use { it.write(body) }
                }
                else -> ex.sendResponseHeaders(404, -1)
            }
            ex.close()
        }
        server.start()
        dir = File(tmp.root, "updates")
        downloader = UpdateDownloader("http://127.0.0.1:${server.address.port}/rel/", dir)
    }

    @After
    fun desce() {
        server.stop(0)
    }

    @Test
    fun `le o manifesto seguindo o redirecionamento`() {
        arquivos["update.json"] = manifesto().toByteArray()
        assertEquals(1002000, downloader.fetchManifest()?.versionCode)
    }

    @Test
    fun `manifesto ausente ou invalido da null`() {
        assertNull(downloader.fetchManifest())
        arquivos["update.json"] = "{ quebrado".toByteArray()
        assertNull(downloader.fetchManifest())
    }

    @Test
    fun `baixa o apk conferido sem deixar parcial`() {
        arquivos["signage-tv-1.2.0.apk"] = apkBytes
        val apk = downloader.downloadApk(UpdateManifest.parse(manifesto())!!)
        assertNotNull(apk)
        assertArrayEquals(apkBytes, apk!!.readBytes())
        assertEquals(listOf("signage-tv-1.2.0.apk"), dir.list()!!.toList())
    }

    @Test
    fun `hash diferente apaga e da null`() {
        arquivos["signage-tv-1.2.0.apk"] = apkBytes
        val apk = downloader.downloadApk(UpdateManifest.parse(manifesto(sha = "b".repeat(64)))!!)
        assertNull(apk)
        assertTrue(dir.list().isNullOrEmpty())
    }

    @Test
    fun `reaproveita apk ja conferido sem baixar de novo`() {
        arquivos["signage-tv-1.2.0.apk"] = apkBytes
        val m = UpdateManifest.parse(manifesto())!!
        downloader.downloadApk(m)
        pedidos.clear()
        assertNotNull(downloader.downloadApk(m))
        assertTrue(pedidos.isEmpty())
    }

    @Test
    fun `apk inexistente no servidor da null`() {
        assertNull(downloader.downloadApk(UpdateManifest.parse(manifesto())!!))
        assertTrue(dir.list().isNullOrEmpty())
    }
}
```

Em `ManifestTest.kt`, acrescentar o teste (dentro da classe):

```kotlin
    @Test
    fun `atualizacao vem da ultima release do GitHub`() {
        assertEquals(
            "https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/",
            BuildConfig.UPDATE_BASE_URL,
        )
    }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testDebugUnitTest --tests '*UpdateDownloaderTest*' --tests '*ManifestTest*'`
Expected: FAIL de compilação — `Unresolved reference: UpdateDownloader` e `UPDATE_BASE_URL`.

- [ ] **Step 3: Implementar**

Em `app/build.gradle.kts`, logo depois da linha `val tvUrl: String = ...`:

```kotlin

// Onde o app procura versão nova: update.json e APK da última release. O
// GitHub redireciona `latest/download/` para a release mais recente.
val updateBaseUrl: String = providers.gradleProperty("updateBaseUrl").orNull
    ?: "https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/"
```

E dentro de `defaultConfig { }`, depois de `testInstrumentationRunner = ...`:

```kotlin
        buildConfigField("String", "UPDATE_BASE_URL", "\"$updateBaseUrl\"")
```

`UpdateDownloader.kt`:

```kotlin
package com.smarttvads.signage

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Baixa o update.json e o APK da release. Síncrono: quem chama roda fora da
 * main thread. Qualquer falha vira null — atualizar é sempre opcional e nunca
 * pode atrapalhar o painel.
 */
class UpdateDownloader(private val baseUrl: String, private val dir: File) {

    fun fetchManifest(): UpdateManifest? = try {
        UpdateManifest.parse(open(baseUrl + MANIFEST).use { it.readBytes().toString(Charsets.UTF_8) })
    } catch (e: IOException) {
        null
    }

    /** APK conferido pelo SHA-256, ou null. Reaproveita o já baixado se o hash bate. */
    fun downloadApk(manifest: UpdateManifest): File? {
        dir.mkdirs()
        val target = File(dir, manifest.apk)
        if (target.exists() && Sha256.hex(target) == manifest.sha256) return target
        target.delete()
        val part = File(dir, manifest.apk + ".part")
        return try {
            open(baseUrl + manifest.apk).use { input ->
                part.outputStream().use { out -> input.copyTo(out) }
            }
            if (Sha256.hex(part) == manifest.sha256 && part.renameTo(target)) {
                target
            } else {
                part.delete()
                null
            }
        } catch (e: IOException) {
            part.delete()
            null
        }
    }

    // Segue redirecionamento no mesmo protocolo (o GitHub manda de https para https).
    private fun open(url: String): InputStream {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.instanceFollowRedirects = true
        val code = conn.responseCode
        if (code != HttpURLConnection.HTTP_OK) {
            conn.disconnect()
            throw IOException("HTTP $code em $url")
        }
        return conn.inputStream
    }

    companion object {
        const val MANIFEST = "update.json"
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 60_000
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: mesmo comando do Step 2.
Expected: `UpdateDownloaderTest` 6 PASS; `ManifestTest` 6 PASS.

Se o `HttpServer` do JDK não subir dentro do Robolectric (classe `com.sun.*` bloqueada no sandbox), reporte BLOCKED com o erro exato — não troque por dependência nova.

- [ ] **Step 5: Commit**

```bash
git add app/build.gradle.kts app/src/main/java/com/smarttvads/signage/UpdateDownloader.kt app/src/test/java/com/smarttvads/signage/UpdateDownloaderTest.kt app/src/test/java/com/smarttvads/signage/ManifestTest.kt
git commit -m "feat(android-tv): download conferido do APK da última release

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `UpdateState`, `UpdateStatusReceiver`, `UpdateInstaller` e permissão

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateState.kt`
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateStatusReceiver.kt`
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateInstaller.kt`
- Modify: `artifacts/android-tv/app/src/main/AndroidManifest.xml`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdateStatusReceiverTest.kt`
- Modify: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/ManifestTest.kt`

**Interfaces:**
- Produces:
  - `object UpdateState { val pendingConfirmation: Intent?; val pendingVersion: String?; var listener: UpdateState.Listener?; fun ready(versionName: String, confirmation: Intent); fun failed(aborted: Boolean); fun clear() }`
  - `interface UpdateState.Listener { fun onUpdateReady(versionName: String); fun onUpdateFailed(aborted: Boolean) }`
  - `class UpdateStatusReceiver : BroadcastReceiver` com `companion const val EXTRA_VERSION = "com.smarttvads.signage.UPDATE_VERSION"`
  - `class UpdateInstaller(context: Context)` com `fun prepare(apk: File, versionName: String)` — a Task 4 acrescenta `: UpdateController.Installer` e `override`.

- [ ] **Step 1: Testes que falham**

`UpdateStatusReceiverTest.kt`:

```kotlin
package com.smarttvads.signage

import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UpdateStatusReceiverTest {
    private val eventos = mutableListOf<String>()

    private val ouvinte = object : UpdateState.Listener {
        override fun onUpdateReady(versionName: String) { eventos += "pronta $versionName" }
        override fun onUpdateFailed(aborted: Boolean) { eventos += "falhou aborted=$aborted" }
    }

    @After
    fun limpa() {
        UpdateState.clear()
        UpdateState.listener = null
    }

    private fun status(codigo: Int, confirmacao: Intent? = null) =
        Intent().putExtra(UpdateStatusReceiver.EXTRA_VERSION, "1.2.0")
            .putExtra(PackageInstaller.EXTRA_STATUS, codigo)
            .apply { confirmacao?.let { putExtra(Intent.EXTRA_INTENT, it) } }

    private fun recebe(intent: Intent) {
        UpdateState.listener = ouvinte
        UpdateStatusReceiver().onReceive(ApplicationProvider.getApplicationContext(), intent)
    }

    @Test
    fun `aguardando usuario guarda a confirmacao sem abrir`() {
        val confirmacao = Intent("android.content.pm.action.CONFIRM_INSTALL")
        recebe(status(PackageInstaller.STATUS_PENDING_USER_ACTION, confirmacao))
        assertEquals("1.2.0", UpdateState.pendingVersion)
        assertEquals(confirmacao.action, UpdateState.pendingConfirmation?.action)
        assertEquals(listOf("pronta 1.2.0"), eventos)
    }

    @Test
    fun `cancelado no dialogo avisa abortado`() {
        recebe(status(PackageInstaller.STATUS_FAILURE_ABORTED))
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(listOf("falhou aborted=true"), eventos)
    }

    @Test
    fun `falha de instalacao avisa falha`() {
        recebe(status(PackageInstaller.STATUS_FAILURE_INCOMPATIBLE))
        assertEquals(listOf("falhou aborted=false"), eventos)
    }

    @Test
    fun `sucesso limpa o estado`() {
        UpdateState.ready("1.2.0", Intent("x"))
        eventos.clear()
        recebe(status(PackageInstaller.STATUS_SUCCESS))
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(emptyList<String>(), eventos)
    }

    @Test
    fun `aguardando usuario sem intent de confirmacao conta como falha`() {
        recebe(status(PackageInstaller.STATUS_PENDING_USER_ACTION))
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(listOf("falhou aborted=false"), eventos)
    }

    @Test
    fun `ready sem ouvinte so guarda`() {
        val confirmacao = Intent("x")
        UpdateState.ready("1.2.0", confirmacao)
        assertSame(confirmacao, UpdateState.pendingConfirmation)
    }
}
```

Em `ManifestTest.kt`, acrescentar (imports `android.content.pm.PackageManager` se ainda não houver):

```kotlin
    @Test
    fun `pode instalar a propria atualizacao`() {
        val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        assertTrue(info.requestedPermissions!!.contains("android.permission.REQUEST_INSTALL_PACKAGES"))
    }

    @Test
    fun `receiver do instalador registrado e nao exportado`() {
        val info = context.packageManager.getReceiverInfo(
            android.content.ComponentName(context, UpdateStatusReceiver::class.java), 0,
        )
        assertEquals(false, info.exported)
    }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testDebugUnitTest --tests '*UpdateStatusReceiverTest*' --tests '*ManifestTest*'`
Expected: FAIL de compilação — `Unresolved reference: UpdateState` / `UpdateStatusReceiver`.

- [ ] **Step 3: Implementar**

`UpdateState.kt`:

```kotlin
package com.smarttvads.signage

import android.content.Intent

/**
 * Atualização pronta para confirmar, compartilhada entre o receiver do
 * instalador (que recebe o Intent do sistema) e a Activity (que só o abre
 * quando alguém aperta OK). Usado só na main thread.
 */
object UpdateState {
    interface Listener {
        fun onUpdateReady(versionName: String)

        /** aborted = a pessoa cancelou o diálogo; a sessão morreu e pode ser refeita. */
        fun onUpdateFailed(aborted: Boolean)
    }

    var pendingConfirmation: Intent? = null
        private set
    var pendingVersion: String? = null
        private set
    var listener: Listener? = null

    fun ready(versionName: String, confirmation: Intent) {
        pendingVersion = versionName
        pendingConfirmation = confirmation
        listener?.onUpdateReady(versionName)
    }

    fun failed(aborted: Boolean) {
        clear()
        listener?.onUpdateFailed(aborted)
    }

    fun clear() {
        pendingConfirmation = null
        pendingVersion = null
    }
}
```

`UpdateStatusReceiver.kt`:

```kotlin
package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller

/** Resposta do PackageInstaller à sessão aberta pelo UpdateInstaller. */
class UpdateStatusReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val version = intent.getStringExtra(EXTRA_VERSION) ?: return
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirmation = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirmation == null) UpdateState.failed(aborted = false)
                // Guarda sem abrir: o diálogo cobriria o painel até alguém responder.
                else UpdateState.ready(version, confirmation)
            }
            PackageInstaller.STATUS_SUCCESS -> UpdateState.clear()
            PackageInstaller.STATUS_FAILURE_ABORTED -> UpdateState.failed(aborted = true)
            else -> UpdateState.failed(aborted = false)
        }
    }

    companion object {
        const val EXTRA_VERSION = "com.smarttvads.signage.UPDATE_VERSION"
    }
}
```

`UpdateInstaller.kt`:

```kotlin
package com.smarttvads.signage

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import java.io.File

/**
 * Entrega o APK conferido ao PackageInstaller. O sistema responde no
 * UpdateStatusReceiver: no Android 10/11 sempre pede confirmação; no 12+
 * pode instalar sem perguntar quando o próprio app instalou a versão atual.
 */
class UpdateInstaller(private val context: Context) {

    fun prepare(apk: File, versionName: String) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(context.packageName)
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("base.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val status = Intent(context, UpdateStatusReceiver::class.java)
                .putExtra(UpdateStatusReceiver.EXTRA_VERSION, versionName)
            // O sistema preenche o status no Intent: no Android 12+ precisa ser mutável.
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pending = PendingIntent.getBroadcast(context, sessionId, status, flags)
            session.commit(pending.intentSender)
        }
    }
}
```

Em `AndroidManifest.xml`, depois da linha `<uses-permission android:name="android.permission.WAKE_LOCK" />`:

```xml
    <!-- O app baixa e instala a própria versão nova (ver UpdateInstaller). -->
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

E antes de `</application>`, depois do `<receiver android:name=".BootReceiver" ...>...</receiver>`:

```xml

        <!-- Só o PendingIntent do próprio app chega aqui. -->
        <receiver
            android:name=".UpdateStatusReceiver"
            android:exported="false" />
```

- [ ] **Step 4: Rodar e ver passar; suíte inteira**

Run: `./gradlew :app:testDebugUnitTest`
Expected: todos PASS (inclui 6 de `UpdateStatusReceiverTest` e os 2 novos do `ManifestTest`). `UpdateInstaller` não tem teste JVM (o `PackageInstaller` do Robolectric não aplica a sessão); ele é exercitado na Task 8 no emulador.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/smarttvads/signage/UpdateState.kt app/src/main/java/com/smarttvads/signage/UpdateStatusReceiver.kt app/src/main/java/com/smarttvads/signage/UpdateInstaller.kt app/src/main/AndroidManifest.xml app/src/test/java/com/smarttvads/signage/UpdateStatusReceiverTest.kt app/src/test/java/com/smarttvads/signage/ManifestTest.kt
git commit -m "feat(android-tv): sessão do instalador e confirmação guardada

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `UpdateController`

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateController.kt`
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateDownloader.kt` (implementa `UpdateController.Downloader`)
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateInstaller.kt` (implementa `UpdateController.Installer`)
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdateControllerTest.kt`

**Interfaces:**
- Consumes: `UpdateManifest`, `UpdatePolicy.shouldUpdate` (Task 1); `UpdateDownloader.fetchManifest/downloadApk` (Task 2); `UpdateInstaller.prepare(apk, versionName)` (Task 3).
- Produces:
  - `class UpdateController(installedVersionCode: Int, downloader: UpdateController.Downloader, installer: UpdateController.Installer, executor: java.util.concurrent.Executor)` com `fun check()`
  - `interface UpdateController.Downloader { fun fetchManifest(): UpdateManifest?; fun downloadApk(manifest: UpdateManifest): File? }`
  - `fun interface UpdateController.Installer { fun prepare(apk: File, versionName: String) }`

- [ ] **Step 1: Teste que falha**

`UpdateControllerTest.kt` (JVM puro: não usa `parse`, monta o `UpdateManifest` direto):

```kotlin
package com.smarttvads.signage

import java.io.File
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Test

class UpdateControllerTest {
    private val instalada = 1_000_001
    private val nova = UpdateManifest("1.2.0", 1_002_000, "signage-tv-1.2.0.apk", "a".repeat(64))
    private val apk = File("signage-tv-1.2.0.apk")

    private class FakeDownloader(
        var manifest: UpdateManifest?,
        var apk: File?,
        var erro: RuntimeException? = null,
    ) : UpdateController.Downloader {
        var manifestos = 0
        var downloads = 0
        override fun fetchManifest(): UpdateManifest? {
            manifestos++
            erro?.let { throw it }
            return manifest
        }
        override fun downloadApk(manifest: UpdateManifest): File? {
            downloads++
            return apk
        }
    }

    private val preparados = mutableListOf<Pair<File, String>>()
    private val installer = UpdateController.Installer { f, v -> preparados += f to v }
    private val imediato = Executor { it.run() }

    @Test
    fun `versao nova baixa e prepara a instalacao`() {
        val d = FakeDownloader(nova, apk)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(listOf(apk to "1.2.0"), preparados)
    }

    @Test
    fun `mesma versao nem baixa`() {
        val d = FakeDownloader(nova.copy(versionCode = instalada), apk)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(0, d.downloads)
        assertEquals(emptyList<Pair<File, String>>(), preparados)
    }

    @Test
    fun `sem manifesto nao faz nada`() {
        val d = FakeDownloader(null, apk)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(0, d.downloads)
    }

    @Test
    fun `download falhou nao prepara`() {
        val d = FakeDownloader(nova, null)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(emptyList<Pair<File, String>>(), preparados)
    }

    @Test
    fun `erro inesperado nao derruba e a proxima checagem roda`() {
        val d = FakeDownloader(nova, apk, erro = IllegalStateException("boom"))
        val c = UpdateController(instalada, d, installer, imediato)
        c.check()
        d.erro = null
        c.check()
        assertEquals(2, d.manifestos)
        assertEquals(listOf(apk to "1.2.0"), preparados)
    }

    @Test
    fun `so uma checagem por vez`() {
        val fila = mutableListOf<Runnable>()
        val d = FakeDownloader(nova, apk)
        val c = UpdateController(instalada, d, installer, Executor { fila += it })
        c.check()
        c.check()
        assertEquals(1, fila.size)
        fila.single().run()
        c.check()
        assertEquals(2, fila.size)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testDebugUnitTest --tests '*UpdateControllerTest*'`
Expected: FAIL de compilação — `Unresolved reference: UpdateController`.

- [ ] **Step 3: Implementar**

`UpdateController.kt`:

```kotlin
package com.smarttvads.signage

import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Checagem de versão nova: manifesto → política → APK conferido → sessão do
 * instalador. Roda no executor (fora da main thread), uma por vez, e nunca
 * propaga erro: atualizar é opcional.
 */
class UpdateController(
    private val installedVersionCode: Int,
    private val downloader: Downloader,
    private val installer: Installer,
    private val executor: Executor,
) {
    interface Downloader {
        fun fetchManifest(): UpdateManifest?
        fun downloadApk(manifest: UpdateManifest): File?
    }

    fun interface Installer {
        fun prepare(apk: File, versionName: String)
    }

    private val running = AtomicBoolean(false)

    fun check() {
        if (!running.compareAndSet(false, true)) return
        executor.execute {
            try {
                val manifest = downloader.fetchManifest() ?: return@execute
                if (!UpdatePolicy.shouldUpdate(manifest.versionCode, installedVersionCode)) return@execute
                val apk = downloader.downloadApk(manifest) ?: return@execute
                installer.prepare(apk, manifest.versionName)
            } catch (e: Exception) {
                // Sem rede, disco cheio, instalador recusou: tenta na próxima checagem.
            } finally {
                running.set(false)
            }
        }
    }
}
```

Em `UpdateDownloader.kt`: trocar a declaração da classe e marcar os dois métodos com `override`:

```kotlin
class UpdateDownloader(private val baseUrl: String, private val dir: File) : UpdateController.Downloader {

    override fun fetchManifest(): UpdateManifest? = try {
```

```kotlin
    override fun downloadApk(manifest: UpdateManifest): File? {
```

Em `UpdateInstaller.kt`:

```kotlin
class UpdateInstaller(private val context: Context) : UpdateController.Installer {

    override fun prepare(apk: File, versionName: String) {
```

- [ ] **Step 4: Rodar e ver passar; suíte inteira**

Run: `./gradlew :app:testDebugUnitTest`
Expected: todos PASS (inclui 6 de `UpdateControllerTest`).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/smarttvads/signage/UpdateController.kt app/src/main/java/com/smarttvads/signage/UpdateDownloader.kt app/src/main/java/com/smarttvads/signage/UpdateInstaller.kt app/src/test/java/com/smarttvads/signage/UpdateControllerTest.kt
git commit -m "feat(android-tv): orquestra a checagem de versão nova

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `MainActivity` — agenda, aviso e tecla OK

**Files:**
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt`
- Modify: `artifacts/android-tv/app/src/main/res/layout/activity_main.xml`
- Modify: `artifacts/android-tv/app/src/main/res/values/strings.xml`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/MainActivityUpdateTest.kt`

**Interfaces:**
- Consumes: `UpdateController` (Task 4), `UpdateState`/`UpdateState.Listener` (Task 3), `UpdateDownloader`, `UpdateInstaller`, `BuildConfig.UPDATE_BASE_URL`, `BuildConfig.VERSION_CODE`.
- Produces:
  - `MainActivity : Activity, TvWebViewClient.Listener, UpdateState.Listener`
  - `MainActivity.updateControllerFactory: (MainActivity) -> UpdateController` (companion, `internal var`, só testes trocam)
  - constantes no companion: `UPDATE_FIRST_CHECK_MS = 120_000L`, `UPDATE_INTERVAL_MS = 21_600_000L`, `UPDATE_FAILED_VISIBLE_MS = 10_000L`
  - id de layout `R.id.update_banner`

- [ ] **Step 1: Teste que falha**

`MainActivityUpdateTest.kt`:

```kotlin
package com.smarttvads.signage

import android.content.Intent
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.widget.TextView
import java.io.File
import java.time.Duration
import java.util.concurrent.Executor
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController

@RunWith(RobolectricTestRunner::class)
class MainActivityUpdateTest {
    private var checagens = 0
    private val controllers = mutableListOf<ActivityController<MainActivity>>()

    private val semVersaoNova = object : UpdateController.Downloader {
        override fun fetchManifest(): UpdateManifest? {
            checagens++
            return null
        }
        override fun downloadApk(manifest: UpdateManifest): File? = null
    }

    private fun abrir(): MainActivity {
        MainActivity.updateControllerFactory = {
            UpdateController(1, semVersaoNova, UpdateController.Installer { _, _ -> }, Executor { it.run() })
        }
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        controllers += c
        return c.get()
    }

    @After
    fun limpa() {
        controllers.forEach { it.pause().stop().destroy() }
        UpdateState.clear()
        UpdateState.listener = null
        MainActivity.updateControllerFactory = MainActivity.defaultUpdateControllerFactory
    }

    private fun passar(ms: Long) = shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms))

    private fun MainActivity.aviso(): TextView = findViewById(R.id.update_banner)

    private fun MainActivity.apertarOk(): Boolean {
        val down = dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER))
        val up = dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_CENTER))
        return down && up
    }

    @Test
    fun `checa 2 min depois de abrir e depois a cada 6 h`() {
        abrir()
        passar(MainActivity.UPDATE_FIRST_CHECK_MS - 1)
        assertEquals(0, checagens)
        passar(1)
        assertEquals(1, checagens)
        passar(MainActivity.UPDATE_INTERVAL_MS)
        assertEquals(2, checagens)
    }

    @Test
    fun `atualizacao pronta mostra o aviso com a versao`() {
        val a = abrir()
        UpdateState.ready("1.2.0", Intent("confirmar"))
        assertEquals(View.VISIBLE, a.aviso().visibility)
        assertTrue(a.aviso().text.contains("1.2.0"))
    }

    @Test
    fun `aviso aparece ao abrir se ja havia atualizacao pronta`() {
        UpdateState.ready("1.2.0", Intent("confirmar"))
        val a = abrir()
        assertEquals(View.VISIBLE, a.aviso().visibility)
    }

    @Test
    fun `ok com atualizacao pronta abre a confirmacao e some o aviso`() {
        val a = abrir()
        UpdateState.ready("1.2.0", Intent("confirmar"))
        assertTrue(a.apertarOk())
        assertEquals("confirmar", shadowOf(a).nextStartedActivity?.action)
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(View.GONE, a.aviso().visibility)
    }

    @Test
    fun `ok sem atualizacao pronta nao abre nada`() {
        val a = abrir()
        a.apertarOk()
        assertNull(shadowOf(a).nextStartedActivity)
    }

    @Test
    fun `cancelado no dialogo refaz a checagem na hora`() {
        val a = abrir()
        val antes = checagens
        a.onUpdateFailed(aborted = true)
        assertEquals(antes + 1, checagens)
        assertEquals(View.GONE, a.aviso().visibility)
    }

    @Test
    fun `falha mostra aviso por 10 s`() {
        val a = abrir()
        a.onUpdateFailed(aborted = false)
        assertEquals(View.VISIBLE, a.aviso().visibility)
        assertEquals(a.getString(R.string.update_failed), a.aviso().text.toString())
        passar(MainActivity.UPDATE_FAILED_VISIBLE_MS)
        assertEquals(View.GONE, a.aviso().visibility)
    }

    @Test
    fun `aviso nao recebe foco`() {
        assertFalse(abrir().aviso().isFocusable)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testDebugUnitTest --tests '*MainActivityUpdateTest*'`
Expected: FAIL de compilação — `Unresolved reference: updateControllerFactory` / `update_banner` / `UPDATE_FIRST_CHECK_MS`.

- [ ] **Step 3: Layout e textos**

Em `res/values/strings.xml`, antes de `</resources>`:

```xml
    <string name="update_ready">Atualização %1$s pronta — aperte OK para instalar</string>
    <string name="update_failed">Falha ao atualizar</string>
```

Em `res/layout/activity_main.xml`, antes de `</FrameLayout>` (último filho, fica por cima do painel mas só no canto):

```xml

    <!-- Aviso discreto: o painel segue visível; o diálogo do sistema só abre
         quando alguém aperta OK. -->
    <TextView
        android:id="@+id/update_banner"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_gravity="bottom|end"
        android:layout_margin="24dp"
        android:background="#CC000000"
        android:focusable="false"
        android:paddingLeft="16dp"
        android:paddingTop="10dp"
        android:paddingRight="16dp"
        android:paddingBottom="10dp"
        android:textColor="@android:color/white"
        android:textSize="18sp"
        android:visibility="gone" />
```

- [ ] **Step 4: Integração na `MainActivity`**

Imports novos em `MainActivity.kt`:

```kotlin
import java.io.File
import java.util.concurrent.Executors
```

Declaração da classe:

```kotlin
class MainActivity : Activity(), TvWebViewClient.Listener, UpdateState.Listener {
```

Campos novos, junto dos outros `lateinit`:

```kotlin
    private lateinit var updateBanner: android.widget.TextView
    private lateinit var updateController: UpdateController
```

Runnables novos, junto de `retry` e `dailyReload`:

```kotlin
    // Não refaz a sessão enquanto já há uma atualização esperando o OK.
    private val updateCheck = object : Runnable {
        override fun run() {
            if (UpdateState.pendingConfirmation == null) updateController.check()
            handler.postDelayed(this, UPDATE_INTERVAL_MS)
        }
    }
    private val hideUpdateBanner = Runnable { updateBanner.visibility = View.GONE }
```

Em `onCreate`, depois de `webViewMissing = findViewById(R.id.webview_missing)`:

```kotlin
        updateBanner = findViewById(R.id.update_banner)
        updateController = updateControllerFactory(this)
        UpdateState.listener = this
        UpdateState.pendingVersion?.let { onUpdateReady(it) }
        handler.postDelayed(updateCheck, UPDATE_FIRST_CHECK_MS)
```

Em `onDestroy`, antes de `handler.removeCallbacksAndMessages(null)`:

```kotlin
        if (UpdateState.listener === this) UpdateState.listener = null
```

Em `dispatchKeyEvent`, logo no começo do corpo (antes do `if (event.keyCode != KeyEvent.KEYCODE_BACK)`):

```kotlin
        if (isOkKey(event.keyCode) && UpdateState.pendingConfirmation != null) {
            if (event.action == KeyEvent.ACTION_UP) openUpdateConfirmation()
            return true
        }
```

Métodos novos (depois de `openSystemSettings()`):

```kotlin
    private fun isOkKey(keyCode: Int) = keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
        keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER

    private fun openUpdateConfirmation() {
        val confirmation = UpdateState.pendingConfirmation ?: return
        // A sessão só vale uma vez: se a pessoa cancelar, chega ABORTED e a
        // checagem refaz a sessão com o APK já baixado.
        UpdateState.clear()
        updateBanner.visibility = View.GONE
        try {
            startActivity(confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            onUpdateFailed(aborted = false)
        }
    }

    override fun onUpdateReady(versionName: String) {
        handler.removeCallbacks(hideUpdateBanner)
        updateBanner.text = getString(R.string.update_ready, versionName)
        updateBanner.visibility = View.VISIBLE
    }

    override fun onUpdateFailed(aborted: Boolean) {
        handler.removeCallbacks(hideUpdateBanner)
        if (aborted) {
            updateBanner.visibility = View.GONE
            updateController.check()
            return
        }
        updateBanner.text = getString(R.string.update_failed)
        updateBanner.visibility = View.VISIBLE
        handler.postDelayed(hideUpdateBanner, UPDATE_FAILED_VISIBLE_MS)
    }
```

No `companion object`, junto de `BACK_HOLD_TO_SETTINGS_MS`:

```kotlin
        const val UPDATE_FIRST_CHECK_MS = 120_000L
        const val UPDATE_INTERVAL_MS = 21_600_000L
        const val UPDATE_FAILED_VISIBLE_MS = 10_000L

        internal val defaultUpdateControllerFactory: (MainActivity) -> UpdateController = { a ->
            UpdateController(
                installedVersionCode = BuildConfig.VERSION_CODE,
                downloader = UpdateDownloader(BuildConfig.UPDATE_BASE_URL, File(a.cacheDir, "updates")),
                installer = UpdateInstaller(a.applicationContext),
                executor = Executors.newSingleThreadExecutor(),
            )
        }

        /** Os testes trocam para não ir à rede. */
        internal var updateControllerFactory: (MainActivity) -> UpdateController = defaultUpdateControllerFactory
```

- [ ] **Step 5: Rodar e ver passar; suíte inteira**

Run: `./gradlew :app:testDebugUnitTest && ./gradlew :app:assembleDebug`
Expected: todos PASS (inclui 8 de `MainActivityUpdateTest`; os testes antigos da `MainActivityTest` seguem verdes — eles não avançam 2 min, e se algum avançar, a checagem vai à rede real e falha em silêncio, sem afetar o teste); build ok.

Se algum teste antigo da `MainActivityTest` avançar o relógio além de 2 min e ficar lento por tentar rede, adicionar nele `MainActivity.updateControllerFactory = { UpdateController(1, <downloader que devolve null>, { _, _ -> }, { it.run() }) }` no `@Before` — e relatar.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/smarttvads/signage/MainActivity.kt app/src/main/res/layout/activity_main.xml app/src/main/res/values/strings.xml app/src/test/java/com/smarttvads/signage/MainActivityUpdateTest.kt
git commit -m "feat(android-tv): aviso de atualização e OK para instalar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `UpdatedReceiver`

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdatedReceiver.kt`
- Modify: `artifacts/android-tv/app/src/main/AndroidManifest.xml`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdatedReceiverTest.kt`

**Interfaces:**
- Consumes: `MainActivity.hasLiveInstance` (existente).
- Produces: `class UpdatedReceiver : BroadcastReceiver`.

- [ ] **Step 1: Teste que falha**

`UpdatedReceiverTest.kt`:

```kotlin
package com.smarttvads.signage

import android.app.Application
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class UpdatedReceiverTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    @Test
    fun `depois de atualizar reabre o painel e apaga os apks`() {
        val dir = File(app.cacheDir, "updates").apply { mkdirs() }
        File(dir, "signage-tv-1.2.0.apk").writeText("x")
        UpdatedReceiver().onReceive(app, Intent(Intent.ACTION_MY_PACKAGE_REPLACED))
        assertEquals(MainActivity::class.java.name, shadowOf(app).nextStartedActivity?.component?.className)
        assertFalse(dir.exists())
    }

    @Test
    fun `com o painel ja aberto nao abre outro`() {
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            shadowOf(app).clearNextStartedActivities()
            UpdatedReceiver().onReceive(app, Intent(Intent.ACTION_MY_PACKAGE_REPLACED))
            assertNull(shadowOf(app).nextStartedActivity)
        } finally {
            c.pause().stop().destroy()
        }
    }

    @Test
    fun `outra acao nao faz nada`() {
        UpdatedReceiver().onReceive(app, Intent(Intent.ACTION_BOOT_COMPLETED))
        assertNull(shadowOf(app).nextStartedActivity)
    }

    @Test
    fun `registrado para MY_PACKAGE_REPLACED`() {
        val intent = Intent(Intent.ACTION_MY_PACKAGE_REPLACED).setPackage(app.packageName)
        val receivers = app.packageManager.queryBroadcastReceivers(intent, 0)
        assertTrue(receivers.any { it.activityInfo.name == UpdatedReceiver::class.java.name })
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testDebugUnitTest --tests '*UpdatedReceiverTest*'`
Expected: FAIL de compilação — `Unresolved reference: UpdatedReceiver`.

- [ ] **Step 3: Implementar e registrar**

`UpdatedReceiver.kt`:

```kotlin
package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.File

/**
 * Depois que o Android instala a versão nova, o processo antigo morre. Reabre
 * o painel (se o sistema não reabriu a tela inicial sozinho) e apaga os APKs
 * baixados.
 */
class UpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        File(context.cacheDir, "updates").deleteRecursively()
        if (MainActivity.hasLiveInstance) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
```

Em `AndroidManifest.xml`, antes de `</application>` (depois do `UpdateStatusReceiver`):

```xml

        <!-- MY_PACKAGE_REPLACED é broadcast protegido do sistema. -->
        <receiver
            android:name=".UpdatedReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
```

- [ ] **Step 4: Rodar e ver passar; suíte inteira**

Run: `./gradlew :app:testDebugUnitTest`
Expected: todos PASS (inclui 4 de `UpdatedReceiverTest`).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/smarttvads/signage/UpdatedReceiver.kt app/src/main/AndroidManifest.xml app/src/test/java/com/smarttvads/signage/UpdatedReceiverTest.kt
git commit -m "feat(android-tv): reabre o painel depois de atualizar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Pipeline anexa `update.json`; README e CLAUDE.md

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `artifacts/android-tv/README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: asset `update.json` em cada release, no formato da Global Constraints, com `versionCode` lido do APK e `sha256` do APK anexado.

- [ ] **Step 1: Gerar o `update.json` no job de release**

Em `.github/workflows/release.yml`, no step `APK release assinado`, substituir as duas últimas linhas do `run`:

```bash
          "$BT/aapt" dump badging "$APK" | head -1
          cp "$APK" "$RUNNER_TEMP/"
```

por:

```bash
          "$BT/aapt" dump badging "$APK" | head -1
          cp "$APK" "$RUNNER_TEMP/"
          # update.json: o app compara o versionCode e confere o APK pelo hash.
          CODE="$("$BT/aapt" dump badging "$APK" | sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p" | head -1)"
          SHA="$(sha256sum "$APK" | cut -d' ' -f1)"
          jq -n --arg v "$VERSION" --argjson c "$CODE" --arg a "signage-tv-$VERSION.apk" --arg s "$SHA" \
            '{versionName: $v, versionCode: $c, apk: $a, sha256: $s}' > "$RUNNER_TEMP/update.json"
          cat "$RUNNER_TEMP/update.json"
```

No step `GitHub Release`, na lista de arquivos do `gh release create`, depois da linha `"$RUNNER_TEMP/signage-web-$VERSION.zip" \`:

```bash
            "$RUNNER_TEMP/update.json" \
```

Na montagem das notas, depois da linha do `signage-web`:

```bash
            echo "- \`update.json\`: versão e SHA-256 do APK, lido pelo app para se atualizar."
```

Novo step depois de `GitHub Release` (antes de `Apaga o keystore`):

```yaml
      # O que o app baixa precisa bater com o que foi publicado.
      - name: Confere update.json publicado
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          mkdir -p "$RUNNER_TEMP/check"
          gh release download "v$VERSION" -D "$RUNNER_TEMP/check" -p update.json -p "signage-tv-$VERSION.apk"
          cd "$RUNNER_TEMP/check"
          test "$(sha256sum "signage-tv-$VERSION.apk" | cut -d' ' -f1)" = "$(jq -r .sha256 update.json)"
          test "$(jq -r .apk update.json)" = "signage-tv-$VERSION.apk"
          echo "update.json confere com o APK publicado"
```

- [ ] **Step 2: Validar o workflow**

Run (da raiz do repo): `actionlint .github/workflows/release.yml`
Expected: sem saída (ok).

Simular localmente a geração do JSON com o APK debug (confere o `sed` e o `jq`):

```bash
cd artifacts/android-tv && ./gradlew -q :app:assembleDebug -PversionName=1.2.0
APK=app/build/outputs/apk/debug/signage-tv-1.2.0-debug.apk
BT="$HOME/Library/Android/sdk/build-tools/35.0.0"
CODE="$("$BT/aapt" dump badging "$APK" | sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p" | head -1)"
SHA="$(shasum -a 256 "$APK" | cut -d' ' -f1)"
jq -n --arg v 1.2.0 --argjson c "$CODE" --arg a signage-tv-1.2.0.apk --arg s "$SHA" '{versionName: $v, versionCode: $c, apk: $a, sha256: $s}'
```

Expected: JSON com `"versionCode": 1002000` e `sha256` de 64 hex. (No macOS é `shasum -a 256`; no runner, `sha256sum`.)

- [ ] **Step 3: README**

Em `artifacts/android-tv/README.md`:

1. Na seção `## Instalação na TV / TV box (técnico)`, depois do passo que instala o APK (passo 3), inserir um passo novo e renumerar os seguintes:

```markdown
4. Libere **Instalar apps desconhecidos** para o **Signage TV** (Configurações
   → Apps → Acesso especial / Segurança; em Android 8+ é por app). É o que
   permite o app instalar as próprias atualizações.
```

2. Nova seção logo depois de `## Atualizar o app` (substituindo o texto dela):

```markdown
## Atualizar o app

O app se atualiza sozinho a partir das releases do GitHub:

- Checa 2 minutos depois de abrir e depois a cada 6 horas.
- Achou versão nova: baixa, confere o SHA-256 e mostra no canto
  "Atualização X pronta — aperte OK para instalar". O painel segue normal.
- Alguém aperta **OK** no controle → o Android pergunta "Atualizar?" →
  confirmar. O painel volta sozinho, com a mesma key (TV continua vinculada).
- Android 10/11 sempre pede essa confirmação. No Android 12+, a partir da
  segunda atualização feita pelo próprio app, instala sem perguntar.
- Cancelou o diálogo: o aviso volta; OK tenta de novo.

TVs com a versão **1.0.1** ainda não têm o atualizador: instale uma vez à mão
o APK da release mais recente (mesmo keystore, por cima). Dali em diante é
automático. Conteúdo e comportamento de exibição continuam chegando pelo
deploy web.
```

3. Em `## Comportamento`, acrescentar:

```markdown
- Falha ao baixar ou instalar atualização: nada muda no painel; aviso
  "Falha ao atualizar" por 10 s quando a instalação falha; tenta de novo na
  próxima checagem.
```

4. Em `## Checklist de teste manual`, acrescentar:

```markdown
- [ ] Com versão nova na última release, o aviso aparece no canto em até
      2 minutos depois de abrir.
- [ ] OK abre a confirmação do sistema; confirmar instala e o painel volta com
      a mesma key.
```

- [ ] **Step 4: CLAUDE.md**

Em `CLAUDE.md`, na seção `## Releases (automáticas)`, trocar o primeiro item por:

```markdown
- `.github/workflows/release.yml`: todo merge na `main` roda os testes e cria a
  release `vX.Y.Z` no GitHub com `signage-tv-X.Y.Z.apk` (assinado),
  `signage-web-X.Y.Z.zip` e `update.json` anexados. PR roda só os testes.
- O app Android lê `update.json` de `releases/latest/download/` para se
  atualizar: **não** remover esse asset nem renomear o APK
  (`signage-tv-X.Y.Z.apk`), e a release mais recente precisa ser a versão que
  as TVs devem receber.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml artifacts/android-tv/README.md CLAUDE.md
git commit -m "ci(release): anexa update.json para o app se atualizar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Ponta a ponta no emulador

**Files:** nenhum arquivo de produção. Evidências no scratchpad.

**Interfaces:**
- Consumes: tudo acima; `-PupdateBaseUrl` (Task 2), cleartext do debug.

- [ ] **Step 1: Montar duas versões debug e o servidor local**

```bash
export JAVA_HOME=/Users/yvillanova/Library/Java/JavaVirtualMachines/jbr-17.0.14/Contents/Home
SDK="$HOME/Library/Android/sdk"; ADB="$SDK/platform-tools/adb"; BT="$SDK/build-tools/35.0.0"
SCRATCH=/private/tmp/claude-503/-Users-yvillanova-Downloads-tv-Smart-Tv-Ads/7279b08e-d80d-460b-9f7a-24c1f96c96c3/scratchpad
SRV="$SCRATCH/update-srv"; rm -rf "$SRV"; mkdir -p "$SRV"
cd artifacts/android-tv
./gradlew -q :app:assembleDebug -PversionName=1.0.0 -PupdateBaseUrl=http://10.0.2.2:8765/
cp app/build/outputs/apk/debug/signage-tv-1.0.0-debug.apk "$SCRATCH/antiga.apk"
./gradlew -q :app:assembleDebug -PversionName=1.0.2 -PupdateBaseUrl=http://10.0.2.2:8765/
cp app/build/outputs/apk/debug/signage-tv-1.0.2-debug.apk "$SRV/signage-tv-1.0.2.apk"
SHA="$(shasum -a 256 "$SRV/signage-tv-1.0.2.apk" | cut -d' ' -f1)"
printf '{"versionName":"1.0.2","versionCode":1000002,"apk":"signage-tv-1.0.2.apk","sha256":"%s"}' "$SHA" > "$SRV/update.json"
(cd "$SRV" && python3 -m http.server 8765 >/dev/null 2>&1 &)
curl -s http://localhost:8765/update.json
```

Expected: o JSON impresso.

- [ ] **Step 2: Instalar a antiga e liberar instalação**

Emulador `Television_4K` (ou `SignageTV_API31`) já ligado (`$ADB devices`); se houver o app instalado com outra assinatura, `$ADB uninstall com.smarttvads.signage` antes.

```bash
$ADB install -r "$SCRATCH/antiga.apk"
$ADB shell appops set com.smarttvads.signage REQUEST_INSTALL_PACKAGES allow
$ADB shell am start -n com.smarttvads.signage/.MainActivity
sleep 15; $ADB exec-out screencap -p > "$SCRATCH/au-1-antes.png"
```

Anotar a key mostrada no QR (screenshot).

- [ ] **Step 3: Esperar o aviso (2 min) e apertar OK**

```bash
sleep 130; $ADB exec-out screencap -p > "$SCRATCH/au-2-aviso.png"
$ADB shell input keyevent KEYCODE_DPAD_CENTER
sleep 3; $ADB exec-out screencap -p > "$SCRATCH/au-3-dialogo.png"
```

Expected: `au-2-aviso.png` com "Atualização 1.0.2 pronta — aperte OK para instalar" no canto; `au-3-dialogo.png` com o diálogo do sistema.

- [ ] **Step 4: Confirmar e verificar**

Confirmar no diálogo com as setas/OK do controle (guiado pelo screenshot: `$ADB shell input keyevent KEYCODE_DPAD_RIGHT` / `KEYCODE_DPAD_CENTER`).

```bash
sleep 15
$ADB shell dumpsys package com.smarttvads.signage | grep -E "versionName|versionCode" | head -2
$ADB shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -1
$ADB exec-out screencap -p > "$SCRATCH/au-4-depois.png"
```

Expected: `versionName=1.0.2`, `versionCode=1000002`; `MainActivity` em primeiro plano; `au-4-depois.png` com a **mesma key** do Step 2.

- [ ] **Step 5: Cancelamento**

Reinstalar a antiga por cima não é possível (versão menor). Para testar o cancelamento: `$ADB uninstall com.smarttvads.signage`, repetir Steps 2–3 e, no diálogo, apertar Voltar (`KEYCODE_BACK`); em até alguns segundos o aviso deve voltar ao canto (`au-5-cancelado.png`).

- [ ] **Step 6: Limpar**

```bash
pkill -f "http.server 8765"
```

Relatar cada passo com ok/falhou e o caminho do screenshot. Não há commit nesta task.
