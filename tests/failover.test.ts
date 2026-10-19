import { beforeEach, describe, expect, it, vi } from "vitest";

const doStreamPrimary = vi.fn();
const doStreamFallback = vi.fn();

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    CHAT_PROVIDER: "google",
    CHAT_MODEL: "gemini-2.5-flash",
    CHAT_MODEL_FALLBACK: "gemini-3.5-flash-lite",
    JUDGE_MODEL: "gemini-3.5-flash",
    GOOGLE_GENERATIVE_AI_API_KEY: "test",
  }),
}));
vi.mock("@ai-sdk/google", () => ({
  google: (id: string) => ({
    specificationVersion: "v4",
    provider: "google",
    modelId: id,
    supportedUrls: {},
    doGenerate: vi.fn(),
    doStream: (p: unknown) => (id === "gemini-2.5-flash" ? doStreamPrimary(p) : doStreamFallback(p)),
  }),
}));

import { chatProviderOptions, getChatModel, googleThinkingOptions, isProviderBusy } from "@/lib/ai/models";

const call = { prompt: [], providerOptions: chatProviderOptions("gemini-2.5-flash") };

describe("isProviderBusy", () => {
  it("recognises quota / overload errors", () => {
    expect(isProviderBusy(new Error("You exceeded your current quota"))).toBe(true);
    expect(isProviderBusy(new Error("Quota exceeded ... RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isProviderBusy(new Error("This model is currently experiencing high demand (503)"))).toBe(true);
  });
  it("does not treat other errors as busy", () => {
    expect(isProviderBusy(new Error("Invalid API key"))).toBe(false);
    expect(isProviderBusy(new Error("bad request"))).toBe(false);
  });
});

describe("thinking options", () => {
  it("minimal level for 3.x, budget 0 for 2.5, nothing for others", () => {
    expect(googleThinkingOptions("gemini-3.5-flash-lite")).toEqual({ google: { thinkingConfig: { thinkingLevel: "minimal" } } });
    expect(googleThinkingOptions("gemini-2.5-flash")).toEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } });
    expect(googleThinkingOptions("other")).toBeUndefined();
  });
});

describe("chat model failover", () => {
  beforeEach(() => {
    doStreamPrimary.mockReset();
    doStreamFallback.mockReset();
  });

  // biome-ignore lint: test helper reaching into the wrapped model
  const model = () => getChatModel() as unknown as { doStream: (p: typeof call) => Promise<unknown> };

  it("uses the primary model when it works", async () => {
    doStreamPrimary.mockResolvedValue("primary-stream");
    expect(await model().doStream(call)).toBe("primary-stream");
    expect(doStreamFallback).not.toHaveBeenCalled();
  });

  it("fails over to the fallback on a quota error and swaps the thinking options", async () => {
    doStreamPrimary.mockRejectedValue(new Error("You exceeded your current quota"));
    doStreamFallback.mockResolvedValue("fallback-stream");
    expect(await model().doStream(call)).toBe("fallback-stream");
    expect(doStreamFallback).toHaveBeenCalledWith(
      expect.objectContaining({ providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } } }),
    );
  });

  it("does not fail over for non-quota errors", async () => {
    doStreamPrimary.mockRejectedValue(new Error("Invalid API key"));
    await expect(model().doStream(call)).rejects.toThrow("Invalid API key");
    expect(doStreamFallback).not.toHaveBeenCalled();
  });
});
