import type {
	CommentConfig,
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";

export const siteConfig: SiteConfig = {
	title: "Austin's blog",
	subtitle: "技术分享与实践",
	lang: "zh_CN", // Language code, e.g. 'en', 'zh_CN', 'ja', etc.
	themeColor: {
		hue: 345, // Default hue for the theme color, from 0 to 360. e.g. red: 0, teal: 200, cyan: 250, pink: 345
		fixed: false, // Hide the theme color picker for visitors
	},
	banner: {
		enable: false,
		src: "assets/images/demo-banner.png", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: false, // Display the credit text of the banner image
			text: "", // Credit text to be displayed
			url: "", // (Optional) URL link to the original artwork or artist's page
		},
	},
	// 左侧栏广告位（在「标签」和「运行时间」之间）
	// 用法：把 public/ads/sidebar-280x250.png 换成你的广告图（或改 mode: "html" 粘联盟代码），
	// 再把 enable 改成 true 就上线。enable=false 时整个节点不渲染、不占位。
	adConfig: {
		sidebar: {
			enable: false, // ← 换好素材后改成 true
			label: "广告",
			// "image" = 图片广告（自己找图 + 填跳转链接）；"html" = 粘贴联盟代码
			mode: "image",
			image: "/ads/sidebar-280x250.png", // 放 public/ads/ 下，宽度建议 ≤280
			link: "https://example.com",
			alt: "赞助商",
			height: 250, // 占位高度，防止图片加载完后页面跳动
			// mode 为 "html" 时用这段（示例：AdSense）
			html: "",
		},
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		// Leave this array empty to use the default favicon
		// {
		//   src: '/favicon/icon.png',    // Path of the favicon, relative to the /public directory
		//   theme: 'light',              // (Optional) Either 'light' or 'dark', set only if you have different favicons for light and dark mode
		//   sizes: '32x32',              // (Optional) Size of the favicon, set only if you have favicons of different sizes
		// }
	],
	startDate: "2025-12-27",
};

