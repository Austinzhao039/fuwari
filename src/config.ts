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

// twikoo | giscus。默认用 giscus：必须登录 GitHub 才能发评论。
// 想临时退回 Twikoo：构建时加 COMMENT_PROVIDER=twikoo，或改下面的默认值。
const commentProvider: "twikoo" | "giscus" =
	envBag?.COMMENT_PROVIDER === "twikoo" ? "twikoo" : "giscus";

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
	},
	moderation: {
		// 与后台 AKISMET_KEY=MANUAL_REVIEW 对应：开了审核就置 true，前端会提示访客
		reviewRequired: true,
		notice: "评论提交后需经审核，通过后才会显示。",
	},
};
