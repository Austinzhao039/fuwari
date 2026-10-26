#!/usr/bin/env node
/**
 * 极简图床：零依赖、单文件、兼容兰空图床（LskyPro）v1 上传协议。
 *
 * 为什么自己写：
 *   免费图床要么要注册（7bu 现在还收费）、要么国内连不上（sm.ms / catbox / telegra.ph）。
 *   自己跑一个 200 行的服务，容量只受硬盘限制，永久免费，地址归自己。
 *
 * 为什么能被 Twikoo 直接用：
 *   Twikoo 1.6.44 支持 IMAGE_CDN=lskypro + IMAGE_CDN_URL，请求就是
 *     POST <URL>/api/v1/upload
 *     Authorization: Bearer <IMAGE_CDN_TOKEN>
 *     multipart: file=<二进制>
 *   期望返回 {"status":true,"data":{"links":{"url":"..."}}}
 *   本服务就实现这一个接口（外加静态文件读取）。
 *
 * 环境变量：
 *   PORT         监听端口，默认 3000
 *   UPLOAD_TOKEN 上传口令（必须设置，同时填到 Twikoo 的 IMAGE_CDN_TOKEN）
 *   DATA_DIR     图片存放目录，默认 /data
 *   PUBLIC_BASE  图片对外访问前缀，如 https://twikoo.austin666.top/img
 *   MAX_BYTES    单文件上限，默认 8388608（8MB）
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.UPLOAD_TOKEN || "";
const DATA_DIR = path.resolve(process.env.DATA_DIR || "/data");
const PUBLIC_BASE = (process.env.PUBLIC_BASE || "").replace(/\/+$/, "");
const MAX_BYTES = Number(process.env.MAX_BYTES || 8 * 1024 * 1024);

const MIME_EXT = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/bmp": "bmp",
	"image/avif": "avif",
};
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([k, v]) => [v, k]));

if (!TOKEN) {
	console.error("[img-host] 必须先设 UPLOAD_TOKEN（上传口令）");
	process.exit(1);
}

/** 按 magic bytes 判真身，避免把 .png 传成任何东西 */
function sniff(buf) {
	if (buf.length < 12) return null;
	if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return "png";
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
	if (buf.toString("latin1", 0, 3) === "GIF") return "gif";
	if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
	if (buf.toString("latin1", 0, 2) === "BM") return "bmp";
	if (buf.toString("latin1", 4, 12) === "ftypavif") return "avif";
	if (/^\s*<(\?xml|svg)/i.test(buf.toString("latin1", 0, 64))) return "svg";
	return null;
}

/** 手写 multipart 解析：只需要取出第一个文件字段，够用且不引依赖 */
function parseMultipart(buf, boundary) {
	const delim = Buffer.from(`--${boundary}`);
	const out = [];
	let idx = buf.indexOf(delim);
	while (idx !== -1) {
		const start = idx + delim.length;
		if (buf.slice(start, start + 2).toString("latin1") === "--") break;
		const next = buf.indexOf(delim, start);
		if (next === -1) break;
		let seg = buf.slice(start, next);
		if (seg.slice(0, 2).toString("latin1") === "\r\n") seg = seg.slice(2);
		if (seg.slice(-2).toString("latin1") === "\r\n") seg = seg.slice(0, -2);
		const headEnd = seg.indexOf("\r\n\r\n");
		if (headEnd !== -1) {
			const headers = seg.slice(0, headEnd).toString("utf8");
			const data = seg.slice(headEnd + 4);
			const name = /name="([^"]*)"/i.exec(headers)?.[1] || "";
			const filename = /filename="([^"]*)"/i.exec(headers)?.[1] || "";
			const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "";
			out.push({ name, filename, type, data });
		}
		idx = next;
	}
	return out;
}

function readBody(req, limit) {
	// 超限不要 destroy：直接断开会让客户端收到空响应，
	// 正确做法是把剩下的数据读掉（丢弃），等 end 再回 413。
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		let tooBig = false;
		req.on("data", (c) => {
			size += c.length;
			if (size > limit) {
				tooBig = true;
				chunks.length = 0;
				return;
			}
			if (!tooBig) chunks.push(c);
		});
		req.on("end", () => (tooBig ? reject(new Error("文件太大")) : resolve(Buffer.concat(chunks))));
		req.on("error", reject);
	});
}

