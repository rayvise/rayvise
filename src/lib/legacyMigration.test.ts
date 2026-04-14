import { describe, expect, it, vi } from "vitest";
import {
  applyLegacyValuesToStorage,
  migrateLegacyLocalStorage,
  runLegacyMigrations,
} from "./legacyMigration";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

function createStorage(initialEntries: Record<string, string> = {}) {
  const data = new Map(Object.entries(initialEntries));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    dump: () => Object.fromEntries(data.entries()),
  };
}

describe("migrateLegacyLocalStorage", () => {
  it("copies legacy keys when new keys are missing", () => {
    const storage = createStorage({
      "raypaste-settings": '{"themeMode":"dark"}',
      "raypaste-prompts": '{"prompts":[{"id":"p1"}]}',
      "raypaste-apps": '{"hiddenAppBundleIds":["com.example.app"]}',
    });

    migrateLegacyLocalStorage(storage);

    expect(storage.dump()).toMatchObject({
      "rayvise-settings": '{"themeMode":"dark"}',
      "rayvise-prompts": '{"prompts":[{"id":"p1"}]}',
      "rayvise-apps": '{"hiddenAppBundleIds":["com.example.app"]}',
    });
  });

  it("does not overwrite existing rayvise keys", () => {
    const storage = createStorage({
      "raypaste-settings": '{"themeMode":"dark"}',
      "rayvise-settings": '{"themeMode":"light"}',
    });

    migrateLegacyLocalStorage(storage);

    expect(storage.dump()).toMatchObject({
      "raypaste-settings": '{"themeMode":"dark"}',
      "rayvise-settings": '{"themeMode":"light"}',
    });
  });

  it("overwrites pristine rayvise keys with legacy data", () => {
    const storage = createStorage({
      "raypaste-prompts":
        '{"state":{"prompts":[{"id":"p1"}],"websitePromptSites":[],"defaultPromptId":null},"version":0}',
      "rayvise-prompts":
        '{"state":{"prompts":[],"websitePromptSites":[],"defaultPromptId":null},"version":0}',
    });

    migrateLegacyLocalStorage(storage);

    expect(storage.dump()).toMatchObject({
      "rayvise-prompts":
        '{"state":{"prompts":[{"id":"p1"}],"websitePromptSites":[],"defaultPromptId":null},"version":0}',
    });
  });
});

describe("applyLegacyValuesToStorage", () => {
  it("returns whether it wrote any migrated values", () => {
    const storage = createStorage({
      "rayvise-apps":
        '{"state":{"hiddenAppBundleIds":[]},"version":0}',
    });

    const didWrite = applyLegacyValuesToStorage(storage, {
      "raypaste-apps":
        '{"state":{"hiddenAppBundleIds":["com.example.app"]},"version":0}',
    });

    expect(didWrite).toBe(true);
    expect(storage.dump()).toMatchObject({
      "rayvise-apps":
        '{"state":{"hiddenAppBundleIds":["com.example.app"]},"version":0}',
    });
  });
});

describe("runLegacyMigrations", () => {
  it("migrates the browser localStorage", async () => {
    const localStorage = createStorage({
      "raypaste-prompts": '{"prompts":[{"id":"p1"}]}',
    });

    invokeMock.mockResolvedValue({});
    vi.stubGlobal("window", { localStorage });

    await runLegacyMigrations();

    expect(localStorage.dump()).toMatchObject({
      "rayvise-prompts": '{"prompts":[{"id":"p1"}]}',
    });
  });

  it("hydrates current localStorage from native legacy values", async () => {
    const localStorage = createStorage({
      "rayvise-settings":
        '{"state":{"mode":"direct","openrouterApiKey":"","cerebrasApiKey":"","openaiApiKey":"","reviewMode":false,"themeMode":"auto"},"version":0}',
    });

    invokeMock.mockResolvedValue({
      "raypaste-settings":
        '{"state":{"mode":"direct","openrouterApiKey":"secret","cerebrasApiKey":"","openaiApiKey":"","reviewMode":true,"themeMode":"dark"},"version":0}',
      "raypaste-prompts":
        '{"state":{"prompts":[{"id":"p1"}],"websitePromptSites":[{"id":"s1"}],"defaultPromptId":"p1"},"version":0}',
    });
    vi.stubGlobal("window", { localStorage });

    await runLegacyMigrations();

    expect(localStorage.dump()).toMatchObject({
      "rayvise-settings":
        '{"state":{"mode":"direct","openrouterApiKey":"secret","cerebrasApiKey":"","openaiApiKey":"","reviewMode":true,"themeMode":"dark"},"version":0}',
      "rayvise-prompts":
        '{"state":{"prompts":[{"id":"p1"}],"websitePromptSites":[{"id":"s1"}],"defaultPromptId":"p1"},"version":0}',
    });
  });
});
