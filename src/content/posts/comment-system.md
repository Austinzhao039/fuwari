---
title: 博客评论区搭建实录：giscus 负责身份，Twikoo 负责存评论
published: 2026-10-28
description: '一个"既要 GitHub 登录、又要审核后台"的评论区是怎么搭出来的，以及中间踩到的 7 个坑'
image: ''
tags: ["技术", "评论系统", "giscus", "Twikoo", "Astro"]
category: 'Tech'
lang: ''
---

博客写了半年，评论区一直是关着的。不是不想开，是没想清楚**评论要存在哪**。

这一篇记录一下最后怎么解决的，以及中间踩到的一堆坑——尤其是几个在文档里根本查不到、只能翻源码才能定位的问题。

---

## 一、先想清楚要什么

需求其实很具体：

- 访客用 **GitHub 账号**登录评论，不用填昵称邮箱（防灌水，也省事）
- 我要有**后台审核**，评论先审后显
- 我要能看到评论者的 **IP 归属地、操作系统、浏览器**
- 能带**违禁词过滤**
- 支持**贴图片**（不超过 5MB）

前两条就把方案砍掉一半了。

## 二、三种方案，各有各的残

| 方案 | 登录 | 审核 | IP/UA | 部署成本 |
| --- | --- | --- | --- | --- |
| **giscus**（纯） | GitHub ✅ | ❌ 无审核 | ❌ | 零 |
| **Artalk** | 需额外登录体系 | ✅ | ✅ | 要再跑一个服务 |
| **Twikoo** | 自带匿名/昵称 | ✅ | ✅ | 一个服务 |

- **纯 giscus** 最简单，评论直接进 GitHub Discussions，但**没有审核、没有 IP、没有违禁词**。访客发了立刻就可见，等于把评论区交给运气。
- **Artalk** 功能最全，但评论的 GitHub 登录要自己接 OAuth，而 GitHub 的 OAuth 端点**没有 CORS 头**，纯前端做不了，必须再写一个后端换 token。
- **Twikoo** 有现成的管理后台（审核、违禁词、IP/UA 全都有），部署也简单（一个 Docker 容器）。

痛点在于：**Twikoo 本身没有 GitHub 登录**。

所以最终架构是——**两个都装，各干一半**：

```
访客 → giscus（只负责"你是谁"）→ 拿到 GitHub 身份
                                    ↓
                    Twikoo（负责存评论、审核、统计）
```

giscus 只用来回答一个问题：**这个人是谁**。评论内容、审核、IP 归属地全部走 Twikoo。

听起来简单，实现起来踩了 7 个坑。

---

## 三、坑 1：giscus 只有在帖子存在时才会告诉你"谁是访客"

这是整件事的第一个死结。

我一开始的想法是：把 giscus 的评论区藏起来，只监听它发出的消息，从中读 `viewer`（当前访客）。结果页面上什么都没拿到。

翻 giscus 的前端源码才明白：

```tsx
// Giscus.tsx 里，讨论不存在时直接 return，什么都不发
if (!data.discussion.id) return
```

也就是说——**仓库里没有对应的 Discussion 帖，giscus 一句话都不会说**，连"未登录"都不会告诉你。

解决办法：在仓库里**专门建一个用来登录的帖子**，让 giscus 始终有东西可加载。

```html
data-mapping="specific"
data-term="giscus-login"   <!-- 固定指向那个帖子 -->
```

这样每个页面加载的都是同一个 discussion，访客只要在任意页面登录，身份就是通的。

## 四、坑 2：`strict=1` 让那个帖子永远搜不到

帖子建好了，标题就叫 `giscus-login`，分类也对，但 giscus 仍然报：

```
Discussion not found
```

抓它的回调消息确认了这一点：

```json
[{ "error": "Discussion not found" }]
```

去翻 `services/github/getDiscussion.ts`，答案藏在这两行：

```js
const resolvedTerm = strict ? await digestMessage(term) : term;
const searchIn = strict ? 'in:body' : 'in:title';
```

`strict=1` 是 giscus 给**私密帖**设计的安全模式：它会把你给的 term **哈希掉**，然后去**正文**里搜这个哈希。也就是说，**任何按标题命名的帖子，在 strict=1 下永远搜不到**。

改成 `strict=0`（按标题原文搜），立刻拿到了帖子：

```json
{ "discussion": { "id": "D_kwDO...", "url": ".../discussions/1" } }
```

> 这个坑很隐蔽：giscus 的配置生成器默认给你的是 strict=1，而文档里只写了"严格匹配"，没写"会把标题哈希"。绕了快一个小时。

## 五、坑 3：未登录时，`viewer` 居然是 `giscus[bot]`

帖子能找到了，`viewer` 也有了，但值是这样的：

```json
{
  "viewer": {
    "login": "giscus[bot]",
    "url": "https://github.com/giscus%5Bbot%5D"
  }
}
```

