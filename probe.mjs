import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("elitlig.intro.v1", "1");
    localStorage.setItem("elitlig.scope.v1", JSON.stringify({ cityId: 1, leagueId: 1, seasonId: 160 }));
  } catch {}
});
await page.goto("http://127.0.0.1:8099/maclar", { waitUntil: "load" });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("div,span").forEach((el) => {
    const t = (el.textContent || "").trim();
    if (t.length > 0 && t.length <= 3 && el.children.length === 0) {
      const r = el.getBoundingClientRect();
      out.push({ text: t, w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(el).fontSize, ff: getComputedStyle(el).fontFamily });
    }
  });
  return out.filter((o) => /^[A-ZÇĞİÖŞÜ]{1,2}$|…/.test(o.text)).slice(0, 12);
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
