package com.smarttvads.signage

import android.content.Intent
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A mesma guarda vale para a checagem periódica e para o aviso da página:
 * checar de novo com uma sessão em andamento faria o instalador abandonar a
 * sessão que a pessoa está confirmando.
 */
@RunWith(RobolectricTestRunner::class)
class UpdateStateTest {
    @After
    fun limpa() {
        UpdateState.installed() // reseta pendingConfirmation/pendingVersion e activeSessionId
        UpdateState.listener = null
    }

    @Test
    fun `sem nada em andamento pode checar`() {
        assertTrue(UpdateState.canCheck())
    }

    @Test
    fun `com atualizacao esperando o OK nao checa`() {
        UpdateState.ready("1.2.0", Intent("confirmar"))
        assertFalse(UpdateState.canCheck())
    }

    @Test
    fun `com sessao do instalador em andamento nao checa`() {
        UpdateState.sessionStarted(7)
        assertFalse(UpdateState.canCheck())
    }

    @Test
    fun `depois de instalada volta a poder checar`() {
        UpdateState.sessionStarted(7)
        UpdateState.ready("1.2.0", Intent("confirmar"))
        UpdateState.installed()
        assertTrue(UpdateState.canCheck())
    }

    @Test
    fun `depois de falhar volta a poder checar`() {
        UpdateState.sessionStarted(7)
        UpdateState.failed(aborted = false)
        assertTrue(UpdateState.canCheck())
    }
}
