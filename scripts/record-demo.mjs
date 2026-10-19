// Records docs/demo.gif (~20 s): DE question → cited answer → click a source → switch persona → different
// answer → unanswerable → "Contact HR". Drives the real UI with Playwright and encodes frames in pure JS.
//
//   node scripts/record-demo.mjs          needs the dev server on :3112 and a working chat model
//   node scripts/record-demo.mjs --dry    no model calls: only UI interactions (to test the pipeline)
import { chromium } from "@playwright/test";
import gifenc from "gifenc";
import fs from "node:fs";
import pngjs from "pngjs";

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;

const BASE = process.env.BASE_URL ?? "http://localhost:3112";
const DRY = process.argv.includes("--dry");
const OUT = DRY ? "docs/demo-dry.gif" : "docs/demo.gif";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 680 } });
const gif = GIFEncoder();
let frames = 0;

/** Capture one frame, shown for `delay` ms in the GIF. */
async function frame(delay = 200) {
  const png = PNG.sync.read(await page.screenshot({ type: "png" }));
  const rgba = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength);
  const palette = quantize(rgba, 128);
  gif.writeFrame(applyPalette(rgba, palette), png.width, png.height, { palette, delay });
  frames++;
}
/** Hold the current view for `ms` of GIF time using a few frames. */
async function hold(ms) {
  for (let t = 0; t < ms; t += 400) {
    await frame(400);
    await page.waitForTimeout(150);
  }
}
/** While waiting for something, capture a time-lapse (real time ≫ GIF time). */
async function waitLapse(predicate, timeout = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await frame(120);
    await page.waitForTimeout(700);
  }
  throw new Error("timed out waiting for the model");
}
async function ask(text) {
  await page.getByLabel("Your question").fill(text);
  await frame(500);
  if (DRY) return hold(600); // never talk to the model in dry mode
  const before = await page.getByTestId("assistant-message").count();
  await page.getByRole("button", { name: /Send/ }).click();
  await waitLapse(async () => (await page.getByTestId("assistant-message").count()) > before);
  // streaming is over once the Stop button is gone again
  await waitLapse(async () => (await page.getByRole("button", { name: "Stop" }).count()) === 0);
  await hold(1200);
}
async function setPersona(label) {
  await page.getByLabel("Employee group").click();
  await frame(300);
  await page.getByRole("option", { name: label }).click();
  await frame(300);
}

await page.goto(BASE);
await page.getByText("How can I help?").waitFor();
await hold(1200);

// 1. German question as a shift worker → cited answer → click a source
await setPersona(/Shift/);
await ask("Wie hoch ist der Nachtzuschlag?");
if (!DRY) {
  await page.getByTestId("assistant-message").last().getByTestId("citation").first().click();
  await hold(1800);
}

// 2. Same question, two groups → different answers
await ask("From how many hours per week does overtime start?");
await setPersona(/Office/);
await ask("From how many hours per week does overtime start?");

// 3. Unanswerable → refusal → Contact HR
await ask("What is the CEO's salary?");
if (!DRY) {
  const contact = page.getByTestId("contact-hr");
  await contact.waitFor({ timeout: 30_000 });
  await hold(1000);
  await contact.click();
  await waitLapse(async () => (await page.getByText(/HR-\d{4}-\d{4}/).count()) > 0);
  await hold(2500);
}

gif.finish();
fs.writeFileSync(OUT, gif.bytes());
await browser.close();
console.log(`wrote ${OUT}: ${frames} frames, ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB`);
