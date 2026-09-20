package com.smarttvads.signage

/** Só versão maior que a instalada; o Android recusaria instalar uma menor. */
object UpdatePolicy {
    fun shouldUpdate(remoteCode: Int, installedCode: Int): Boolean = remoteCode > installedCode
}
