// Real crypto for the MessageU demo, using the browser's Web Crypto API.
// Same building blocks as the project: RSA-1024 with OAEP (SHA-1) to wrap the key,
// AES-128-CBC for the messages. If Web Crypto isn't available, we fall back to
// random bytes so the animation still works.
const subtle = globalThis.crypto?.subtle;
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const RSA = { name: 'RSA-OAEP', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-1' };

export async function createRsaKeyPair() {
  if (!subtle) return null;
  try {
    return await subtle.generateKey(RSA, false, ['encrypt', 'decrypt']);
  } catch {
    return null; // e.g. a browser that refuses 1024-bit keys
  }
}

// Alice: make a random AES key and wrap it with Bob's RSA public key.
export async function createWrappedKey(bobKeys) {
  const raw = random(16);
  const wrapped = bobKeys
    ? new Uint8Array(await subtle.encrypt({ name: 'RSA-OAEP' }, bobKeys.publicKey, raw))
    : random(128);
  return { raw, wrapped };
}

// Bob: unwrap the AES key with his RSA private key.
export async function unwrapKey(bobKeys, wrapped, fallbackRaw) {
  if (!bobKeys) return fallbackRaw;
  return new Uint8Array(await subtle.decrypt({ name: 'RSA-OAEP' }, bobKeys.privateKey, wrapped));
}

// AES-128-CBC encrypt / decrypt of a text message.
export async function encryptText(rawKey, text) {
  const iv = random(16);
  const data = new TextEncoder().encode(text);
  if (!subtle) {
    const padded = 16 * (Math.floor(data.length / 16) + 1);
    return { iv, cipher: random(padded), text };
  }
  const key = await subtle.importKey('raw', rawKey, 'AES-CBC', false, ['encrypt']);
  const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, key, data));
  return { iv, cipher, text };
}

export async function decryptText(rawKey, packet) {
  if (!subtle) return packet.text;
  const key = await subtle.importKey('raw', rawKey, 'AES-CBC', false, ['decrypt']);
  const plain = await subtle.decrypt({ name: 'AES-CBC', iv: packet.iv }, key, packet.cipher);
  return new TextDecoder().decode(plain);
}

// Short hex preview of a byte array: "3f 9a 0c …".
export function hex(bytes, max = 12) {
  const shown = [...bytes.slice(0, max)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return bytes.length > max ? `${shown} …` : shown;
}
