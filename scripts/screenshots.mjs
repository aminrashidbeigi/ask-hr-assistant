// Captures README screenshots with Playwright. Usage: node scripts/screenshots.mjs [empty|chat|admin|all]
// Needs the dev server on :3112 (pnpm dev -p 3112). "chat" talks to the real model.
import { chromium } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" }); // ADMIN_USER / ADMIN_PASSWORD for the /admin screenshot

const BASE = process.env.BASE_URL ?? "http://localhost:3112";
const what = process.argv[2] ?? "all";
const out = (name) => `docs/screenshots/${name}.png`;

const browser = await chromium.launch();

if (what === "empty" || what === "all") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE);
  await page.getByText("How can I help?").waitFor();
  await page.screenshot({ path: out("home-empty") });
  const phone = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await phone.goto(BASE);
  await phone.getByText("How can I help?").waitFor();
  await phone.screenshot({ path: out("home-mobile") });
}

if (what === "admin" || what === "all") {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) throw new Error("Set ADMIN_USER and ADMIN_PASSWORD in .env.local");
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    httpCredentials: { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`);
  await page.getByText("Ask HR — metrics").waitFor();
  await page.screenshot({ path: out("admin"), fullPage: true });
}

if (what === "chat") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE);
  await page.getByLabel("Employee group").click();
  await page.getByRole("option", { name: /Shift/ }).click();
  await page.getByLabel("Your question").fill("Wie hoch ist der Nachtzuschlag?");
  await page.getByRole("button", { name: /Send/ }).click();
  const answer = page.getByTestId("assistant-message").last();
  await answer.getByTestId("citation").first().waitFor({ timeout: 120_000 });
  await page.getByTestId("feedback").waitFor({ timeout: 60_000 });
  await answer.getByTestId("citation").first().click();
  await page.screenshot({ path: out("chat-sources") });
}

await browser.close();
console.log("done:", what);
