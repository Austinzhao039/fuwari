#!/usr/bin/env node
/**
 * fuwari 本地预览服务器（零依赖）
 *
 * 相比 `python3 -m http.server`，它多做三件事：
 *   1. 找不到路径时返回站点自己的 404.html，状态码 404（python 只会回自己的错误页）
 *   2. 遵守 astro 的 trailingSlash: "always"，/foo → 301 /foo/
 *   3. 目录自动补 index.html
 *
 * 用法：node preview-server.mjs <站点目录> [端口] [绑定地址]
 */

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(process.argv[2] || "dist");
const PORT = Number(process.argv[3] || 8850);
const HOST = process.argv[4] || "0.0.0.0";

const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".xml": "application/xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".pdf": "application/pdf",
	".wasm": "application/wasm",
	".map": "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".zip": "application/zip",
};

const NOT_FOUND_FILE = join(ROOT, "404.html");

function statSafe(p) {
	try {
		return statSync(p);
	} catch {
		return null;
	}
}

function sendFile(res, filePath, status = 200, extraHeaders = {}) {
	const st = statSafe(filePath);
	if (!st || !st.isFile()) return false;

	res.writeHead(status, {
		"Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
		"Content-Length": st.size,
		"Cache-Control": "no-cache",
		...extraHeaders,
	});

	if (res.req.method === "HEAD") {
		res.end();
		return true;
	}

	createReadStream(filePath).pipe(res);
	return true;
}

function sendNotFound(res, pathname) {
	const has = statSafe(NOT_FOUND_FILE);
	if (has && has.isFile()) {
		sendFile(res, NOT_FOUND_FILE, 404);
	} else {
		res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		res.end(`404 Not Found: ${pathname}\n（站点里没有 404.html）`);
	}
}

const server = createServer((req, res) => {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405, { Allow: "GET, HEAD" });
		res.end();
		return;
	}

	let pathname;
	try {
		pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
	} catch {
		res.writeHead(400).end("Bad Request");
		return;
	}

	// 防目录穿越
	const target = resolve(join(ROOT, normalize(pathname)));
	if (target !== ROOT && !target.startsWith(ROOT + sep)) {
		res.writeHead(403).end("Forbidden");
		return;
	}

	const st = statSafe(target);

	// 1. 命中物理文件
	if (st?.isFile()) {
		sendFile(res, target);
		return;
	}

	// 2. 目录 → 补 index.html；没有尾斜杠先 301
	if (st?.isDirectory()) {
		if (!pathname.endsWith("/")) {
			res.writeHead(301, { Location: `${pathname}/` + (req.url.includes("?") ? `?${req.url.split("?")[1]}` : "") });
			res.end();
			return;
		}
		const idx = join(target, "index.html");
		if (sendFile(res, idx)) return;
	}

	// 3. /foo → 存在 /foo.html 或 /foo/index.html 时补斜杠
	if (!pathname.endsWith("/") && !extname(pathname)) {
		if (statSafe(`${target}.html`)?.isFile() || statSafe(join(target, "index.html"))?.isFile()) {
			res.writeHead(301, { Location: `${pathname}/` });
			res.end();
			return;
		}
	}

	// 4. 兜底：站点自己的 404
	sendNotFound(res, pathname);
});

server.listen(PORT, HOST, () => {
	console.log(`[preview] serving ${ROOT}`);
	console.log(`[preview] http://${HOST}:${PORT}  (404 → ${statSafe(NOT_FOUND_FILE) ? "404.html" : "纯文本"})`);
});
