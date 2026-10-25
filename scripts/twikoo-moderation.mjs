#!/usr/bin/env node
/**
 * 一键给自建 Twikoo 后台配置「评论审核」+「违禁词」。
 *
 * 用法：
 *   TWIKOO_PASS='后台密码' node scripts/twikoo-moderation.mjs
 *   DRY_RUN=1 TWIKOO_PASS='后台密码' node scripts/twikoo-moderation.mjs   # 只看现状不写
 *
 * 原理（对照 twikoo@1.6.44 src/server/self-hosted/index.js）：
 *   - 前端把密码做 sha256 后作为 accessToken 发给后端；
 *   - 未设密码时，任何人都能调 SET_PASSWORD（所以闲置的后台等于敞开），
 *     本脚本若发现后台还没有密码，会先把传入的密码写进去；
 *   - isAdmin(accessToken) === (ADMIN_PASS === md5(accessToken))；
 *   - SET_CONFIG 需要管理员 accessToken，写入是「与旧配置合并」，不会覆盖其它设置。
 *
 * 鉴权补充：前端把密码做 md5 后作为 accessToken（TkAdmin.vue 用 blueimp-md5）。
 *
 * 配置项语义（src/server/function/twikoo/utils/index.js: preCheckSpam）：
 *   - AKISMET_KEY = "MANUAL_REVIEW" → 所有评论进「待审核」，访客看不到，审核后才显示；
 *   - FORBIDDEN_WORDS → 命中即标记为垃圾评论（静默进垃圾箱，不告诉对方）；
 *   - BLOCKED_WORDS   → 命中直接让评论失败（会告诉对方「包含屏蔽词」，容易被绕过）。
 *   注意 MANUAL_REVIEW 的判断排在 FORBIDDEN_WORDS 前面，两者都开时以审核为准。
 */

import { createHash } from "node:crypto";

const ENDPOINT = process.env.TWIKOO_ENDPOINT || "https://twikoo.austin666.top/";
const PASSWORD = process.env.TWIKOO_PASS;
const DRY_RUN = process.env.DRY_RUN === "1";

// Twikoo 前端用的是 blueimp-md5（见 TkAdmin.vue: md5(this.password)），不是 sha256
const hashPassword = (s) => createHash("md5").update(s, "utf8").digest("hex");

// 命中后「静默进垃圾箱」的词，宁可多抓，误伤也只是进待审队列
const FORBIDDEN_WORDS = [
	"加微信",
	"加我微信",
	"微信号",
	"加vx",
	"加qq",
	"代开发票",
	"办证",
	"办假证",
	"刷单",
	"兼职日结",
	"网赚",
	"带你赚钱",
	"导师带单",
	"博彩",
	"赌博",
	"下注",
	"棋牌",
	"时时彩",
	"六合彩",
	"色情",
	"裸聊",
	"约炮",
	"上门服务",
	"催情",
	"迷药",
	"洗钱",
	"USDT",
	"区块链投资",
	"贷款秒批",
	"低价代购",
];

// 命中后「直接拒绝提交」的词：只放最明确、几乎不可能出现在正常技术讨论里的
const BLOCKED_WORDS = ["代开发票", "办假证", "时时彩", "六合彩", "裸聊", "约炮"];

const DESIRED = {
	AKISMET_KEY: "MANUAL_REVIEW",
	FORBIDDEN_WORDS: FORBIDDEN_WORDS.join(","),
	BLOCKED_WORDS: BLOCKED_WORDS.join(","),
};

if (!PASSWORD) {
	console.error("缺少密码。用法：TWIKOO_PASS='你的后台密码' node scripts/twikoo-moderation.mjs");
	process.exit(1);
}

const NEW_PASSWORD = process.env.TWIKOO_NEW_PASS;

let token = hashPassword(PASSWORD);

async function call(event, extra = {}) {
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ event, accessToken: token, ...extra }),
	});
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`接口返回的不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
	}
}

function fail(step, res) {
	console.error(`✗ ${step}失败：`, res);
	process.exit(1);
}

console.log(`后端：${ENDPOINT}`);

const status = await call("GET_PASSWORD_STATUS");
console.log("后台状态：", status);

if (!status.status) {
	if (DRY_RUN) {
		console.log("（dry-run）后台还没有管理密码，正式运行时会先写入你给的密码，然后配置：");
		console.log(DESIRED);
		process.exit(0);
	}
	const set = await call("SET_PASSWORD", { password: token });
	if (set.code !== 0) fail("设置管理密码", set);
	console.log("✓ 已写入管理密码（首次设置）");
} else {
	console.log("· 后台已有管理密码，直接用它登录");
}

const before = await call("GET_CONFIG_FOR_ADMIN");
if (before.code !== 0) fail("管理员登录（密码是否正确？）", before);
console.log("当前配置：", {
	AKISMET_KEY: before.config?.AKISMET_KEY ?? "(空)",
	FORBIDDEN_WORDS: before.config?.FORBIDDEN_WORDS ?? "(空)",
	BLOCKED_WORDS: before.config?.BLOCKED_WORDS ?? "(空)",
});

// 可选：顺手改管理密码
if (NEW_PASSWORD) {
	if (DRY_RUN) {
		console.log("（dry-run）会把管理密码改成 TWIKOO_NEW_PASS 的值");
	} else {
		const r = await call("SET_PASSWORD", { password: hashPassword(NEW_PASSWORD) });
		if (r.code !== 0) fail("修改管理密码", r);
		token = hashPassword(NEW_PASSWORD);
		const chk = await call("GET_CONFIG_FOR_ADMIN");
		if (chk.code !== 0) fail("用新密码登录校验", chk);
		console.log("✓ 管理密码已更新，并用新密码验证通过");
	}
}

if (DRY_RUN) {
	console.log("\n（dry-run）将要写入：", DESIRED);
	process.exit(0);
}

const saved = await call("SET_CONFIG", { config: DESIRED });
if (saved.code !== 0) fail("保存配置", saved);

const after = await call("GET_CONFIG_FOR_ADMIN");
if (after.code !== 0) fail("回读配置", after);

const ok =
	after.config.AKISMET_KEY === DESIRED.AKISMET_KEY &&
	after.config.FORBIDDEN_WORDS === DESIRED.FORBIDDEN_WORDS &&
	after.config.BLOCKED_WORDS === DESIRED.BLOCKED_WORDS;

console.log("✓ 已写入配置");
console.log("回读校验：", {
	AKISMET_KEY: after.config.AKISMET_KEY,
	违禁词数量: String(after.config.FORBIDDEN_WORDS || "").split(",").filter(Boolean).length,
	硬拦词数量: String(after.config.BLOCKED_WORDS || "").split(",").filter(Boolean).length,
});
console.log(ok ? "✓ 校验通过：审核已开启，违禁词已生效" : "⚠ 回读结果与预期不一致，请到后台手动确认");
process.exit(ok ? 0 : 2);