因为 giscus 是**拿自己的 GitHub App 身份**去查帖子的。访客没登录时，那个"当前用户"就是它自己。

如果直接把这个当身份用，后果是：**任何人都能顶着 `giscus[bot]` 的名字发评论**，而且无法区分真假。

所以必须显式排除：

```ts
const GISCUS_BOT = "giscus[bot]";

if (data.viewer?.login && data.viewer.login !== GISCUS_BOT) {
  setIdentity(data.viewer);   // 这才是真人
}
```

## 六、坑 4：`twikoo.init` 会把你挂的节点整个换掉

身份拿到了，接下来要在未登录时挡住输入框。思路很自然：用 `MutationObserver` 盯着评论框，动态插一层遮罩。

结果观察器**只触发了一次就再也没动过**。

原因是 Twikoo 前端是基于 Vue 的，`twikoo.init()` 执行时会把 `#tcomment` 这个**节点整个替换**成新的 DOM。我挂的观察器盯着的那个节点，早就被扔掉不在文档里了。

所以**所有查询和监听都不能挂在 `#tcomment` 上**，要挂在不会被替换的外层容器（自己的那个 `<section>`）上：

```ts
// ❌ 会被 Vue 换掉
const root = document.querySelector("#tcomment")

// ✅ 外层容器，Twikoo 动不到
const root = document.querySelector("#hybrid-comment")
```

## 七、坑 5：把 giscus 塞进动态容器，iframe 建出来却不加载

我想把登录入口做成**内嵌**（不是弹窗），于是用 giscus 官方的 `client.js` 往一个会被反复重建的容器里注入。

现象很诡异：iframe 明明在 DOM 里，尺寸也对，但**永远是空白**，一条消息都不发。

查 `iframe.contentDocument` 是 `null`（说明跨域了、加载过），但抓包看子框架的 URL 是**空的**——它压根没导航。

结论是 `client.js` 依赖 `document.currentScript` 和脚本节点自身的位置，而我的容器会被反复重建/搬动，脚本执行时上下文已经不对了。

改成**自己建 iframe**，直接用 giscus 的 widget 地址：

```ts
const params = new URLSearchParams({
  origin: location.origin + location.pathname,
  repo: "...", repoId: "...", categoryId: "...",
  mapping: "specific", term: "giscus-login", strict: "0",
  emitMetadata: "1", theme: dark ? "dark" : "light",
});

const frame = document.createElement("iframe");
frame.src = `https://giscus.app/zh-CN/widget?${params}`;
```

代价是高度要自己管——giscus 会 postMessage 一个 `resizeHeight`，得自己接：

```ts
if (typeof data.resizeHeight === "number") {
  frame.style.height = `${data.resizeHeight}px`;
}
```

> 排查小贴士：CDP 的 `Page.getFrameTree` 对**跨进程 iframe（OOPIF）会显示 `(empty)`**，别据此判断"没加载"。用 `iframe.contentDocument === null` 判断是否已经跨域导航，更可靠。

## 八、坑 6：`position: fixed` 被祖先的 `transform` 劫持

登录弹层做出来之后，整个页面被蒙层盖住，**但弹窗本体看不见**。

量了一下：弹层高度 `3826px`，位置 `x=352, y=88`，宽 `872`——它根本没有铺满视口。

原因是页面外层有个 `div.onload-animation` 带了 `transform`（哪怕是 `matrix(1,0,0,1,0,0)` 这种等价于没变换的值）。**只要有 `transform`，这个元素就会成为后代 `position: fixed` 的包含块**，`inset: 0` 就变成了"填满它自己"。

修法很简单粗暴：把浮层挂到 `body` 上。

```ts
for (const el of [consentModal, toast]) {
  if (el && el.parentElement !== document.body) document.body.appendChild(el);
}
```

这类问题还有个变体：用 `:has()`、`backdrop-filter`、`will-change` 的容器也会踩到，排查时一路往上找 `transform / filter / contain` 就对了。

## 九、坑 7：Twikoo 1.6.44 的图床，一个都用不了

评论区没图太干，于是想开图片上传。Twikoo 1.6.44 支持这几种图床：

`qcloud / 7bu / smms / lskypro / piclist / easyimage`

逐个实测的结果：

| 图床 | 实测 |
| --- | --- |
| sm.ms | 首页 16 秒、API 9 秒；且 Twikoo 1.6.44 的 smms 通道直接 **404**（请求地址已变更） |
| 7bu.top | 收费（空间套餐） |
| imgos.cn | 也是收费的，免费额度只有 10MB |
| 蜜蜂图床 | 当时正被 DDoS 攻击，全站临时封停 |
| 图壳 imgkr | 站点已挂 |
| freeimage.host | 匿名能传，但协议要 Twikoo 2.x 才支持 |

最后走的方案是**绕开 Twikoo 自己传**：

在 `<input type="file">` 的 `change` 事件上拦一道，自己做体积校验（>5MB 直接拦）、自己 `fetch` 到图床，然后把 Markdown 插到光标处。

```ts
const res = await fetch("https://img520.com/api/v1/upload", {
  method: "POST", body: fd,   // 匿名可传，且响应带 ACAO: *
});

