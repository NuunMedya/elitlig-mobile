import { chromium } from "playwright";
const [dark, ...routes] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.addInitScript(([isDark]) => {
  try {
    localStorage.setItem("elitlig.intro.v1", "1");
    localStorage.setItem("elitlig.scope.v1", JSON.stringify({ cityId: 1, leagueId: 1, seasonId: 160 }));
    if (isDark === "dark") localStorage.setItem("elitlig.theme.v1", "dark");
  } catch {}
}, [dark]);
const DIR = "/tmp/claude-0/-home-user/b87c5323-25d6-5825-85b5-d8d3ff262764/scratchpad/shots";
for (const r of routes) {
  const name = (dark === "dark" ? "dark_" : "") + (r.replace(/[^a-z0-9]/gi, "_") || "root");
  await page.goto(`http://127.0.0.1:8099/${r}`, { waitUntil: "load", timeout: 60000 }).catch((e) => console.log("NAV", e.message));
  await page.waitForTimeout(6500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  console.log("shot", name);
}
await browser.close();
