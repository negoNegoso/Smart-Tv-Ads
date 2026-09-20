package com.smarttvads.signage

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * mySessions/abandonSession são suportados pelo shadow do PackageInstaller no
 * Robolectric (ver ShadowPackageInstaller), então dá pra testar a limpeza de
 * sessões antigas sem precisar do emulador.
 */
@RunWith(RobolectricTestRunner::class)
class UpdateInstallerTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun limpa() {
        UpdateState.clear()
        UpdateState.listener = null
    }

    @Test
    fun `duas checagens seguidas abandonam a sessao anterior do pacote`() {
        val apk = File(tmp.root, "signage-tv-1.2.0.apk").apply { writeBytes("apk".toByteArray()) }
        val installer = UpdateInstaller(context)
        val packageInstaller = context.packageManager.packageInstaller

        installer.prepare(apk, "1.2.0")
        installer.prepare(apk, "1.2.1")

        // Sem a limpeza, cada prepare() empilharia mais uma sessão comitada com
        // uma cópia do APK, sem que nada as recolhesse numa box 24/7.
        assertEquals(1, packageInstaller.mySessions.size)
    }
}
