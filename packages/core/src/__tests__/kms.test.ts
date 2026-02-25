import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EnvKmsProvider, VaultKmsProvider, createKmsProvider, KEY_LENGTH } from "../index.js";
import { randomBytes } from "node:crypto";

describe("EnvKmsProvider", () => {
  const validHex = randomBytes(KEY_LENGTH).toString("hex");

  beforeEach(() => {
    Reflect.deleteProperty(process.env, "STEPIQ_MASTER_KEY");
  });

  it("reads master key from env var", async () => {
    process.env.STEPIQ_MASTER_KEY = validHex;
    const provider = new EnvKmsProvider();
    const key = await provider.getMasterKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(KEY_LENGTH);
    expect(key.toString("hex")).toBe(validHex);
  });

  it("throws if env var is missing", () => {
    expect(() => new EnvKmsProvider()).toThrow("STEPIQ_MASTER_KEY env var is required");
  });

  it("throws if key is wrong length", () => {
    process.env.STEPIQ_MASTER_KEY = "aabbcc"; // 3 bytes, not 32
    expect(() => new EnvKmsProvider()).toThrow("must be 32 bytes");
  });

  it("supports custom env var name", async () => {
    process.env.MY_CUSTOM_KEY = validHex;
    const provider = new EnvKmsProvider("MY_CUSTOM_KEY");
    const key = await provider.getMasterKey();
    expect(key.length).toBe(KEY_LENGTH);
    Reflect.deleteProperty(process.env, "MY_CUSTOM_KEY");
  });
});

describe("VaultKmsProvider", () => {
  it("throws if VAULT_TOKEN is missing", () => {
    expect(
      () => new VaultKmsProvider({ endpoint: "http://localhost:8200", token: "" }),
    ).toThrow("VAULT_TOKEN is required");
  });

  it("constructs with valid config", () => {
    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test-token",
      secretPath: "secret/data/test",
    });
    expect(provider).toBeDefined();
  });

  it("fetches key from Vault API", async () => {
    const validHex = randomBytes(KEY_LENGTH).toString("hex");

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { data: { key: validHex } } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    const key = await provider.getMasterKey();
    expect(key.length).toBe(KEY_LENGTH);
    expect(key.toString("hex")).toBe(validHex);

    // Verify correct API call
    expect(mockFetch).toHaveBeenCalledWith(
      "http://vault:8200/v1/secret/data/stepiq/master-key",
      { headers: { "X-Vault-Token": "hvs.test" } },
    );

    vi.unstubAllGlobals();
  });

  it("caches the master key after first fetch", async () => {
    const validHex = randomBytes(KEY_LENGTH).toString("hex");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { data: { key: validHex } } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    await provider.getMasterKey();
    await provider.getMasterKey();
    expect(mockFetch).toHaveBeenCalledTimes(1); // cached

    vi.unstubAllGlobals();
  });

  it("throws on Vault API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "permission denied",
    }));

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "bad-token",
    });
    await expect(provider.getMasterKey()).rejects.toThrow("Vault error (403)");

    vi.unstubAllGlobals();
  });

  it("throws if key not found in Vault response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { data: {} } }),
    }));

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    await expect(provider.getMasterKey()).rejects.toThrow("Master key not found");

    vi.unstubAllGlobals();
  });

  it("throws if key from Vault is wrong length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { data: { key: "aabb" } } }),
    }));

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    await expect(provider.getMasterKey()).rejects.toThrow("must be 32 bytes");

    vi.unstubAllGlobals();
  });
});

describe("createKmsProvider factory", () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, "VAULT_ADDR");
    Reflect.deleteProperty(process.env, "VAULT_TOKEN");
    Reflect.deleteProperty(process.env, "STEPIQ_MASTER_KEY");
  });

  it("returns VaultKmsProvider when Vault env vars are set", () => {
    process.env.VAULT_ADDR = "http://vault:8200";
    process.env.VAULT_TOKEN = "hvs.test";
    const provider = createKmsProvider();
    expect(provider).toBeInstanceOf(VaultKmsProvider);
  });

  it("returns EnvKmsProvider when STEPIQ_MASTER_KEY is set", () => {
    process.env.STEPIQ_MASTER_KEY = randomBytes(KEY_LENGTH).toString("hex");
    const provider = createKmsProvider();
    expect(provider).toBeInstanceOf(EnvKmsProvider);
  });

  it("prefers Vault over env var when both are set", () => {
    process.env.VAULT_ADDR = "http://vault:8200";
    process.env.VAULT_TOKEN = "hvs.test";
    process.env.STEPIQ_MASTER_KEY = randomBytes(KEY_LENGTH).toString("hex");
    const provider = createKmsProvider();
    expect(provider).toBeInstanceOf(VaultKmsProvider);
  });

  it("throws when nothing is configured", () => {
    expect(() => createKmsProvider()).toThrow("No KMS provider configured");
  });
});
