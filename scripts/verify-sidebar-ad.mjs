// 截侧边栏，确认广告位在「标签」和「运行时间」之间
const CDP = "http://127.0.0.1:9223";
const URL_ = process.argv[2] || "http://127.0.0.1:8901/";
const OUT = process.argv[3] || "/home/austin/.cache/tmp/sidebar-ad.png";
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
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: URL_ });
await sleep(9000);

console.log(
	"[结构]",
	await evaluate(`(() => {
		const side = document.getElementById('sidebar-sticky');
		if (!side) return { error: '没有 #sidebar-sticky' };
		const kids = [...side.children].map(el => ({ id: el.id || el.tagName.toLowerCase(), h: Math.round(el.getBoundingClientRect().height) }));
		const ad = document.getElementById('sidebar-ad');
		return {
			order: kids,
			adExists: !!ad,
			adHeight: ad ? Math.round(ad.getBoundingClientRect().height) : 0,
			adTop: ad ? Math.round(ad.getBoundingClientRect().top) : 0,
			badge: ad ? (ad.querySelector('.ad-badge') || {}).textContent : null,
			imgLoaded: ad ? !!ad.querySelector('img') && ad.querySelector('img').naturalWidth : false,
		};
	})()`),
);

const { writeFileSync } = await import("node:fs");
await evaluate(`document.getElementById('sidebar-ad')?.scrollIntoView({block:'center'}); 'ok'`);
await sleep(900);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(OUT, Buffer.from(shot.data, "base64"));
console.log("截图：", OUT);
ws.close();
