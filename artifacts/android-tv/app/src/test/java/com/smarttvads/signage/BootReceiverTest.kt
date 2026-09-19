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
