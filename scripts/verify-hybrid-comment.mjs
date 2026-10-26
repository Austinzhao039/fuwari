#!/usr/bin/env node
/**
 * 用无头 Chrome 验收「giscus 登录 + Twikoo 存储」评论区。
 *
 * 前置：先在宿主机起一个带 CDP 的 Chrome
 *   /host/opt/google/chrome/chrome --headless=new --remote-debugging-port=9223 \
 *     --no-sandbox --disable-gpu --user-data-dir=/tmp/chrome-cdp about:blank
 *
 * 用法：node scripts/verify-hybrid-comment.mjs [文章URL]
 *
 * 检查项：
 *   1. 未登录 → 评论区被锁（.tk-submit 隐藏 + 显示登录引导）
 *   2. 评论列表照常渲染（Twikoo 官方前端）
 *   3. 注入一个假身份 → 解锁，且昵称/邮箱/网址被自动填成 GitHub 身份并只读
 *   4. 点发送 → 弹出《用户须知》，同意后 localStorage 记录版本号
 */
const CDP = "http://127.0.0.1:9223";
const URL_ = process.argv[2] || "http://127.0.0.1:8901/posts/my-blog-notes/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage() {
	const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
	return list.find((t) => t.type === "page");
}

async function main() {
	const ver = await fetch(`${CDP}/json/version`).then((r) => r.json());
	console.log("浏览器：", ver.Browser);

	let page = await getPage();
	if (!page) {
		await fetch(`${CDP}/json/new?${encodeURIComponent(URL_)}`, { method: "PUT" });
		await sleep(1500);
		page = await getPage();
	}
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((res, rej) => {
		ws.addEventListener("open", res, { once: true });
		ws.addEventListener("error", rej, { once: true });
	});

	let id = 0;
	const pending = new Map();
	ws.addEventListener("message", (ev) => {
		const m = JSON.parse(ev.data);
		if (m.id && pending.has(m.id)) {
			const fn = pending.get(m.id);
			pending.delete(m.id);
			fn(m);
		}
	});
	const send = (method, params = {}) =>
		new Promise((res, rej) => {
			const i = ++id;
			pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
			ws.send(JSON.stringify({ id: i, method, params }));
		});
	const evaluate = async (expr) => {
		const r = await send("Runtime.evaluate", {
			expression: expr,
			returnByValue: true,
			awaitPromise: true,
		});
		if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
		return r.result.value;
	};

	await send("Page.enable");
	await send("Runtime.enable");
	await send("Network.setCacheDisabled", { cacheDisabled: true });

	// 控制台错误一律打出来，CDN / 脚本挂了第一时间能看到
	ws.addEventListener("message", (ev) => {
		const m = JSON.parse(ev.data);
		if (m.method === "Runtime.exceptionThrown") {
			console.log("  ⚠ 页面异常：", m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
		}
		if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
			console.log(`  ⚠ console.${m.params.type}：`, m.params.args.map((a) => a.value ?? a.description).join(" "));
		}
	});

	async function goto(url) {
		await send("Page.navigate", { url });
		for (let i = 0; i < 60; i++) {
			await sleep(1000);
			const ready = await evaluate("document.readyState");
			if (ready === "complete") break;
		}
		await sleep(3000);
	}

	// 每次都从干净状态开始，否则上一轮注入的身份会残留
	await evaluate(`localStorage.clear(); 'ok'`).catch(() => {});
	await goto(URL_);
	await evaluate(`localStorage.clear(); 'ok'`).catch(() => {});
	await send("Page.navigate", { url: URL_ });
	await sleep(6000);

	const probe = async () =>
		evaluate(`(() => {
			const wrap = document.getElementById('hybrid-comment');
			if (!wrap) return { error: '没有 #hybrid-comment' };
			// twikoo.init 会换掉 #tcomment，所以一律从外层容器找
			const root = document.getElementById('hybrid-comment');
			const submit = root.querySelector('.tk-submit');
			const inputs = [...root.querySelectorAll('.tk-meta-input input')].map(i => ({
				name: i.getAttribute('name'), value: i.value, readOnly: i.readOnly,
			}));
			return {
				locked: wrap.classList.contains('hc-locked'),
				gate: !!root.querySelector('.hc-gate'),
				gateOverSubmit: (() => {
					const g = root.querySelector('.hc-gate'), s = root.querySelector('.tk-submit');
					return !!(g && s && s.contains(g));
				})(),
				anonVisible: false,
				userVisible: !document.getElementById('hc-user').hidden,
				submitHidden: submit ? getComputedStyle(submit).display === 'none' : null,
				comments: root.querySelectorAll('.tk-comment').length,
				inputs,
				badges: root.querySelectorAll('.hc-badge').length,
				extras: [...root.querySelectorAll('.tk-extra-text')].slice(0,4).map(e => e.textContent.trim()),
				avatars: [...root.querySelectorAll('img.tk-avatar-img')].map(i => i.getAttribute('src')).slice(0, 4),
				// 排障用：Twikoo 到底加载了没有、容器里写着什么
				twikooLoaded: typeof window.twikoo,
				tcommentText: (root.innerText || '').slice(0, 220),
			};
		})()`);

	// 浏览器能不能直接连上 Twikoo（CORS / 网络问题在这里就能看出来）
	const net = await evaluate(`fetch('https://twikoo.austin666.top/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ event: 'COMMENT_GET', url: ${JSON.stringify(new URL(URL_).pathname)}, accessToken: '' }),
	}).then(r => r.status + ' ' + r.text()).catch(e => 'ERR ' + e.message)`);
	console.log("  Twikoo 连通性：", String(net).slice(0, 200));

	// Twikoo 是异步渲染的，等它把编辑器画出来
	for (let i = 0; i < 30; i++) {
		const ok = await evaluate(
			`!!document.querySelector('#tcomment .tk-submit') || (document.getElementById('tcomment')?.innerText || '').trim().length > 0`,
		);
		if (ok) break;
		await sleep(1000);
	}

	console.log("\n[1] 未登录状态：", await probe());

	const { writeFileSync } = await import("node:fs");
	async function shotTo(path) {
		await evaluate(`document.getElementById('hybrid-comment').scrollIntoView({ block: 'start' }); 'ok'`);
		await sleep(800);
		const r = await send("Page.captureScreenshot", { format: "png" });
		writeFileSync(path, Buffer.from(r.data, "base64"));
		console.log("    截图：", path);
	}
	await shotTo("/home/austin/.cache/tmp/hybrid-locked.png");

	// 注入假身份，模拟 giscus 登录成功
	await evaluate(`localStorage.setItem('gh_identity_v1', JSON.stringify({
		login: 'Austinzhao039',
		avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
		url: 'https://github.com/Austinzhao039',
	})); location.reload();`);
	await sleep(1500);
	await send("Page.navigate", { url: URL_ });
	for (let i = 0; i < 40; i++) {
		await sleep(1000);
		if ((await evaluate("document.readyState")) === "complete") break;
	}
	await sleep(4000);

	console.log("[2] 已登录状态：", await probe());

	// 点发送，看用户须知
	const consent = await evaluate(`(async () => {
		const sleep = (ms) => new Promise(r => setTimeout(r, ms));
		// 空白评论时 Twikoo 会把发送按钮禁用（disabled 的按钮不会触发 click），先敲点字
		const ta = document.querySelector('#hybrid-comment textarea');
		if (ta) { ta.value = '这是一条自动化验收用的测试评论'; ta.dispatchEvent(new Event('input', { bubbles: true })); }
		await sleep(600);
		const btn = document.querySelector('#hybrid-comment .tk-send');
		if (!btn) return { error: '找不到发送按钮' };
		if (btn.disabled) return { error: '发送按钮仍是禁用状态' };
		btn.click();
		await sleep(300);
		const modal = document.getElementById('hc-consent-modal');
		return {
			modalOpen: !modal.hidden,
			title: document.getElementById('hc-consent-title').textContent,
			items: document.querySelectorAll('#hc-consent-list li').length,
			agreeText: document.getElementById('hc-consent-yes').textContent,
		};
	})()`);
	console.log("[3] 用户须知：", consent);

	const afterAgree = await evaluate(`(() => {
		document.getElementById('hc-consent-yes').click();
		return { stored: localStorage.getItem('comment_consent_v1'), version: document.getElementById('hybrid-comment').dataset.consentVersion };
	})()`);
	console.log("[4] 同意后：", afterAgree);

	// 同意后会自动补一次发送，等评论真的落地，看看头像是不是 GitHub 的
	await sleep(4000);
	const posted = await probe();
	console.log("[4b] 提交后：", {
		comments: posted.comments,
		avatars: posted.avatars,
		text: posted.tcommentText.split("\n").filter(Boolean).slice(-6),
	});

	await evaluate(`document.getElementById('hybrid-comment').scrollIntoView({ block: 'start' }); 'ok'`);
	await sleep(800);
	await shotTo("/home/austin/.cache/tmp/hybrid-comment.png");

	// 登录弹层应该注入 giscus，并固定指向专门用来登录的那个帖子
	const giscus = await evaluate(`(() => {
		document.getElementById('hc-switch-btn').click();
		const s = document.querySelector('#hc-giscus-host script');
		return s ? {
			src: s.src,
			repo: s.getAttribute('data-repo'),
			mapping: s.getAttribute('data-mapping'),
			term: s.getAttribute('data-term'),
			emitMetadata: s.getAttribute('data-emit-metadata'),
			modalOpen: !document.getElementById('hc-gh-modal').hidden,
		} : { error: '没有注入 giscus 脚本' };
	})()`);
	console.log("[6] GitHub 登录弹层：", giscus);

	// 退出登录后，遮罩应该重新盖回编辑框上
	const afterLogout = await evaluate(`(async () => {
		document.getElementById('hc-gh-close').click();
		document.getElementById('hc-logout-btn').click();
		await new Promise(r => setTimeout(r, 800));
		const root = document.getElementById('hybrid-comment');
		const s = root.querySelector('.tk-submit');
		const g = root.querySelector('.hc-gate');
		return {
			locked: root.classList.contains('hc-locked'),
			gate: !!g,
			gateInsideSubmit: !!(g && s && s.contains(g)),
			submitPointerEvents: s ? getComputedStyle(s).pointerEvents : null,
			userBarHidden: document.getElementById('hc-user').hidden,
		};
	})()`);
	console.log("[7] 退出登录后：", afterLogout);

	ws.close();
}

main().catch((e) => {
	console.error("验收失败：", e);
	process.exit(1);
});
