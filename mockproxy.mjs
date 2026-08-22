/* Yerel köprü: tarayıcı → 127.0.0.1:8098 (http) → curl (proxy'yi kullanır) → gerçek API. */
import { createServer } from "node:http";
import { execFile } from "node:child_process";

const API = "https://elitlig-api-88a866b7a4da.herokuapp.com";

createServer((req, res) => {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  const url = API + req.url;
  execFile("curl", ["-s", "-w", "\n%{http_code}", "--max-time", "30", url], { maxBuffer: 40 * 1024 * 1024 }, (err, stdout) => {
    if (err) { res.writeHead(502, cors); res.end("{}"); return; }
    const cut = stdout.lastIndexOf("\n");
    const body = stdout.slice(0, cut);
    const status = Number(stdout.slice(cut + 1)) || 200;
    res.writeHead(status, { ...cors, "content-type": "application/json; charset=utf-8" });
    res.end(body);
  });
}).listen(8098, "127.0.0.1", () => console.log("bridge on 8098"));
