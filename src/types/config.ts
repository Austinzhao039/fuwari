import type { AUTO_MODE, DARK_MODE, LIGHT_MODE } from "@constants/constants";

// 侧边栏广告位。两种用法：
//   mode: "image" —— 填图片 + 跳转链接（自售广告位、友链位、联盟图片广告）
//   mode: "html"  —— 直接粘联盟给的代码（AdSense / 百度联盟 等）
// 法规提示：中国大陆《互联网广告管理办法》要求互联网广告显著标明「广告」，
// 所以 label 默认就是"广告"，别改成看不出是广告的词。
export type AdSlotConfig = {
	enable: boolean;
	label?: string;
	mode?: "image" | "html";
	image?: string;
	link?: string;
	alt?: string;
	html?: string;
	height?: number;
};

export type SiteConfig = {
	title: string;
	subtitle: string;

	lang:
		| "en"
		| "zh_CN"
		| "zh_TW"
		| "ja"
		| "ko"
		| "es"
		| "th"
		| "vi"
		| "tr"
		| "id";

	themeColor: {
		hue: number;
		fixed: boolean;
	};
	banner: {
		enable: boolean;
		src: string;
		position?: "top" | "center" | "bottom";
		credit: {
			enable: boolean;
			text: string;
			url?: string;
		};
	};
	adConfig?: {
		sidebar?: AdSlotConfig;
	};
	toc: {
		enable: boolean;
		depth: 1 | 2 | 3;
	};

	favicon: Favicon[];
	/** 网站起始运行日期，格式 "YYYY-MM-DD" */
	startDate?: string;
};

export type Favicon = {
	src: string;
	theme?: "light" | "dark";
	sizes?: string;
};

export enum LinkPreset {
	Home = 0,
	Archive = 1,
	About = 2,
	Series = 3,
	Friends = 4,
}

export type NavBarLink = {
	name: string;
	url: string;
	external?: boolean;
	i18nKey?: string;
};

export type NavBarConfig = {
	links: (NavBarLink | LinkPreset)[];
};

export type ProfileConfig = {
	avatar?: string;
	name: string;
	bio?: string;
	links: {
		name: string;
		url: string;
		icon: string;
	}[];
};

export type LicenseConfig = {
	enable: boolean;
	name: string;
	url: string;
};

export type LIGHT_DARK_MODE =
	| typeof LIGHT_MODE
	| typeof DARK_MODE
	| typeof AUTO_MODE;

export type BlogPostData = {
	body: string;
	title: string;
	published: Date;
	description: string;
	tags: string[];
	draft?: boolean;
	image?: string;
	category?: string;
	prevTitle?: string;
	prevSlug?: string;
	nextTitle?: string;
	nextSlug?: string;
};

export type CommentConfig = {
	/**
	 * 用哪套评论：
	 *   - twikoo-giscus：GitHub 登录（giscus 提供身份）+ 评论存自建 Twikoo（推荐，服务端只需 Twikoo）
	 *   - twikoo：纯 Twikoo，昵称邮箱手填
	 *   - giscus：评论直接存 GitHub Discussions
	 *   - artalk：自建 Artalk（功能最全，但要额外部署一个 Go 后端）
	 */
	provider?: "twikoo" | "twikoo-giscus" | "giscus" | "artalk";
	twikoo?: TwikooConfig;
	giscus?: GiscusConfig;
	artalk?: ArtalkConfig;
	consent?: CommentConsentConfig;
	moderation?: CommentModerationConfig;
	media?: CommentMediaConfig;
};

// 评论里的图片上传：Twikoo 1.6.44 自带的图床要么收费要么已失效，
// 所以改成浏览器直传第三方（对方必须允许 CORS）。
type CommentMediaConfig = {
	// img520 = 匿名直传 img520.com（免注册、免 token）；none = 关闭，只能贴链接
	uploader?: "img520" | "none";
	// 换成别家「返回 data.links.url」的接口时改这里
	endpoint?: string;
	// 单张图片上限（MB）
	maxImageMB?: number;
};

// Artalk 自建评论（支持 GitHub OAuth 登录、IP 属地、浏览器信息）
type ArtalkConfig = {
	// 后端地址，例如 https://www.austin666.top/comments-api
	server: string;
	// 站点名，要和后端 site_default 一致
	site: string;
};

// 首次评论前必须同意的《用户须知》
type CommentConsentConfig = {
	version: string;
	title: string;
	items: string[];
	agree: string;
};

// 评论审核提示（真正的审核逻辑在 Twikoo 后台：AKISMET_KEY=MANUAL_REVIEW）
type CommentModerationConfig = {
	reviewRequired?: boolean;
	notice?: string;
};

type TwikooConfig = {
	envId: string;
	region?: string;
	lang?: string;
	version?: string;
};

// giscus 配置，repoId / categoryId 从 https://giscus.app 获取
type GiscusConfig = {
	repo: string;
	repoId: string;
	category: string;
	categoryId: string;
	mapping?: string;
	strict?: string;
	reactionsEnabled?: string;
	inputPosition?: string;
	lang?: string;
	// 自定义主题 CSS 的目录（必须带 CORS，见 scripts/build-giscus-theme.mjs）
	themeBase?: string;
	// 管理员徽章文案（不填则用「管理员」）
	badgeText?: string;
	/**
	 * 「giscus 登录」模式的专用帖标题。
	 * giscus 只在 discussion 已存在时才会把登录者身份抛给父页面（见 giscus 源码
	 * components/Giscus.tsx：!data.discussion.id 时直接 return）。
	 * 所以这里固定指向一个专门的帖子，保证任何页面都能拿到登录态。
	 */
	loginTerm?: string;
};

export type ExpressiveCodeConfig = {
	theme: string;
};
