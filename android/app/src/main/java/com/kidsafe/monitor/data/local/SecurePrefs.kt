package com.kidsafe.monitor.data.local

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypts sensitive tokens and credential hashes using an AES-256-GCM key
 * backed by the Android Hardware Keystore. Automatically migrates any legacy
 * plaintext values from kidsafe_prefs on first read.
 */
object SecurePrefs {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "kidsafe_master_aes_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val SECURE_PREFS_NAME = "kidsafe_secure_prefs"
    private const val LEGACY_PREFS_NAME = "kidsafe_prefs"
    private const val IV_LENGTH_BYTES = 12
    private const val TAG_LENGTH_BITS = 128

    @Synchronized
    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val existing = ks.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        val combined = ByteArray(iv.size + encrypted.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(encrypted, 0, combined, iv.size, encrypted.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String? {
        return try {
            val combined = Base64.decode(encoded, Base64.NO_WRAP)
            if (combined.size <= IV_LENGTH_BYTES) return null
            val iv = combined.copyOfRange(0, IV_LENGTH_BYTES)
            val cipherBytes = combined.copyOfRange(IV_LENGTH_BYTES, combined.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_LENGTH_BITS, iv))
            String(cipher.doFinal(cipherBytes), Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    fun putSecret(context: Context, key: String, value: String) {
        val securePrefs = context.getSharedPreferences(SECURE_PREFS_NAME, Context.MODE_PRIVATE)
        val legacyPrefs = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
        if (value.isBlank()) {
            securePrefs.edit().remove(key).apply()
            legacyPrefs.edit().remove(key).apply()
            return
        }
        try {
            val cipherText = encrypt(value)
            securePrefs.edit().putString(key, cipherText).apply()
            // Remove plaintext copy if present
            if (legacyPrefs.contains(key)) {
                legacyPrefs.edit().remove(key).apply()
            }
        } catch (_: Exception) {
            // Do not crash if Keystore is temporarily unavailable
        }
    }

    fun getSecret(context: Context, key: String): String {
        val securePrefs = context.getSharedPreferences(SECURE_PREFS_NAME, Context.MODE_PRIVATE)
        val encoded = securePrefs.getString(key, null)
        if (!encoded.isNullOrBlank()) {
            val decrypted = decrypt(encoded)
            if (decrypted != null) return decrypted
        }

        // Migrate any legacy plaintext entry cleanly into Keystore-encrypted storage
        val legacyPrefs = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
        val legacyValue = legacyPrefs.getString(key, null)?.trim()
        if (!legacyValue.isNullOrBlank()) {
            putSecret(context, key, legacyValue)
            return legacyValue
        }
        return ""
    }
}
