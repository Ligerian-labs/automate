import { describe, it, expect } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  encryptSecret,
  decryptSecret,
  deriveUserKey,
  reWrapSecret,
  redactSecrets,
  KEY_LENGTH,
  FORMAT_VERSION,
  HEADER_SIZE,
} from "../crypto.js";

// Generate a fresh master key for tests
const TEST_MK = randomBytes(KEY_LENGTH);
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_USER_ID_2 = "660e8400-e29b-41d4-a716-446655440001";

describe("deriveUserKey", () => {
  it("derives a 32-byte key from master key + userId", async () => {
    const uk = await deriveUserKey(TEST_MK, TEST_USER_ID);
    expect(uk).toBeInstanceOf(Buffer);
    expect(uk.length).toBe(KEY_LENGTH);
  });

  it("is deterministic — same inputs produce same key", async () => {
    const uk1 = await deriveUserKey(TEST_MK, TEST_USER_ID);
    const uk2 = await deriveUserKey(TEST_MK, TEST_USER_ID);
    expect(uk1.equals(uk2)).toBe(true);
  });

  it("different userIds produce different keys", async () => {
    const uk1 = await deriveUserKey(TEST_MK, TEST_USER_ID);
    const uk2 = await deriveUserKey(TEST_MK, TEST_USER_ID_2);
    expect(uk1.equals(uk2)).toBe(false);
  });

  it("different master keys produce different keys", async () => {
    const mk2 = randomBytes(KEY_LENGTH);
    const uk1 = await deriveUserKey(TEST_MK, TEST_USER_ID);
    const uk2 = await deriveUserKey(mk2, TEST_USER_ID);
    expect(uk1.equals(uk2)).toBe(false);
  });
});

describe("encryptSecret", () => {
  it("returns a Buffer", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "my-secret", TEST_MK);
    expect(blob).toBeInstanceOf(Buffer);
  });

  it("starts with version byte 0x01", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "my-secret", TEST_MK);
    expect(blob[0]).toBe(FORMAT_VERSION);
  });

  it("blob size = HEADER_SIZE + secret length + 16 (tag)", async () => {
    const secret = "hello";
    const blob = await encryptSecret(TEST_USER_ID, secret, TEST_MK);
    expect(blob.length).toBe(HEADER_SIZE + secret.length + 16);
  });

  it("produces different ciphertext each time (random nonces)", async () => {
    const blob1 = await encryptSecret(TEST_USER_ID, "same-secret", TEST_MK);
    const blob2 = await encryptSecret(TEST_USER_ID, "same-secret", TEST_MK);
    expect(blob1.equals(blob2)).toBe(false);
  });

  it("rejects empty secret value", async () => {
    expect(encryptSecret(TEST_USER_ID, "", TEST_MK)).rejects.toThrow(
      "Secret value cannot be empty",
    );
  });

  it("rejects wrong master key length", async () => {
    expect(
      encryptSecret(TEST_USER_ID, "secret", Buffer.alloc(16)),
    ).rejects.toThrow("Master key must be 32 bytes");
  });

  it("handles unicode secrets", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "clé secrète 🔑", TEST_MK);
    expect(blob.length).toBeGreaterThan(HEADER_SIZE + 16);
  });

  it("handles large secrets (10KB)", async () => {
    const largeSecret = "x".repeat(10_000);
    const blob = await encryptSecret(TEST_USER_ID, largeSecret, TEST_MK);
    expect(blob.length).toBe(HEADER_SIZE + largeSecret.length + 16);
  });
});

describe("decryptSecret", () => {
  it("round-trips: encrypt then decrypt returns original", async () => {
    const secret = "sk-proj-abc123xyz";
    const blob = await encryptSecret(TEST_USER_ID, secret, TEST_MK);
    const decrypted = await decryptSecret(TEST_USER_ID, blob, TEST_MK);
    expect(decrypted).toBe(secret);
  });

  it("round-trips unicode", async () => {
    const secret = "Clé d'API: 日本語テスト 🔐";
    const blob = await encryptSecret(TEST_USER_ID, secret, TEST_MK);
    const decrypted = await decryptSecret(TEST_USER_ID, blob, TEST_MK);
    expect(decrypted).toBe(secret);
  });

  it("round-trips large secrets", async () => {
    const secret = randomBytes(5000).toString("hex");
    const blob = await encryptSecret(TEST_USER_ID, secret, TEST_MK);
    const decrypted = await decryptSecret(TEST_USER_ID, blob, TEST_MK);
    expect(decrypted).toBe(secret);
  });

  it("fails with wrong master key", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    const wrongMK = randomBytes(KEY_LENGTH);
    expect(decryptSecret(TEST_USER_ID, blob, wrongMK)).rejects.toThrow();
  });

  it("fails with wrong userId (different user key)", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    expect(
      decryptSecret(TEST_USER_ID_2, blob, TEST_MK),
    ).rejects.toThrow();
  });

  it("fails with tampered ciphertext", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    blob[blob.length - 20] ^= 0xff;
    expect(decryptSecret(TEST_USER_ID, blob, TEST_MK)).rejects.toThrow();
  });

  it("fails with tampered DEK envelope", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    blob[15] ^= 0xff;
    expect(decryptSecret(TEST_USER_ID, blob, TEST_MK)).rejects.toThrow();
  });

  it("fails with tampered version byte", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    blob[0] = 0x99;
    expect(decryptSecret(TEST_USER_ID, blob, TEST_MK)).rejects.toThrow(
      "Unknown encryption format version",
    );
  });

  it("fails with truncated blob", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    const truncated = blob.subarray(0, 50);
    expect(
      decryptSecret(TEST_USER_ID, truncated, TEST_MK),
    ).rejects.toThrow("Ciphertext too short");
  });

  it("rejects wrong master key length", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    expect(
      decryptSecret(TEST_USER_ID, blob, Buffer.alloc(16)),
    ).rejects.toThrow("Master key must be 32 bytes");
  });
});

