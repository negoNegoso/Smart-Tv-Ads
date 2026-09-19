package com.smarttvads.signage

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePolicyTest {
    @Test
    fun `atualiza so se a versao remota for maior`() {
        assertTrue(UpdatePolicy.shouldUpdate(remoteCode = 1002000, installedCode = 1000001))
        assertFalse(UpdatePolicy.shouldUpdate(remoteCode = 1000001, installedCode = 1000001))
        assertFalse(UpdatePolicy.shouldUpdate(remoteCode = 1000000, installedCode = 1000001))
    }
}
