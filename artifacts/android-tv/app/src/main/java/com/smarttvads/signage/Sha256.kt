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
