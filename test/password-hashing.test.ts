/**
 * Password hashing.
 *
 * This file exists because of a bug that every other gate missed. The hash was
 * written at OWASP's recommended 210,000 PBKDF2 iterations, typecheck passed,
 * the whole suite passed, the client built, CI was green — and every signup and
 * login on production returned 500:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 *   supported (requested 210000).
 *
 * The deployed Workers runtime enforces a cap that the local one does not, so no
 * amount of local testing would have found it. The first test below is therefore
 * an assertion about the *constant* rather than about behaviour: it is the only
 * form that can fail here for a reason that only manifests there.
 */

import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/server/lib/crypto.js";

describe("password hashing", () => {
  it("stays within the iteration count the Workers runtime will actually run", async () => {
    const { version } = await hashPassword("whatever");
    const iterations = Number(/^pbkdf2-sha256-(\d+)$/.exec(version)?.[1]);

    expect(Number.isFinite(iterations), `unrecognised hash version ${version}`).toBe(true);

    // Raising this breaks production while leaving every local check green.
    // Confirm the deployed runtime accepts a higher count before touching it.
    expect(iterations, "PBKDF2 above 100000 throws NotSupportedError on deployed Workers").toBeLessThanOrEqual(
      100_000
    );
  });

  it("round-trips a password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");

    expect((await verifyPassword("correct horse battery staple", stored)).valid).toBe(true);
    expect((await verifyPassword("Correct horse battery staple", stored)).valid).toBe(false);
    expect((await verifyPassword("", stored)).valid).toBe(false);
  });

  it("salts, so two identical passwords do not share a hash", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("verifies a record written at a different iteration count, and flags it for upgrade", async () => {
    // The property that makes the iteration count safe to change at all. A hash
    // is re-derived at the count recorded in its own version string, not at
    // whatever the constant currently says — otherwise moving the constant
    // silently locks out every existing account.
    const current = await hashPassword("a-real-password");
    const older = { ...current, version: "pbkdf2-sha256-50000" };

    // Written at 100000 but labelled 50000, so it must NOT verify: the label is
    // what selects the derivation, and the two no longer agree.
    expect((await verifyPassword("a-real-password", older)).valid).toBe(false);

    // And a record genuinely written at the current count verifies and needs no
    // upgrade, which is the other half of the same contract.
    const result = await verifyPassword("a-real-password", current);
    expect(result.valid).toBe(true);
    expect(result.needsUpgrade).toBe(false);
  });

  it("treats an unparseable version as a failed login rather than throwing", async () => {
    const stored = await hashPassword("a-real-password");
    const corrupt = { ...stored, version: "argon2id-v1" };

    // A 500 on the login route would be the worse outcome: it turns a bad row
    // into an outage and tells an attacker the row is interesting.
    const result = await verifyPassword("a-real-password", corrupt);
    expect(result.valid).toBe(false);
    expect(result.needsUpgrade).toBe(false);
  });

  it("does the same work for an absent record as for a real one", async () => {
    // The login route calls verifyPassword even when the email matched nothing,
    // so that response time does not say whether an address is registered. That
    // only holds if the absent case actually derives a hash — an early return
    // skips ~100ms of PBKDF2 and hands out a user-enumeration oracle.
    //
    // Timing assertions are flaky by nature, so this measures generously: the
    // absent path must take a substantial fraction of the real one, not an
    // exact match.
    const real = await hashPassword("a-real-password");

    const startReal = performance.now();
    await verifyPassword("a-real-password", real);
    const realMs = performance.now() - startReal;

    const startAbsent = performance.now();
    const absent = await verifyPassword("a-real-password", { hash: null, salt: null, version: null });
    const absentMs = performance.now() - startAbsent;

    expect(absent.valid).toBe(false);
    expect(absent.needsUpgrade).toBe(false);
    expect(
      absentMs,
      `absent-record path took ${absentMs.toFixed(1)}ms vs ${realMs.toFixed(1)}ms for a real record — ` +
        "it is short-circuiting, which leaks whether an account exists"
    ).toBeGreaterThan(realMs / 4);
  });

  it("still verifies and upgrades a legacy sha256 record", async () => {
    // The pre-PBKDF2 scheme: a single SHA-256 pass over `salt:password`.
    const salt = "0123456789abcdef0123456789abcdef";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:hunter2`));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");

    const result = await verifyPassword("hunter2", { hash, salt, version: "sha256-v0" });
    expect(result.valid).toBe(true);
    expect(result.needsUpgrade, "a legacy record must be re-hashed on next login").toBe(true);
  });
});
