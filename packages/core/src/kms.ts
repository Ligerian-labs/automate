/**
 * KMS Provider — Master Key Management
 *
 * Supports:
 * - HashiCorp Vault (production)
 * - Environment variable (dev/self-hosted)
 */

import { KEY_LENGTH } from "./crypto.js";

export interface KmsProvider {
  getMasterKey(version?: number): Promise<Buffer>;
}

// ── HashiCorp Vault ──

export class VaultKmsProvider implements KmsProvider {
  private endpoint: string;
  private token: string;
  private secretPath: string;
  private cachedKey: Buffer | null = null;

  constructor(opts?: {
    endpoint?: string;
    token?: string;
    secretPath?: string;
  }) {
    this.endpoint = opts?.endpoint || process.env.VAULT_ADDR || "http://127.0.0.1:8200";
    this.token = opts?.token || process.env.VAULT_TOKEN || "";
    this.secretPath = opts?.secretPath || "secret/data/stepiq/master-key";

    if (!this.token) {
      throw new Error("VAULT_TOKEN is required for Vault KMS provider");
    }
  }

  async getMasterKey(_version?: number): Promise<Buffer> {
    if (this.cachedKey) return this.cachedKey;

    const url = `${this.endpoint}/v1/${this.secretPath}`;
    const response = await fetch(url, {
      headers: { "X-Vault-Token": this.token },
    });

    if (!response.ok) {
      throw new Error(
        `Vault error (${response.status}): ${await response.text()}`,
      );
    }

    const json = (await response.json()) as {
      data?: { data?: { key?: string } };
    };
    const hexKey = json?.data?.data?.key;
    if (!hexKey) {
      throw new Error(`Master key not found at Vault path: ${this.secretPath}`);
    }

    const key = Buffer.from(hexKey, "hex");
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `Master key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars), got ${key.length}`,
      );
    }

    this.cachedKey = key;
    return key;
  }
}

// ── Environment Variable (Dev Only) ──

export class EnvKmsProvider implements KmsProvider {
  private key: Buffer;

  constructor(envVar?: string) {
    const hex = process.env[envVar || "STEPIQ_MASTER_KEY"];
    if (!hex) {
      throw new Error(
        `${envVar || "STEPIQ_MASTER_KEY"} env var is required (${KEY_LENGTH * 2} hex chars)`,
      );
    }
    this.key = Buffer.from(hex, "hex");
    if (this.key.length !== KEY_LENGTH) {
      throw new Error(
        `Master key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars), got ${this.key.length}`,
      );
    }
  }

  async getMasterKey(_version?: number): Promise<Buffer> {
    return this.key;
  }
}

// ── Factory ──

export function createKmsProvider(): KmsProvider {
  if (process.env.VAULT_ADDR && process.env.VAULT_TOKEN) {
    return new VaultKmsProvider();
  }
  if (process.env.STEPIQ_MASTER_KEY) {
    return new EnvKmsProvider();
  }
  throw new Error(
    "No KMS provider configured. Set VAULT_ADDR+VAULT_TOKEN (Vault) or STEPIQ_MASTER_KEY (dev).",
  );
}
