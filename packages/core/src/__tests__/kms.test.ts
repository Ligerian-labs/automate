import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { EnvKmsProvider, VaultKmsProvider, createKmsProvider, KEY_LENGTH } from "../index.js";
import { randomBytes } from "node:crypto";

describe("EnvKmsProvider", () => {
  const validHex = randomBytes(KEY_LENGTH).toString("hex");

  beforeEach(() => {
    delete process.env.STEPIQ_MASTER_KEY;
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
    process.env.STEPIQ_MASTER_KEY = "aabbcc";
    expect(() => new EnvKmsProvider()).toThrow("must be 32 bytes");
  });

  it("supports custom env var name", async () => {
    process.env.MY_CUSTOM_KEY = validHex;
    const provider = new EnvKmsProvider("MY_CUSTOM_KEY");
    const key = await provider.getMasterKey();
    expect(key.length).toBe(KEY_LENGTH);
    delete process.env.MY_CUSTOM_KEY;
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
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ data: { data: { key: validHex } } }), { status: 200 })
    ) as typeof fetch;

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    const key = await provider.getMasterKey();
    expect(key.length).toBe(KEY_LENGTH);
    expect(key.toString("hex")).toBe(validHex);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://vault:8200/v1/secret/data/stepiq/master-key",
      { headers: { "X-Vault-Token": "hvs.test" } },
    );

    globalThis.fetch = originalFetch;
  });

  it("caches the master key after first fetch", async () => {
    const validHex = randomBytes(KEY_LENGTH).toString("hex");
    const originalFetch = globalThis.fetch;

    const mockFetch = mock(async () =>
      new Response(JSON.stringify({ data: { data: { key: validHex } } }), { status: 200 })
    ) as typeof fetch;
    globalThis.fetch = mockFetch;

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    await provider.getMasterKey();
    await provider.getMasterKey();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });

  it("throws on Vault API error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response("permission denied", { status: 403 })
    ) as typeof fetch;

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "bad-token",
    });
    expect(provider.getMasterKey()).rejects.toThrow("Vault error (403)");

    globalThis.fetch = originalFetch;
  });

  it("throws if key not found in Vault response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ data: { data: {} } }), { status: 200 })
    ) as typeof fetch;

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    expect(provider.getMasterKey()).rejects.toThrow("Master key not found");

    globalThis.fetch = originalFetch;
  });

  it("throws if key from Vault is wrong length", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ data: { data: { key: "aabb" } } }), { status: 200 })
    ) as typeof fetch;

    const provider = new VaultKmsProvider({
      endpoint: "http://vault:8200",
      token: "hvs.test",
    });
    expect(provider.getMasterKey()).rejects.toThrow("must be 32 bytes");

    globalThis.fetch = originalFetch;
  });
});

describe("createKmsProvider factory", () => {
  afterEach(() => {
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.STEPIQ_MASTER_KEY;
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
