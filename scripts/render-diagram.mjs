// Renders docs/architecture.mmd to docs/architecture.png with Playwright's Chromium (no extra dependency).
// Usage: node scripts/render-diagram.mjs   (needs network access to load mermaid from a CDN)
import { chromium } from "@playwright/test";
import fs from "node:fs";

const source = fs.readFileSync("docs/architecture.mmd", "utf8");
const html = `<!doctype html><html><body style="margin:0;background:#fff">
<pre class="mermaid" id="d">${source.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: false, theme: "neutral", flowchart: { htmlLabels: true, curve: "basis" } });
  await mermaid.run({ nodes: [document.getElementById("d")] });
  document.body.dataset.ready = "1";
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 900 } });
await page.setContent(html);
await page.waitForSelector("body[data-ready='1']", { timeout: 60_000 });
await page.locator("#d svg").screenshot({ path: "docs/architecture.png" });
await browser.close();
console.log("wrote docs/architecture.png");
