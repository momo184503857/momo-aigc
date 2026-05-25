/**
 * Simple API Key obfuscation for localStorage storage.
 * Uses XOR with a fixed key to prevent casual viewing.
 * This is NOT real encryption — just prevents the key from
 * appearing in plaintext in DevTools or accidental screenshots.
 */

const KEY_MATERIAL = 'momo-aigc-key-v1'

function xorEncode(text: string, key: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return btoa(result)
}

function xorDecode(encoded: string, key: string): string {
  let result = ''
  const decoded = atob(encoded)
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return result
}

export function encryptApiKey(key: string): string {
  return xorEncode(key, KEY_MATERIAL)
}

export function decryptApiKey(encoded: string): string {
  try {
    return xorDecode(encoded, KEY_MATERIAL)
  } catch {
    return '' // Corrupted or old plaintext format
  }
}

export function maskApiKey(key: string): string {
  if (!key) return '***'
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}
