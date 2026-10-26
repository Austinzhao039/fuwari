// 验证 giscus 登录链路：登录用的 iframe 有没有拿到 discussion 元数据。
// 用途：万一哪天又报 "Discussion not found"，跑这个脚本看 giscus 到底回了什么。
// 用法：node scripts/verify-giscus-login.mjs [文章URL]
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
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
	return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });

// 在页面任何脚本之前就装监听，免得漏掉 giscus 早期发的消息
await send("Page.addScriptToEvaluateOnNewDocument", {
	source: "window.__m = []; window.addEventListener('message', function(e){ if (e.origin !== 'https://giscus.app') return; try { window.__m.push(e.data.giscus); } catch (err) {} });",
});

await send("Page.navigate", { url: URL_ });
await sleep(6000);
await evaluate("localStorage.clear(); 'ok'").catch(() => {});
await send("Page.navigate", { url: URL_ });
await sleep(12000);

// 登录 iframe 是内嵌的，等它出现并抓 giscus 回包
for (let i = 0; i < 30; i++) {
	await sleep(1000);
	if (await evaluate("!!document.querySelector('.hc-gate iframe')")) break;
}
await sleep(12000);

const msgs = await evaluate("window.__m || []");
console.log("giscus 消息：", JSON.stringify(msgs, null, 2).slice(0, 1200));
console.log(
	"登录层：",
	await evaluate("(() => { const g=document.querySelector('.hc-gate'); const h=document.querySelector('.hc-gate__hint'); return { gate: !!g, hint: h ? (h.hidden ? null : h.innerText) : null } })()"),
);
ws.close();
