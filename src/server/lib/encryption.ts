/**
 * Credential encryption at rest.
 *
 * Integration credentials are a tenant's WhatsApp access token and payment
 * gateway keys — enough to send messages billed to them or read their
 * transactions. The original schema stored them as plaintext JSON in
 * `integrations.config_json`, so any read of that table disclosed them. They are
 * now sealed with AES-GCM under a worker secret before they reach D1.
 *
 * The key lives in `ENCRYPTION_KEY` (a 32-byte value, base64) set via
 * `wrangler secret put`, never in the repository or in `wrangler.toml`.
 */

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

async function importKey(rawKey: string): Promise<CryptoKey> {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(rawKey), (char) => char.charCodeAt(0));
  } catch {
    throw new EncryptionError("ENCRYPTION_KEY must be base64-encoded");
  }
  if (bytes.length !== 32) {
    throw new EncryptionError(`ENCRYPTION_KEY must decode to 32 bytes, got ${bytes.length}`);
  }
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Encrypts a credential object. The IV is stored alongside, not derived. */
export async function sealCredentials(
  encryptionKey: string | undefined,
  // `object` rather than `Record<string, unknown>`: callers pass declared
  // interfaces, which have no index signature and so are not assignable to it.
  payload: object
): Promise<{ ciphertext: string; iv: string }> {
  if (!encryptionKey) {
    throw new EncryptionError("ENCRYPTION_KEY is not configured; refusing to store credentials in plaintext");
  }
  const key = await importKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { ciphertext: toBase64(new Uint8Array(sealed)), iv: toBase64(iv) };
}

export async function openCredentials<T = Record<string, unknown>>(
  encryptionKey: string | undefined,
  ciphertext: string | null,
  iv: string | null
): Promise<T | null> {
  if (!ciphertext || !iv) return null;
  if (!encryptionKey) throw new EncryptionError("ENCRYPTION_KEY is not configured; cannot read stored credentials");

  const key = await importKey(encryptionKey);
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      key,
      fromBase64(ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(opened)) as T;
  } catch {
    // A decrypt failure means the key was rotated or the row was tampered with.
    // Either way the credential is unusable; surfacing the cause would help an
    // attacker distinguish the two.
    throw new EncryptionError("Stored credentials could not be decrypted");
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** Masks a secret for display in the settings UI. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
