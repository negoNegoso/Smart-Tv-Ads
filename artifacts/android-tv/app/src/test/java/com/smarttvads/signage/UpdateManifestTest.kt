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