// 插到 textarea 光标处；直接改 value 后要派发 input，Vue 的 v-model 才认
ta.value = ta.value.slice(0, start) + md + ta.value.slice(end);
ta.dispatchEvent(new Event("input", { bubbles: true }));
```

选图床的判断标准其实只有三条：**能匿名传、返回 `data.links.url`、响应带 `Access-Control-Allow-Origin`**。

> 顺便：视频还是传不了。Twikoo 的文件白名单里只有图片，评论里请贴 B 站链接。

目前实际在用的是 **img520.com**：免注册可传、单图 30MB、响应带 `Access-Control-Allow-Origin: *`，所以浏览器能直接跨域上传，页面里不用暴露任何密钥。缺点是它是个人公益站，图片不可管理也不保证长期存活——重要内容建议自己再存一份。

## 十、怎么做到「先审后发」

这是我最想要的一条，而它的开关藏得最深——**不在「设置」页，而在反垃圾配置里**：

```text
AKISMET_KEY = MANUAL_REVIEW
```

设成这个特殊值之后，所有新评论都会被标记成 `isSpam: true`；而 **Twikoo 前端根本不渲染 `isSpam` 的评论**，页面上看起来就是「没有评论」——这就是待审状态。

实测的完整闭环：

| 步骤 | 结果 |
| --- | --- |
| 提交一条普通评论 | 后台该条 `isSpam = true`，页面渲染 **0 条** ✅ |
| 后台点「通过」 | `COMMENT_SET_FOR_ADMIN { id, set: { isSpam: false } }` → 页面立刻出现 ✅ |

### 但它有个必须知道的弱点

**前端过滤 ≠ 接口过滤。**

我直接调 `COMMENT_GET` 验证过：待审评论**照样会被返回**，只是页面不画出来。换句话说，任何会翻网络请求的人都能看到还没审的内容。

对个人博客够用（正常人不会去翻），但如果你要防的是「内容绝不能被看到」，这套靠不住，得换真正服务端过滤的方案。

> 我自己就在这儿栽了一次：一开始用接口返回的数量判断，得出「1.6.44 不支持审核」的错误结论。真相是「接口给、页面藏」，必须看渲染结果才算数。

---

## 十一、几个容易被忽略的合规细节

- **评论前须知**：首次发言弹一次《用户须知》，同意后记录版本号，换版本会重新弹。
- **广告标识**：如果侧栏放了商业广告，按《互联网广告管理办法》必须显著标明"广告"，这个标识别为了好看去掉。
- **图片上限**：前端先拦（5MB），别等传上去再失败。
- **署名规则**：登录后昵称/邮箱/主页自动带入并**锁成只读**，避免访客改成别人的名字冒充。

## 十二、踩坑清单

| # | 现象 | 真凶 | 解法 |
| --- | --- | --- | --- |
| 1 | giscus 一条消息都不发 | discussion 不存在时源码直接 return | 建一个固定的登录专用帖 |
| 2 | 帖子明明存在却 `Discussion not found` | `strict=1` 会把标题哈希后搜正文 | `strict=0` |
| 3 | 未登录也能"以 bot 身份登录" | 未登录时 viewer 是 `giscus[bot]` | 显式排除这个账号 |
| 4 | 遮罩插进去就再也不响应 | `twikoo.init` 把 `#tcomment` 整个替换 | 挂在外层容器上 |
| 5 | iframe 建出来一片空白 | `client.js` 依赖节点位置 | 自己按 widget 地址建 iframe |
| 6 | 弹层盖住整页却看不到框 | 祖先 `transform` 劫持了 fixed 的包含块 | 挂到 `body` |
| 7 | 图片按钮点了报错 | 内置图床全废 | 浏览器直传第三方 |

## 十三、结果

现在评论区的流程是：

1. 未登录 → 输入框位置直接显示 GitHub 登录入口（**不是弹窗**）
2. 点「使用 GitHub 登录」→ 授权 → 回到页面
3. 身份自动带入，昵称/头像/主页锁定只读
4. 首次发言弹须知 → 同意 → 提交
5. 后台审核 → 通过后显示，带 IP 归属地、系统、浏览器

代码全部在前端一个 Astro 组件里，服务端只跑一个 Twikoo 容器。

说句实话：这套东西的复杂度**不太值**。如果你只是想有个评论区，纯 giscus 十分钟就能搞定。但如果你像我一样，既想要 GitHub 登录的干净，又舍不得审核和 IP 归属地，那这 7 个坑基本躲不掉——希望这篇能让你少踩几个。
