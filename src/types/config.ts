import type { AUTO_MODE, DARK_MODE, LIGHT_MODE } from "@constants/constants";

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
	/** 用哪套评论：twikoo = 自建后端；giscus = GitHub Discussions（必须登录才能评论） */
	provider?: "twikoo" | "giscus";
	twikoo?: TwikooConfig;
	giscus?: GiscusConfig;
	moderation?: CommentModerationConfig;
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
};

export type ExpressiveCodeConfig = {
	theme: string;
};
