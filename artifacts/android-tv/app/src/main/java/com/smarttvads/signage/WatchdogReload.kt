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
