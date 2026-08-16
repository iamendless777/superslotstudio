import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".map": "application/json",
};
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><title>Super Slot Studio demos</title>
      <body style="font-family:system-ui;background:#0f1218;color:#e8eefc;padding:2rem">
      <h1>Local demos</h1>
      <ul>
        <li><a href="/demo/classic-nine/">Classic Nine grid</a></li>
        <li><a href="/demo/timeline/">Motion timeline styles</a></li>
      </ul>
      <p style="color:#9aa8c7">Non-monetary fixtures. No approval claim.</p>
      </body>`);
    return;
  }
  const requested = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const file = resolve(root, `.${decodeURIComponent(requested)}`);
  if (!file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
    response.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream",
    );
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () =>
  console.log("Demos: http://127.0.0.1:4173"),
);
