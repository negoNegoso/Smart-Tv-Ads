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
