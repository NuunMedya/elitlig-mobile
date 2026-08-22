import { chromium } from "playwright";

const routes = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 160)); });

// Şehir seçimi onboarding'i atla: kapsam ve giriş bayrakları önceden yazılır.
await page.addInitScript(() => {
  try {
    localStorage.setItem("elitlig.intro.v1", "1");
    localStorage.setItem("elitlig.scope.v1", JSON.stringify({ cityId: 1, leagueId: 1, seasonId: 160 }));
  } catch {}
});

const DIR = "/tmp/claude-0/-home-user/b87c5323-25d6-5825-85b5-d8d3ff262764/scratchpad/shots";
for (const r of routes) {
  const name = r.replace(/[^a-z0-9]/gi, "_") || "root";
  await page.goto(`http://127.0.0.1:8099/${r}`, { waitUntil: "load", timeout: 60000 }).catch((e) => console.log("NAV", r, e.message));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  console.log("shot", name);
}
await browser.close();
