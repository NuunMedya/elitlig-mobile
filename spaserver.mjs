/* Tek sayfa uygulaması için basit dosya sunucusu: bilinmeyen yol → index.html. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.argv[2];
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".map": "application/json",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(ROOT, normalize(path));
  try {
    const info = await stat(file);
    if (info.isFile()) {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
      return;
    }
  } catch {}
  const body = await readFile(join(ROOT, "index.html"));
  res.writeHead(200, { "content-type": "text/html" });
  res.end(body);
}).listen(8099, "127.0.0.1", () => console.log("spa on 8099"));
