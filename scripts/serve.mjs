#!/usr/bin/env node
/* tiny static server: node scripts/serve.mjs [port] */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || 4173);
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json",
  ".png": "image/png",
};

createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  let file = join(ROOT, p);
  if (!existsSync(file) || !file.startsWith(ROOT)) {
    const f404 = join(ROOT, "404.html");
    res.writeHead(404, { "content-type": "text/html" });
    res.end(existsSync(f404) ? readFileSync(f404) : "404");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`ember-site → http://localhost:${PORT}`));
