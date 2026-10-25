#!/usr/bin/env node
/**
 * 生成 giscus 自定义主题（把「管理员」徽章画进评论区）
 *
 * 为什么需要这个脚本：
 *   giscus 的评论在 <iframe> 里（giscus.app 域），外部页面无法改它的 DOM。
 *   唯一能注入样式的正规途径是 data-theme 传一个 CSS 文件地址 —— 它会把这个 CSS
 *   当成整套主题加载（内置主题 + 我们的徽章规则都要写在里面）。
 *
 * 为什么 CSS 要放 CDN：
 *   giscus 用 <link crossorigin="anonymous"> 加载主题，必须带 CORS 头。
 *   本站 nginx 没发 Access-Control-Allow-Origin，只能借 jsDelivr（ACAO: *）。
 *
 * 数据来源（优先级从高到低）：
 *   1. Twikoo 后台配置的 ADMINS（就是 /admin「管理员」页签里改的那份）
 *   2. scripts/giscus-admins.json（上次同步成功的快照，构建机没网/没密码时用它）
 *
 * 用法：node scripts/build-giscus-theme.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
const BADGE_TEXT = process.env.GISCUS_BADGE_TEXT || env.GISCUS_BADGE_TEXT || "管理员";
const SNAPSHOT = join(ROOT, "scripts/giscus-admins.json");

const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

async function fetchAdmins() {
	if (!PASSWORD) return { ok: false, reason: "没有 TWIKOO_PASS" };
	try {
		const res = await fetch(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				event: "GET_CONFIG_FOR_ADMIN",
				accessToken: md5(PASSWORD),
			}),
			signal: AbortSignal.timeout(12000),
		});
		const json = await res.json();
		if (json.code !== 0) return { ok: false, reason: `后台返回 ${json.code} ${json.message || ""}`.trim() };
		const raw = json.config?.ADMINS;
		if (!raw) return { ok: false, reason: "后台还没写过 ADMINS" };
		const list = JSON.parse(raw);
		return { ok: true, list: Array.isArray(list) ? list : [] };
	} catch (e) {
		return { ok: false, reason: e.message };
	}
}

function normalize(list) {
	const seen = new Set();
	const out = [];
	for (const item of list) {
		const login = String(item?.username ?? item?.login ?? "").trim();
		if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) continue;
		const key = login.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ login, name: String(item?.name ?? "").trim() });
	}
	return out;
}

const h = (s) => JSON.stringify(s); // CSS 字符串安全（不走 HTML）

function badgeRules(admins, palette) {
	if (!admins.length) return "/* 管理员名单为空，未生成徽章规则 */";
	return [
		"/* ===== 管理员徽章（构建时按后台管理员名单生成，不要手改） ===== */",
		...admins.map(
			(a) => `.gsc-comment-author a.gsc-comment-author-avatar[href=${h(`https://github.com/${a.login}`)}]::after {
	content: ${h(BADGE_TEXT)};
	display: inline-block;
	flex: none;
	margin-left: 6px;
	padding: 0 6px;
	height: 18px;
	line-height: 16px;
	font-size: 11px;
	font-weight: 600;
	font-style: normal;
	letter-spacing: 0.02em;
	border-radius: 999px;
	vertical-align: middle;
	white-space: nowrap;
	background: ${palette.bg};
	border: 1px solid ${palette.border};
	color: ${palette.text};
}`,
		),
	].join("\n\n");
}

const PALETTE = {
	light: { bg: "#fdf2f8", border: "#f7b6d2", text: "#be185d" },
	dark: { bg: "#3d1528", border: "#9d174d", text: "#f9a8d4" },
};

const main = async () => {
	let admins;
	let source;
	const fetched = await fetchAdmins();
	if (fetched.ok) {
		admins = normalize(fetched.list);
		source = `Twikoo 后台 ADMINS（${admins.length} 个）`;
		writeFileSync(SNAPSHOT, JSON.stringify(admins, null, 2) + "\n", "utf8");
	} else {
		const snap = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : [];
		admins = normalize(snap);
		source = `本地快照 giscus-admins.json（${fetched.reason}）`;
	}

	const light = readFileSync(join(ROOT, "scripts/vendor/giscus-light.css"), "utf8");
	const dark = readFileSync(join(ROOT, "scripts/vendor/giscus-dark.css"), "utf8");
	const banner = `/* 由 scripts/build-giscus-theme.mjs 自动生成，请勿手改。
 * 基础主题来自 giscus（MIT），底部追加「管理员」徽章规则。
 * 管理员账号：${admins.map((a) => a.login).join(", ") || "（无）"}
 */\n`;

	const files = {
		"light.css": banner + light + "\n\n" + badgeRules(admins, PALETTE.light) + "\n",
		"dark.css": banner + dark + "\n\n" + badgeRules(admins, PALETTE.dark) + "\n",
	};
	for (const [name, css] of Object.entries(files)) {
		writeFileSync(join(ROOT, "public/giscus", name), css, "utf8");
	}

	const meta = {
		generatedAt: new Date().toISOString(),
		badge: BADGE_TEXT,
		admins: admins.map((a) => ({ login: a.login, name: a.name })),
		version: {
			light: createHash("sha256").update(files["light.css"]).digest("hex").slice(0, 10),
			dark: createHash("sha256").update(files["dark.css"]).digest("hex").slice(0, 10),
		},
	};
	writeFileSync(join(ROOT, "public/giscus/meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");

	// 同一份名单也导出成 JSON，给 twikoo-giscus 评论区在前端打「管理员」徽章用
	writeFileSync(
		join(ROOT, "public/admins.json"),
		JSON.stringify(meta, null, 2) + "\n",
		"utf8",
	);

	console.log(`[giscus-theme] 名单来源：${source}`);
	console.log(`[giscus-theme] 徽章文案：${BADGE_TEXT}；账号：${admins.map((a) => a.login).join(", ") || "（无）"}`);
	console.log(`[giscus-theme] 已写 public/giscus/{light,dark}.css  version=${meta.version.light}/${meta.version.dark}`);
};

main().catch((e) => {
	console.error("[giscus-theme] 失败：", e);
	process.exit(1);
});