export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		LinkPreset.Friends,
		LinkPreset.About,
		{
			name: "GitHub",
			url: "https://github.com/Austinzhao039", // Internal links should not include the base path, as it is automatically added
			external: true, // Show an external link icon and will open in a new tab
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "assets/images/demo-avatar.png", // Relative to the /src directory. Relative to the /public directory if it starts with '/'这里是左边上面的头像，下面一行是名字，再下面一行是介绍
	name: "Austin666",
	bio: "啥都做一点",
	links: [
		{
			name: "github",
			icon: "fa6-brands:github", // Visit https://icones.js.org/ for icon codes
			// You will need to install the corresponding icon set if it's not already included
			// `pnpm add @iconify-json/<icon-set-name>`
			url: "https://github.com/Austinzhao039",
		},
		{
			name: "bilibili",
			icon: "fa6-brands:bilibili",
			url: "https://space.bilibili.com/1187730679",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	// Note: Some styles (such as background color) are being overridden, see the astro.config.mjs file.
	// Please select a dark theme, as this blog theme currently only supports dark background color
	theme: "github-dark",
};

// Twikoo 评论后端（自建，Nginx 反代 twikoo.austin666.top）
const DEFAULT_TWIKOO_ENV_ID = "https://twikoo.austin666.top";

// 允许用环境变量覆盖，但只有它长得像一个真正的 URL 时才采用。
// 教训：构建机/面板曾把这里替换成 "PANEL_APP_PORT_HTTP" 这类变量名，
// Twikoo 不认为是 URL 就会走腾讯 CloudBase 分支，报 INVALID_APP_SIGN，评论区整块空白。
// 这个文件同时会被 astro.config.mjs 在纯 Node 环境里 import，
// 那里没有 import.meta.env，所以要可选链取值，不能用点号直取。
const envBag = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const twikooEnvOverride = envBag?.TWIKOO_ENV_ID;
const twikooEnvId = /^https?:\/\/\S+$/i.test(twikooEnvOverride ?? "")
	? (twikooEnvOverride as string)
	: DEFAULT_TWIKOO_ENV_ID;

// twikoo-giscus | twikoo | giscus | artalk
// - twikoo-giscus（默认）：giscus 只用来做 GitHub 登录，评论正文写进自建 Twikoo。
//   这样既有「必须用 GitHub 账号」，又保住 Twikoo 自带的 IP 属地 / 浏览器信息 / 审核 / 违禁词，
//   服务端不用再部署 Artalk 之类的新东西。
// - giscus：评论直接存 GitHub Discussions，拿不到访客 IP/UA，也塞不进同意书
// - artalk：自建（deploy/artalk/），功能最全但要额外跑一个 Go 后端
// - twikoo：纯 Twikoo，昵称邮箱手填，不需要 GitHub 登录
const providerEnv = envBag?.COMMENT_PROVIDER;
const commentProvider: "twikoo" | "twikoo-giscus" | "giscus" | "artalk" =
	providerEnv === "artalk" ||
	providerEnv === "twikoo" ||
	providerEnv === "giscus" ||
	providerEnv === "twikoo-giscus"
		? providerEnv
		: "twikoo-giscus";

// 本地联调时可指向 http://127.0.0.1:23366
const artalkServer = (envBag?.ARTALK_SERVER || "https://www.austin666.top/comments-api").replace(/\/+$/, "");

export const commentConfig: CommentConfig = {
	provider: commentProvider,
	twikoo: {
		envId: twikooEnvId,
		lang: "zh-CN",
		// 与后端返回的版本保持一致，避免前后端协议错位
		version: "1.6.44",
	},
	giscus: {
		repo: "Austinzhao039/fuwari",
		repoId: "R_kgDOQrqIAw", // 公开 API 查到的 node_id
		category: "Announcements",
		// Announcements 分类只有维护者能新建 discussion，giscus App 代发，
		// 普通用户没法绕过评论区自己开帖。
		categoryId: "DIC_kwDOQrqIA84DJkEC",
		mapping: "pathname",
		strict: "0",
		reactionsEnabled: "1",
		inputPosition: "top",
		lang: "zh-CN",
		// 评论区「管理员」徽章的样式：giscus 在 iframe 里，只能靠 data-theme 传自定义 CSS。
		// 该 CSS 由 scripts/build-giscus-theme.mjs 按后台管理员名单生成（public/giscus/）。
		// giscus 用 <link crossorigin> 加载，必须带 CORS 头 —— 本站 nginx 不发，
		// 所以走 jsDelivr 镜像仓库里的同一份文件（ACAO: *）。
		themeBase: "https://cdn.jsdelivr.net/gh/Austinzhao039/fuwari@main/public/giscus",
		badgeText: "管理员",
		// twikoo-giscus 模式下，登录用的 giscus 固定指向这个标题的帖子。
		// 需要在仓库 Discussions 里建一个同名帖子（一次性）：
		// https://github.com/Austinzhao039/fuwari/discussions/new?category=Announcements&title=giscus-login
		loginTerm: "giscus-login",
	},
	// 图片上传：Twikoo 1.6.44 内置的图床全试过（smms 通道已 404、7bu/imgos 收费、
	// beeimg 被攻击封停、img520 的 links.url 可用），最终改成浏览器直传第三方。
	media: {
		uploader: "img520",
		endpoint: "https://img520.com/api/v1/upload",
		maxImageMB: 5,
	},
	moderation: {
		// 与后台 AKISMET_KEY=MANUAL_REVIEW 对应：开了审核就置 true，前端会提示访客
		reviewRequired: true,
		notice: "评论提交后需经审核，通过后才会显示。",
	},
	artalk: {
		// 自建评论后端，部署见 deploy/artalk/README.md
		server: artalkServer,
		site: "Austin 的博客",
	},
	consent: {
		// 改了文案/条款就改版本号，访客会重新看到同意书
		version: "2026-10-25",
		title: "评论前请阅读",
		items: [
			"发表评论时，会记录并保存你的 IP 地址和浏览器信息（User-Agent）。",
			"IP 地址不会公开显示，评论区只显示到省市与运营商的归属地，例如「上海电信」。",
			"浏览器与系统信息会随评论一起公开显示，例如「Chrome 141 / Windows 10」。",
			"你填写的昵称、网址会随评论公开；邮箱仅用于生成头像，不会明文展示。",
			"以上信息只用于展示评论来源和拦截垃圾评论，不作其他用途；需要删除请联系站长。",
		],
		agree: "我已阅读并同意",
	},
};
