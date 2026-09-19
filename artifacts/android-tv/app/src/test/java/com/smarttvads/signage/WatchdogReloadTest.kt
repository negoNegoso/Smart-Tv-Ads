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
