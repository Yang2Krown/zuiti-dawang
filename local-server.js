const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const handler = require("./api/generate.js");
const imageHandler = require("./api/generate-image.js");
const imageStatusHandler = require("./api/image-status.js");
const imageFileHandler = require("./api/image-file.js");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function loadLocalEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    process.env[key] ||= value;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

loadLocalEnv();
console.log("[env] HIAPI_KEY:", process.env.HIAPI_KEY ? "已加载" : "未找到");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(`[req] ${req.method} ${url.pathname}`);

  if (url.pathname === "/api/image-status") {
    return imageStatusHandler(req, res);
  }

  if (url.pathname === "/api/image-file") {
    return imageFileHandler(req, res);
  }

  if (url.pathname === "/api/generate" || url.pathname === "/api/generate-image") {
    try {
      req.body = await readBody(req);
      return url.pathname === "/api/generate-image" ? imageHandler(req, res) : handler(req, res);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "请求内容读取失败。" }));
      return;
    }
  }

  const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.listen(port, () => {
  console.log(`Local preview running at http://localhost:${port}`);
});