const json = (res, code, obj) => {
	const body = JSON.stringify(obj);
	res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
	res.end(body);
};

async function handleUpload(req, res) {
	const auth = String(req.headers.authorization || "");
	const given = auth.replace(/^Bearer\s+/i, "").trim();
	if (!given || given !== TOKEN) {
		return json(res, 401, { status: false, message: "Unauthorized", data: {} });
	}

	const ct = String(req.headers["content-type"] || "");
	const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
	if (!boundary) return json(res, 400, { status: false, message: "缺少 multipart boundary", data: {} });

	let buf;
	try {
		buf = await readBody(req, MAX_BYTES + 1024 * 1024);
	} catch (e) {
		return json(res, 413, { status: false, message: `超过上限（${Math.round(MAX_BYTES / 1024 / 1024)}MB）`, data: {} });
	}

	const parts = parseMultipart(buf, boundary[1] || boundary[2]);
	const file = parts.find((p) => p.name === "file") || parts.find((p) => p.filename);
	if (!file || !file.data.length) return json(res, 400, { status: false, message: "没有收到 file 字段", data: {} });
	if (file.data.length > MAX_BYTES) {
		return json(res, 413, { status: false, message: `超过上限（${Math.round(MAX_BYTES / 1024 / 1024)}MB）`, data: {} });
	}

	const ext = sniff(file.data);
	if (!ext) return json(res, 415, { status: false, message: "只支持 png / jpg / gif / webp / bmp / avif / svg", data: {} });

	const now = new Date();
	const rel = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), `${randomBytes(8).toString("hex")}.${ext}`);
	const abs = path.join(DATA_DIR, rel);
	await mkdir(path.dirname(abs), { recursive: true });
	await writeFile(abs, file.data);

	const url = `${PUBLIC_BASE}/${rel.split(path.sep).join("/")}`;
	console.log(`[img-host] 上传成功 ${url} (${file.data.length} 字节)`);
	return json(res, 200, { status: true, message: "success", data: { links: { url } } });
}

async function handleFile(req, res, pathname) {
	// 只允许访问 DATA_DIR 里的文件，挡住 ../ 穿越
	const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
	const abs = path.join(DATA_DIR, rel);
	if (!abs.startsWith(DATA_DIR + path.sep)) {
		res.writeHead(403).end("forbidden");
		return;
	}
	let st;
	try {
		st = await stat(abs);
	} catch {
		res.writeHead(404).end("not found");
		return;
	}
	if (!st.isFile()) {
		res.writeHead(404).end("not found");
		return;
	}
	const ext = path.extname(abs).slice(1).toLowerCase();
	// 只对外提供图片，别的文件（备份、日志之类）一律不给
	if (!EXT_MIME[ext]) {
		res.writeHead(404).end("not found");
		return;
	}
	res.writeHead(200, {
		"Content-Type": EXT_MIME[ext] || "application/octet-stream",
		"Content-Length": st.size,
		// 文件名是随机串，内容不会变，可以长缓存
		"Cache-Control": "public, max-age=31536000, immutable",
	});
	createReadStream(abs).pipe(res);
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || "/", "http://localhost");
	try {
		if (req.method === "POST" && /^\/api\/v1\/upload\/?$/.test(url.pathname)) {
			return await handleUpload(req, res);
		}
		if (req.method === "GET" && url.pathname === "/") {
			return json(res, 200, { ok: true, service: "img-host", maxMB: Math.round(MAX_BYTES / 1024 / 1024) });
		}
		if (req.method === "GET") return await handleFile(req, res, url.pathname);
		res.writeHead(405).end("method not allowed");
	} catch (e) {
		console.error("[img-host] 出错", e);
		json(res, 500, { status: false, message: String(e?.message || e), data: {} });
	}
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`[img-host] 监听 :${PORT}  DATA_DIR=${DATA_DIR}  上限=${Math.round(MAX_BYTES / 1024 / 1024)}MB`);
});