describe("reWrapSecret (key rotation)", () => {
  it("re-wraps DEK with new master key, secret still decrypts", async () => {
    const secret = "rotate-me-please";
    const oldMK = TEST_MK;
    const newMK = randomBytes(KEY_LENGTH);

    const blob = await encryptSecret(TEST_USER_ID, secret, oldMK);
    const rotated = await reWrapSecret(TEST_USER_ID, blob, oldMK, newMK);

    const decrypted = await decryptSecret(TEST_USER_ID, rotated, newMK);
    expect(decrypted).toBe(secret);

    expect(decryptSecret(TEST_USER_ID, rotated, oldMK)).rejects.toThrow();
  });

  it("old blob still works with old key after rotation", async () => {
    const secret = "still-old";
    const oldMK = TEST_MK;
    const newMK = randomBytes(KEY_LENGTH);

    const blob = await encryptSecret(TEST_USER_ID, secret, oldMK);
    await reWrapSecret(TEST_USER_ID, blob, oldMK, newMK);

    const decrypted = await decryptSecret(TEST_USER_ID, blob, oldMK);
    expect(decrypted).toBe(secret);
  });

  it("preserves secret ciphertext (only DEK envelope changes)", async () => {
    const secret = "check-ciphertext-unchanged";
    const oldMK = TEST_MK;
    const newMK = randomBytes(KEY_LENGTH);

    const blob = await encryptSecret(TEST_USER_ID, secret, oldMK);
    const rotated = await reWrapSecret(TEST_USER_ID, blob, oldMK, newMK);

    const dekEnvelopeEnd = 1 + 12 + 32 + 16;
    const originalRest = blob.subarray(dekEnvelopeEnd);
    const rotatedRest = rotated.subarray(dekEnvelopeEnd);
    expect(originalRest.equals(rotatedRest)).toBe(true);
  });

  it("fails with wrong old master key", async () => {
    const blob = await encryptSecret(TEST_USER_ID, "secret", TEST_MK);
    const wrongOldMK = randomBytes(KEY_LENGTH);
    const newMK = randomBytes(KEY_LENGTH);
    expect(
      reWrapSecret(TEST_USER_ID, blob, wrongOldMK, newMK),
    ).rejects.toThrow();
  });
});

describe("redactSecrets", () => {
  it("redacts {{env.xxx}} patterns", () => {
    const text = "Using key {{env.OPENAI_KEY}} for model";
    expect(redactSecrets(text)).toBe("Using key [REDACTED] for model");
  });

  it("redacts multiple patterns", () => {
    const text = "{{env.A}} and {{env.B}}";
    expect(redactSecrets(text)).toBe("[REDACTED] and [REDACTED]");
  });

  it("redacts known secret values", () => {
    const text = "The key is sk-abc123 right?";
    expect(redactSecrets(text, ["sk-abc123"])).toBe(
      "The key is [REDACTED] right?",
    );
  });

  it("handles empty text", () => {
    expect(redactSecrets("")).toBe("");
  });

  it("handles text with no secrets", () => {
    expect(redactSecrets("hello world")).toBe("hello world");
  });

  it("skips very short secret values (< 4 chars) to avoid false positives", () => {
    const text = "a = 1";
    expect(redactSecrets(text, ["1"])).toBe("a = 1");
  });

  it("redacts all occurrences of a secret value", () => {
    const text = "key=abc123 and again abc123";
    expect(redactSecrets(text, ["abc123"])).toBe(
      "key=[REDACTED] and again [REDACTED]",
    );
  });
});

describe("user isolation", () => {
  it("user A cannot decrypt user B secrets", async () => {
    const userA = "aaaa0000-0000-0000-0000-000000000001";
    const userB = "bbbb0000-0000-0000-0000-000000000002";

    const blob = await encryptSecret(userA, "user-a-secret", TEST_MK);
    expect(decryptSecret(userB, blob, TEST_MK)).rejects.toThrow();
  });

  it("each user has a unique derived key", async () => {
    const userA = "aaaa0000-0000-0000-0000-000000000001";
    const userB = "bbbb0000-0000-0000-0000-000000000002";

    const ukA = await deriveUserKey(TEST_MK, userA);
    const ukB = await deriveUserKey(TEST_MK, userB);
    expect(ukA.equals(ukB)).toBe(false);
  });
});

describe("crypto-shredding", () => {
  it("deleting secrets makes data unrecoverable (simulated)", async () => {
    const secret = "shred-me";
    const blob = await encryptSecret(TEST_USER_ID, secret, TEST_MK);
    blob.fill(0);
    expect(
      decryptSecret(TEST_USER_ID, blob, TEST_MK),
    ).rejects.toThrow();
  });
});
