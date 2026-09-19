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
 * Roda contra o dev.sh (Vite em :21153 visto como 10.0.2.2 pelo emulador):
 * `./gradlew :app:connectedDebugAndroidTest -PtvUrl=http://10.0.2.2:21153/tv`.
 * Sem o -PtvUrl o app abre produção e criaria keys lá.
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
