#!/usr/bin/env node
/**
 * 把 Twikoo 里的评论导出成 JSON，存进仓库（backups/comments.json）。
 *
 * 用法：
 *   node scripts/backup-comments.mjs            # 只导出到本地文件
 *   node scripts/backup-comments.mjs --push     # 导出后自动 git commit + push 到 GitHub
 *
 * 为什么需要它：
 *   评论的**唯一实时数据源**是 Twikoo（twikoo.austin666.top）。一旦服务器挂掉、
 *   误删、或者你换了评论方案，评论就找不回来了。GitHub 上的这份是「备份」，
 *   平时不参与展示，但任何时候都能拿来恢复。
 *
 * 隐私：
 *   仓库是公开的，所以对外的 JSON 默认**剔除 ip / mail / mailMd5**，
 *   只保留评论区本来就公开展示的字段（昵称、正文、时间、归属地、浏览器）。
 *   完整备份（含邮箱/IP）用 --full 导出到 backups/private/，那个目录已被 .gitignore 忽略。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUSH = process.argv.includes("--push");
const FULL = process.argv.includes("--full");

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
	console.error("缺少 TWIKOO_PASS（写在 .env 里，或命令行传入）");
	process.exit(1);
}
const TOKEN = createHash("md5").update(PASSWORD, "utf8").digest("hex");

async function call(event, extra = {}) {
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ event, accessToken: TOKEN, ...extra }),
		signal: AbortSignal.timeout(20000),
	});
	const json = await res.json();
	if (json.code !== 0) throw new Error(`${event} 失败：${json.code} ${json.message || ""}`.trim());
	return json;
}

// 评论区本来就公开的字段
const PUBLISHED = ["id", "nick", "link", "comment", "url", "created", "updated", "ua", "ipRegion", "os", "browser", "isSpam", "master", "ruser"];

async function main() {
	const all = [];
	const per = 50;
	for (let page = 1; page <= 400; page++) {
		const r = await call("COMMENT_GET_FOR_ADMIN", { keyword: "", per, page });
		const batch = r.data || [];
		all.push(...batch);
		if (batch.length < per || all.length >= (r.count || 0)) break;
	}

	const exportedAt = new Date().toISOString();
	const publicList = all.map((c) => {
		const o = {};
		for (const k of PUBLISHED) if (c[k] !== undefined) o[k] = c[k];
		return o;
	});

	mkdirSync(join(ROOT, "backups"), { recursive: true });
	const publicPath = join(ROOT, "backups/comments.json");
	writeFileSync(
		publicPath,
		JSON.stringify({ exportedAt, endpoint: ENDPOINT, count: publicList.length, comments: publicList }, null, 2) + "\n",
		"utf8",
	);

	let privatePath = "";
	if (FULL) {
		mkdirSync(join(ROOT, "backups/private"), { recursive: true });
		privatePath = join(ROOT, "backups/private/comments-full.json");
		writeFileSync(privatePath, JSON.stringify({ exportedAt, count: all.length, comments: all }, null, 2) + "\n", "utf8");
	}

	console.log(`已导出 ${all.length} 条评论`);
	console.log(`  公开字段副本：${publicPath}`);
	if (privatePath) console.log(`  完整副本（含邮箱/IP，勿提交）：${privatePath}`);

	if (PUSH) {
		const g = (args) =>
			spawnSync("/host/usr/bin/git", args, {
				cwd: ROOT,
				encoding: "utf8",
				env: {
					...process.env,
					GIT_EXEC_PATH: "/host/usr/lib/git-core",
					GIT_SSH_COMMAND:
						"/host/usr/bin/ssh -i /home/austin/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o BatchMode=yes",
				},
			});
		g(["add", "backups/comments.json"]);
		const diff = g(["status", "--porcelain", "backups/comments.json"]);
		if (!diff.stdout.trim()) {
			console.log("评论没有变化，跳过提交");
			return;
		}
		const c = g([
			"-c",
			"user.name=Austin",
			"-c",
			"user.email=Austinzhao039@users.noreply.github.com",
			"commit",
			"-m",
			`备份评论（${publicList.length} 条，${exportedAt.slice(0, 10)}）`,
		]);
		if (c.status !== 0) throw new Error(`git commit 失败：${c.stderr || c.stdout}`);
		const p = g(["push"]);
		if (p.status !== 0) throw new Error(`git push 失败：${p.stderr || p.stdout}`);
		console.log("已提交并推送到 GitHub");
	}
}

main().catch((e) => {
	console.error("备份失败：", e.message);
	process.exit(1);
});
