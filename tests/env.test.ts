import { describe, expect, it } from "vitest";
import { envSchema } from "@/lib/env";

const base = { DATABASE_URL: "postgres://x" };

describe("model defaults per provider", () => {
  it("google: fast model with a lite fallback", () => {
    const e = envSchema.parse({ ...base });
    expect(e).toMatchObject({ CHAT_PROVIDER: "google", CHAT_MODEL: "gemini-2.5-flash", CHAT_MODEL_FALLBACK: "gemini-3.5-flash-lite" });
  });
  it("openai: no fallback, own judge model", () => {
    const e = envSchema.parse({ ...base, CHAT_PROVIDER: "openai" });
    expect(e).toMatchObject({ CHAT_MODEL: "gpt-4o-mini", CHAT_MODEL_FALLBACK: "none", JUDGE_MODEL: "gpt-4o" });
  });
  it("explicit values and empty strings: override wins, empty means unset", () => {
    const e = envSchema.parse({ ...base, CHAT_PROVIDER: "openai", CHAT_MODEL: "gpt-4o", CHAT_MODEL_FALLBACK: "", JUDGE_MODEL: "" });
    expect(e).toMatchObject({ CHAT_MODEL: "gpt-4o", CHAT_MODEL_FALLBACK: "none", JUDGE_MODEL: "gpt-4o" });
  });
});
