#!/usr/bin/env node
/**
 * 一键把 Twikoo 的图片上传接到第三方图床（兰空 V2 协议），并立刻做一次真实上传自测。
 *
 * 用法：
 *   TWIKOO_PASS='后台密码' node scripts/set-image-cdn.mjs --token '<图床令牌>'
 *   TWIKOO_PASS='后台密码' node scripts/set-image-cdn.mjs --token '<令牌>' --url https://img.luoca.net
 *   TWIKOO_PASS='后台密码' node scripts/set-image-cdn.mjs --off      # 关掉图片上传
 *
 * 默认接 imgos.cn（免费、1TB、单图 30MB、国内 CDN、兰空 V2 协议）。
 * 原理：Twikoo 1.6.44 的 IMAGE_CDN=lskypro 分支会向
 *   POST <IMAGE_CDN_URL>/api/v1/upload
 *   Authorization: Bearer <IMAGE_CDN_TOKEN>
 *   multipart: file=<二进制>
 * 发请求，并读返回里的 data.links.url —— 和 imgos.cn 的接口完全一致。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = "") {
	const i = process.argv.indexOf(`--${name}`);
	return i > -1 ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

function readEnv() {
	const out = {};
	const p = join(ROOT, ".env");
	if (!existsSync(p)) return out;
	for (const line of readFileSync(p, "utf8").split("\n")) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (!m) continue;
		out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
	}
	return out;
}

const env = readEnv();
const ENDPOINT = (process.env.TWIKOO_ENDPOINT || env.TWIKOO_ENV_ID || "https://twikoo.austin666.top").replace(/\/?$/, "/");
const PASSWORD = process.env.TWIKOO_PASS || env.TWIKOO_PASS || "";
if (!PASSWORD) {
	console.error("缺少 TWIKOO_PASS（写在 .env 里即可）");
	process.exit(1);
}
const TOKEN = createHash("md5").update(PASSWORD, "utf8").digest("hex");

const call = async (event, extra = {}, timeout = 60000) =>
	(
		await fetch(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ event, accessToken: TOKEN, ...extra }),
			signal: AbortSignal.timeout(timeout),
		})
	).json();

const OFF = has("off");
const CDN_TOKEN = arg("token", "");
const CDN_URL = arg("url", "https://imgos.cn").replace(/\/+$/, "");

if (!OFF && !CDN_TOKEN) {
	console.error("用法：node scripts/set-image-cdn.mjs --token '<图床令牌>' [--url https://imgos.cn]");
	console.error("      node scripts/set-image-cdn.mjs --off");
	process.exit(1);
}

const config = OFF
	? { IMAGE_CDN: "", IMAGE_CDN_URL: "", IMAGE_CDN_TOKEN: "" }
	: { IMAGE_CDN: "lskypro", IMAGE_CDN_URL: CDN_URL, IMAGE_CDN_TOKEN: CDN_TOKEN };

const saved = await call("SET_CONFIG", { config });
if (saved.code !== 0) {
	console.error("✗ 保存配置失败：", saved);
	process.exit(1);
}
console.log(`✓ 已写入：IMAGE_CDN=${config.IMAGE_CDN || "(空)"}  URL=${config.IMAGE_CDN_URL || "(空)"}`);

if (OFF) {
	console.log("图片上传已关闭。评论区点图片按钮会提示「先传图床再贴链接」。");
	process.exit(0);
}

// 1×1 的透明 PNG，够用来验证链路
const TINY_PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

console.log("正在用这张 1×1 测试图做一次真实上传…");
const t0 = Date.now();
const up = await call(
	"UPLOAD_IMAGE",
	{ photo: `data:image/png;base64,${TINY_PNG}`, fileName: "twikoo-test.png" },
	90000,
);
console.log(`耗时 ${Date.now() - t0} ms`);

if (up.code === 0 && up.data && up.data.url) {
	console.log("✓ 上传成功，图片地址：", up.data.url);
	console.log("  打开看看能不能显示；能显示就说明整条链路通了。");
} else {
	console.error("✗ 上传失败：", JSON.stringify(up));
	console.error("  常见原因：令牌填错 / 令牌没勾「上传图片」权限 / 图床站点临时故障。");
	process.exit(2);
}
