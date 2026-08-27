/**
 * Password hashing and session token generation.
 *
 * Passwords use PBKDF2-SHA256. The previous implementation was a single SHA-256
 * pass, which is a fast general-purpose hash and recoverable on commodity GPUs.
 * Stored hashes are versioned so older records can be re-hashed on next
 * successful login.
 */

/**
 * 100,000 is the **platform ceiling**, not a security preference.
 *
 * The Workers runtime rejects anything higher:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 *   supported (requested 210000).
 *
 * This code shipped at OWASP's recommended 210,000 and every signup and login
 * on production returned 500 — while working locally, because the dev runtime
 * does not enforce the cap. Do not raise this above 100,000 without first
 * confirming the deployed runtime accepts it; `npm test` will not catch it.
 *
 * Below OWASP's recommendation, the compensating control is the login rate
 * limiter in lib/rate-limit.ts, which is what actually bounds an online guessing
 * attack. An offline attack against a stolen database is the case this weakens,
 * so it is a reason to keep the database itself well guarded rather than a
 * reason to pretend the number can be higher than the platform allows.
 */
const PBKDF2_ITERATIONS = 100_000;
const DERIVED_KEY_BITS = 256;
const CURRENT_VERSION = `pbkdf2-sha256-${PBKDF2_ITERATIONS}`;

/** Matches any PBKDF2 record and captures the iteration count it was made with. */
const PBKDF2_VERSION = /^pbkdf2-sha256-(\d+)$/;

/** Legacy single-pass SHA-256, retained only to verify and upgrade old rows. */
const LEGACY_VERSION = "sha256-v0";

/**
 * Salt used to burn an equivalent derivation when there is no stored record.
 *
 * The login route calls this function even when the email matched no user,
 * specifically so response time does not reveal whether an address is
 * registered. Returning early on a missing hash defeated that: a request for an
 * unknown address skipped ~100ms of PBKDF2 and came back measurably faster,
 * which is a user-enumeration oracle against a product whose logins are salon
 * owners' email addresses.
 *
 * The value is not secret and is never compared against anything. It exists only
 * so the work happens.
 */
const ABSENT_RECORD_SALT = "0000000000000000000000000000000000000000000000000000000000000000";

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

async function pbkdf2(password: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
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
  if (!stored.hash || !stored.salt) {
    // Deliberately not an early return: see ABSENT_RECORD_SALT. This also means
    // every login request exercises PBKDF2, so a deploy-time smoke check that
    // posts bad credentials and expects 401 will catch an iteration count the
    // runtime refuses — the failure mode that took production down on 27 Aug.
    await pbkdf2(password, ABSENT_RECORD_SALT);
    return { valid: false, needsUpgrade: false };
  }

  const version = stored.version ?? LEGACY_VERSION;

  let candidate: string;
  if (version === LEGACY_VERSION) {
    candidate = await legacySha256(password, stored.salt);
  } else {
    // Re-derive at the count the record was WRITTEN with, not the current one.
    // Reading the iteration count back out of the version string is what makes
    // the constant above safe to change: a hash written at another count still
    // verifies, and `needsUpgrade` re-writes it at the current count on the way
    // through. Deriving at the current count instead would silently reject every
    // existing password the moment the constant moved.
    const match = PBKDF2_VERSION.exec(version);
    if (!match) return { valid: false, needsUpgrade: false };
    const iterations = Number(match[1]);
    try {
      candidate = await pbkdf2(password, stored.salt, iterations);
    } catch {
      // A record written at a count this runtime will not compute — the 210,000
      // case above. Unverifiable is not the same as wrong, but there is nothing
      // better to return, and failing here beats a 500 on the login route.
      return { valid: false, needsUpgrade: false };
    }
  }

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
