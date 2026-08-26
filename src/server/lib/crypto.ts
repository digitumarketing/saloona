/**
 * Password hashing and session token generation.
 *
 * Passwords use PBKDF2-SHA256 at OWASP's recommended iteration count. The
 * previous implementation was a single SHA-256 pass, which is a fast
 * general-purpose hash and recoverable on commodity GPUs. Stored hashes are
 * versioned so legacy records can be upgraded on next successful login.
 */

const PBKDF2_ITERATIONS = 210_000;
const DERIVED_KEY_BITS = 256;
const CURRENT_VERSION = "pbkdf2-sha256-210000";

/** Legacy single-pass SHA-256, retained only to verify and upgrade old rows. */
const LEGACY_VERSION = "sha256-v0";

export interface PasswordRecord {
  hash: string;
  salt: string;
  version: string;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer as ArrayBuffer);
}

async function pbkdf2(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    DERIVED_KEY_BITS
  );
  return toHex(bits);
}

async function legacySha256(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return toHex(digest);
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomHex(16);
  return { hash: await pbkdf2(password, salt), salt, version: CURRENT_VERSION };
}

/**
 * Compares a candidate password against a stored record in constant time.
 * `needsUpgrade` is true when the stored record used an older scheme and the
 * caller should re-hash and persist after a successful login.
 */
export async function verifyPassword(
  password: string,
  stored: { hash: string | null; salt: string | null; version?: string | null }
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!stored.hash || !stored.salt) return { valid: false, needsUpgrade: false };

  const version = stored.version ?? LEGACY_VERSION;
  const candidate =
    version === LEGACY_VERSION
      ? await legacySha256(password, stored.salt)
      : await pbkdf2(password, stored.salt);

  const valid = timingSafeEqual(candidate, stored.hash);
  return { valid, needsUpgrade: valid && version !== CURRENT_VERSION };
}

/** Length-independent constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  // Compare a fixed-width digest of each side so differing lengths do not
  // short-circuit and leak information through timing.
  let mismatch = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < max; i += 1) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return mismatch === 0;
}

/**
 * Session tokens are 32 random bytes shown to the client, but only a SHA-256
 * digest is stored. A leaked database therefore cannot be used to resume
 * sessions.
 */
export function generateSessionToken(): string {
  return randomHex(32);
}

export async function hashSessionToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

/** Single-use token for email verification and password reset, stored hashed. */
export function generateOpaqueToken(): string {
  return randomHex(32);
}

export { randomHex };
