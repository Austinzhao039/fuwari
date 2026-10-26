// 验证：登录入口内嵌在评论输入框位置（不再弹窗）
const CDP = "http://127.0.0.1:9223";
const URL_ = process.argv[2] || "http://127.0.0.1:8901/posts/my-blog-notes/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
const { writeFileSync } = await import("node:fs");
async function shot(p) { await evaluate("document.getElementById('hybrid-comment').scrollIntoView({block:'start'});'ok'"); await sleep(9000); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(p, Buffer.from(r.data, "base64")); console.log("   截图:", p); }

await send("Page.enable"); await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__gm=[];window.addEventListener('message',function(e){if(e.origin!=='https://giscus.app')return;try{window.__gm.push(e.data.giscus)}catch(_){}});" });
await send("Page.navigate", { url: URL_ });
await sleep(6000);
await evaluate("localStorage.clear(); 'ok'").catch(() => {});
await send("Page.navigate", { url: URL_ });
// 等 Twikoo 把编辑器画出来（CDN 慢的时候要几十秒）
for (let i = 0; i < 45; i++) {
	await sleep(1000);
	if (await evaluate("!!document.querySelector('#hybrid-comment .tk-submit')")) break;
}
await sleep(4000);

console.log("[未登录]", JSON.stringify(await evaluate(`(() => {
  const root = document.getElementById('hybrid-comment');
  const submit = root.querySelector('.tk-submit');
  const gate = root.querySelector('.hc-gate');
  const host = root.querySelector('#hc-giscus-host');
  const f = host && host.querySelector('iframe');
  const hiddenKids = submit ? [...submit.children].filter(c => !c.classList.contains('hc-gate') && getComputedStyle(c).display === 'none').length : -1;
  return {
    hasSubmit: !!submit, hasGate: !!gate, gateInSubmit: !!(gate && submit && submit.contains(gate)),
    gateIsOverlay: gate ? getComputedStyle(gate).position : null,
    hiddenKids, hasIframe: !!f,
    iframeW: f ? Math.round(f.getBoundingClientRect().width) : 0,
    iframeH: f ? Math.round(f.getBoundingClientRect().height) : 0,
    gateH: gate ? Math.round(gate.getBoundingClientRect().height) : 0,
    iframeSrc: f ? f.getAttribute('src') : null,
    scripts: host ? host.querySelectorAll('script').length : -1,
    viewportY: gate ? Math.round(gate.getBoundingClientRect().top) : 0,
  };
})()`)));
console.log("[giscus 消息]", JSON.stringify(await evaluate("(window.__gm||[]).slice(0,4)")));
console.log("[console 错误]", JSON.stringify(await evaluate("(window.__errs||[]).slice(0,3)")));
await shot("/home/austin/.cache/tmp/inline-login.png");

// 模拟已登录
await evaluate(`localStorage.setItem('gh_identity_v1', JSON.stringify({login:'Austinzhao039',avatarUrl:'https://avatars.githubusercontent.com/u/187154626?v=4',url:'https://github.com/Austinzhao039'})); location.reload();`);
await sleep(1500);
await send("Page.navigate", { url: URL_ });
await sleep(18000);
console.log("[已登录]", JSON.stringify(await evaluate(`(() => {
  const root = document.getElementById('hybrid-comment');
  const submit = root.querySelector('.tk-submit');
  return {
    gate: !!root.querySelector('.hc-gate'),
    locked: root.classList.contains('hc-locked'),
    userBarVisible: !document.getElementById('hc-user').hidden,
    editorVisible: submit ? [...submit.children].some(c => getComputedStyle(c).display !== 'none') : false,
    nick: (root.querySelector('.tk-meta-input input[name=nick]')||{}).value,
  };
})()`)));
await shot("/home/austin/.cache/tmp/inline-loggedin.png");
ws.close();
