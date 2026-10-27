// 验证：浏览器直传第三方图床（img520）→ 自动插入 Markdown
const CDP = "http://127.0.0.1:9223";
const URL_ = process.argv[2] || "http://127.0.0.1:8901/posts/my-blog-notes/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)(m);
		pending.delete(m.id);
	}
});
const send = (method, params = {}) =>
	new Promise((res, rej) => {
		const i = ++id;
		pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
		ws.send(JSON.stringify({ id: i, method, params }));
	});
const evaluate = async (expr) => {
	const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
	return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: URL_ });
await sleep(6000);
// 假装已登录，让编辑框显示出来
await evaluate(
	`localStorage.setItem('gh_identity_v1', JSON.stringify({login:'Austinzhao039',avatarUrl:'',url:'https://github.com/Austinzhao039'})); 'ok'`,
);
await send("Page.navigate", { url: URL_ });
for (let i = 0; i < 45; i++) {
	await sleep(1000);
	if (await evaluate("!!document.querySelector('#hybrid-comment .tk-submit')")) break;
}
await sleep(3000);

console.log(
	"[配置]",
	await evaluate(`(() => {
		const w = document.getElementById('hybrid-comment');
		return { uploader: w.dataset.uploader, endpoint: w.dataset.uploadEndpoint, maxMB: w.dataset.maxImageMb };
	})()`),
);

// 造一张 900x600 的真图，塞进 file input 并触发 change
const result = await evaluate(`(async () => {
	const c = document.createElement('canvas');
	c.width = 900; c.height = 600;
	const g = c.getContext('2d');
	g.fillStyle = '#1e2840'; g.fillRect(0,0,900,600);
	g.strokeStyle = '#4d6bfe'; g.lineWidth = 4;
	for (let x = 0; x < 900; x += 40) { g.beginPath(); g.moveTo(x,0); g.lineTo(x,600); g.stroke(); }
	g.fillStyle = '#d946a6'; g.font = 'bold 64px sans-serif'; g.fillText('上传测试', 260, 320);
	const blob = await new Promise(r => c.toBlob(r, 'image/png'));
	const file = new File([blob], 'upload-test.png', { type: 'image/png' });

	const inp = document.querySelector('#hybrid-comment input[type=file]');
	if (!inp) return { error: '没有 file input' };
	const dt = new DataTransfer();
	dt.items.add(file);
	inp.files = dt.files;

	const toasts = [];
	const t = document.getElementById('hc-toast');
	const t0 = Date.now();
	inp.dispatchEvent(new Event('change', { bubbles: true }));

	// 等 toast 变成「已插入」或「失败」，最多 40 秒
	for (let i = 0; i < 80; i++) {
		await new Promise(r => setTimeout(r, 500));
		const txt = t.innerText || '';
		if (txt) toasts.push(txt);
		if (/已插入|失败/.test(txt)) break;
	}
	const ta = document.querySelector('#hybrid-comment .tk-input textarea');
	return {
		ms: Date.now() - t0,
		lastToast: t.innerText,
		toasts: [...new Set(toasts)].slice(-3),
		comment: ta ? ta.value : null,
	};
})()`);

console.log("[上传]", result);

const url = /\((https?:\/\/[^)]+)\)/.exec(result.comment || "")?.[1];
if (url) {
	console.log("[图片可访问性]", await evaluate(`new Promise((resolve) => {
		const im = new Image(); const t0 = Date.now();
		im.onload = () => resolve({ ok: true, w: im.naturalWidth, h: im.naturalHeight, ms: Date.now() - t0 });
		im.onerror = () => resolve({ ok: false, ms: Date.now() - t0 });
		im.src = ${JSON.stringify(url)};
	})`));
	console.log("  图片地址：", url);
}
ws.close();
