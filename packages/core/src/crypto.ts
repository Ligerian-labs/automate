/**
 * StepIQ Secret Vault — Encryption Module
 *
 * Implements the ENCRYPTION.md spec:
 * - 3-level key hierarchy: Master Key → User Key (HKDF) → DEK (envelope)
 * - AES-256-GCM for all encryption
 * - Binary ciphertext format v1
 * - Memory zeroing for key material
 *
 * SECURITY INVARIANTS:
 * 1. No plaintext at rest
 * 2. DEKs zeroed after use
 * 3. User keys derived deterministically (no storage)
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdf,
} from "node:crypto";

// ── Constants ──

const CIPHER = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const NONCE_LENGTH = 12; // 96 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const FORMAT_VERSION = 0x01;
const HKDF_INFO_PREFIX = "stepiq:user-key:";

// ── Binary layout ──
// [version:1][dekNonce:12][encryptedDek:32][dekTag:16][secretNonce:12][ciphertext:N][secretTag:16]
// Total overhead = 1 + 12 + 32 + 16 + 12 + 16 = 89 bytes

const HEADER_SIZE = 1 + NONCE_LENGTH + KEY_LENGTH + AUTH_TAG_LENGTH + NONCE_LENGTH;
// = 73 bytes before ciphertext

// ── Key Derivation ──

export function deriveUserKey(
  masterKey: Buffer,
  userId: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    hkdf(
      "sha256",
      masterKey,
      Buffer.alloc(0), // no salt — MK is already high-entropy
      `${HKDF_INFO_PREFIX}${userId}`,
      KEY_LENGTH,
      (err, derived) => {
        if (err) reject(err);
        else resolve(Buffer.from(derived));
      },
    );
  });
}

// ── Encrypt ──

export async function encryptSecret(
  userId: string,
  secretValue: string,
  masterKey: Buffer,
): Promise<Buffer> {
  if (!secretValue) throw new Error("Secret value cannot be empty");
  if (masterKey.length !== KEY_LENGTH)
    throw new Error(`Master key must be ${KEY_LENGTH} bytes`);

  // 1. Derive per-user key
  const userKey = await deriveUserKey(masterKey, userId);

  // 2. Generate random DEK
  const dek = randomBytes(KEY_LENGTH);

  // 3. Encrypt DEK with user key (envelope)
  const dekNonce = randomBytes(NONCE_LENGTH);
  const dekCipher = createCipheriv(CIPHER, userKey, dekNonce);
  const encryptedDek = Buffer.concat([
    dekCipher.update(dek),
    dekCipher.final(),
  ]);
  const dekTag = dekCipher.getAuthTag();

  // 4. Encrypt secret value with DEK
  const secretNonce = randomBytes(NONCE_LENGTH);
  const secretCipher = createCipheriv(CIPHER, dek, secretNonce);
  const ciphertext = Buffer.concat([
    secretCipher.update(Buffer.from(secretValue, "utf8")),
    secretCipher.final(),
  ]);
  const secretTag = secretCipher.getAuthTag();

  // 5. Zero out key material
  dek.fill(0);
  userKey.fill(0);

  // 6. Pack binary format
  return Buffer.concat([
    Buffer.from([FORMAT_VERSION]),
    dekNonce, // 12
    encryptedDek, // 32
    dekTag, // 16
    secretNonce, // 12
    ciphertext, // N
    secretTag, // 16
  ]);
}

// ── Decrypt ──

export async function decryptSecret(
  userId: string,
  encryptedBlob: Buffer,
  masterKey: Buffer,
): Promise<string> {
  if (encryptedBlob.length < HEADER_SIZE + AUTH_TAG_LENGTH)
    throw new Error("Ciphertext too short");
  if (masterKey.length !== KEY_LENGTH)
    throw new Error(`Master key must be ${KEY_LENGTH} bytes`);

  // 1. Parse binary format
  const version = encryptedBlob[0];
  if (version !== FORMAT_VERSION)
    throw new Error(`Unknown encryption format version: ${version}`);

  const o1 = 1;
  const o2 = o1 + NONCE_LENGTH;
  const o3 = o2 + KEY_LENGTH;
  const o4 = o3 + AUTH_TAG_LENGTH;
  const o5 = o4 + NONCE_LENGTH;
  const dekNonce = encryptedBlob.subarray(o1, o2);
  const encryptedDek = encryptedBlob.subarray(o2, o3);
  const dekTag = encryptedBlob.subarray(o3, o4);
  const secretNonce = encryptedBlob.subarray(o4, o5);
  const ciphertext = encryptedBlob.subarray(o5, encryptedBlob.length - AUTH_TAG_LENGTH);
  const secretTag = encryptedBlob.subarray(encryptedBlob.length - AUTH_TAG_LENGTH);

  // 2. Derive user key
  const userKey = await deriveUserKey(masterKey, userId);

  // 3. Decrypt DEK
  const dekDecipher = createDecipheriv(CIPHER, userKey, dekNonce);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([
    dekDecipher.update(encryptedDek),
    dekDecipher.final(),
  ]);

  // 4. Decrypt secret value
  const secretDecipher = createDecipheriv(CIPHER, dek, secretNonce);
  secretDecipher.setAuthTag(secretTag);
  const plaintext = Buffer.concat([
    secretDecipher.update(ciphertext),
    secretDecipher.final(),
  ]);

  // 5. Zero out key material
  dek.fill(0);
  userKey.fill(0);

  return plaintext.toString("utf8");
}

// ── Key Rotation ──

export async function reWrapSecret(
  userId: string,
  encryptedBlob: Buffer,
  oldMasterKey: Buffer,
  newMasterKey: Buffer,
): Promise<Buffer> {
  // Parse existing blob
  const version = encryptedBlob[0];
  if (version !== FORMAT_VERSION)
    throw new Error(`Unknown encryption format version: ${version}`);

  const r1 = 1;
  const r2 = r1 + NONCE_LENGTH;
  const r3 = r2 + KEY_LENGTH;
  const r4 = r3 + AUTH_TAG_LENGTH;
  const dekNonce = encryptedBlob.subarray(r1, r2);
  const encryptedDek = encryptedBlob.subarray(r2, r3);
  const dekTag = encryptedBlob.subarray(r3, r4);
  const rest = encryptedBlob.subarray(r4); // secretNonce + ciphertext + secretTag

  // Decrypt DEK with old key
  const oldUserKey = await deriveUserKey(oldMasterKey, userId);
  const dekDecipher = createDecipheriv(CIPHER, oldUserKey, dekNonce);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([
    dekDecipher.update(encryptedDek),
    dekDecipher.final(),
  ]);
  oldUserKey.fill(0);

  // Re-encrypt DEK with new key
  const newUserKey = await deriveUserKey(newMasterKey, userId);
  const newDekNonce = randomBytes(NONCE_LENGTH);
  const dekCipher = createCipheriv(CIPHER, newUserKey, newDekNonce);
  const newEncryptedDek = Buffer.concat([
    dekCipher.update(dek),
    dekCipher.final(),
  ]);
  const newDekTag = dekCipher.getAuthTag();
  dek.fill(0);
  newUserKey.fill(0);

  return Buffer.concat([
    Buffer.from([FORMAT_VERSION]),
    newDekNonce,
    newEncryptedDek,
    newDekTag,
    rest,
  ]);
}

// ── Log Redaction ──

export function redactSecrets(
  text: string,
  secretValues?: string[],
): string {
  // Redact {{env.xxx}} patterns
  let redacted = text.replace(/\{\{env\.\w+\}\}/g, "[REDACTED]");
  // Redact actual secret values if known
  if (secretValues) {
    for (const value of secretValues) {
      if (value.length >= 4) {
        redacted = redacted.replaceAll(value, "[REDACTED]");
      }
    }
  }
  return redacted;
}

// ── Exports ──

export {
  KEY_LENGTH,
  NONCE_LENGTH,
  AUTH_TAG_LENGTH,
  FORMAT_VERSION,
  HEADER_SIZE,
};
