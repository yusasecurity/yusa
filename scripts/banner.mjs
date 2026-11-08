import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// Reuse an existing playwright-core instead of adding a heavy devDependency.
const { chromium } = createRequire("/root/camofox-browser/")("playwright-core");

const root = new URL("..", import.meta.url).pathname;
const port = 5191;
const srv = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

try {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/brand/banner.html`);
  await page.evaluate(() => document.fonts.ready);
  for (const [id, file] of [["#banner", "yusa-x-banner-1500x500.png"], ["#og", "yusa-og-1200x630.png"]]) {
    await page.locator(id).screenshot({ path: `${root}public/brand/${file}` });
    console.log(file);
  }
  await browser.close();
} finally {
  srv.kill();
}
