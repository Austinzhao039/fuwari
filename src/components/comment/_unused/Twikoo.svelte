<script lang="ts">
import { onMount } from "svelte";

interface Props {
	path: string;
	envId: string;
}

let { path, envId }: Props = $props();

let loaded = $state(false);

async function initTwikoo() {
	// 清空旧评论容器
	const el = document.getElementById("tcomment");
	if (el) el.innerHTML = "";

	try {
		// @ts-ignore - twikoo 由 CDN 全局注入
		if (typeof twikoo !== "undefined") {
			// @ts-ignore
			twikoo.init({
				envId,
				el: "#tcomment",
				path,
			});
		} else {
			// 首次加载 CDN 脚本
			const script = document.createElement("script");
			script.src = "https://cdn.staticfile.org/twikoo/1.6.32/twikoo.all.min.js";
			script.onload = () => {
				// @ts-ignore
				twikoo.init({
					envId,
					el: "#tcomment",
					path,
				});
			};
			document.head.appendChild(script);
		}
		loaded = true;
	} catch (e) {
		console.error("Twikoo 初始化失败:", e);
	}
}

onMount(() => {
	initTwikoo();
});
</script>

<div id="tcomment"></div>
