import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 80);
const ROOT_DIR = process.cwd();
const ROOT_ABS = path.resolve(ROOT_DIR);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function toAbsoluteFilePath(rawPathname) {
  let decodedPath = "/";
  try {
    decodedPath = decodeURIComponent(rawPathname || "/");
  } catch {
    return null;
  }
  const cleanPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const normalized = path.posix.normalize(cleanPath);
  const relativePath = normalized.replace(/^\/+/, "");
  const absolutePath = path.resolve(ROOT_ABS, relativePath);
  const relativeToRoot = path.relative(ROOT_ABS, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;
  return absolutePath;
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendText(res, 400, "Bad Request");
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  let pathname = "/";
  try {
    pathname = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
  } catch {
    sendText(res, 400, "Bad Request");
    return;
  }

  const filePath = toAbsoluteFilePath(pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    sendText(res, 404, "Not Found");
    return;
  }

  if (!fileStat.isFile()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fileStat.size
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Static server running at http://${HOST}:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EACCES") {
    console.error(`Port ${PORT} requires higher privileges. Try running terminal as administrator.`);
    process.exit(1);
  }
  if (err && err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
