<script lang="ts">
import { supportedLanguages, getAllTranslations, type Translation } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";

const translations = getAllTranslations();
const LANG_KEY = "fuwari-lang";

let currentLang: string = $state("zh_CN");
let panelOpen: boolean = $state(false);

onMount(() => {
	const stored = localStorage.getItem(LANG_KEY);
	if (stored && translations[stored]) {
		currentLang = stored;
	}
	applyLanguage(currentLang);
});

function switchLang(code: string) {
	if (code === currentLang) return;
	currentLang = code;
	localStorage.setItem(LANG_KEY, code);
	applyLanguage(code);
	panelOpen = false;
}

function applyLanguage(lang: string) {
	const t = translations[lang];
	if (!t) return;

	// 更新 <html lang>
	document.documentElement.lang = lang.replace("_", "-");

	// 更新所有带 data-i18n-key 的元素
	document.querySelectorAll("[data-i18n-key]").forEach((el) => {
		const key = el.getAttribute("data-i18n-key");
		if (key && t[key as keyof Translation]) {
			el.textContent = t[key as keyof Translation];
		}
	});
}

function togglePanel() {
	panelOpen = !panelOpen;
}

function hidePanel() {
	panelOpen = false;
}

function currentLabel(): string {
	for (const sl of supportedLanguages) {
		if (sl.code === currentLang) return sl.label;
	}
	return "Language";
}
</script>

<div class="relative z-50" role="menu" tabindex="-1" onmouseleave={hidePanel}>
	<button
		aria-label="Switch Language"
		role="menuitem"
		class="btn-plain scale-animation rounded-lg h-11 px-2 font-bold text-sm active:scale-90"
		id="lang-switch"
		onclick={togglePanel}
		onmouseenter={() => panelOpen = true}
	>
		<Icon icon="material-symbols:translate" class="text-[1.25rem]"></Icon>
	</button>

	<div
		id="lang-panel"
		class="hidden lg:block absolute transition float-panel-closed top-11 -right-2 pt-5"
		class:float-panel-closed={!panelOpen}
	>
		<div class="card-base float-panel p-2 min-w-[8rem]">
			{#each supportedLanguages as lang}
				<button
					class="flex transition whitespace-nowrap items-center !justify-start w-full btn-plain scale-animation rounded-lg h-9 px-3 font-medium active:scale-95 mb-0.5"
					class:current-theme-btn={lang.code === currentLang}
					onclick={() => switchLang(lang.code)}
				>
					<span class="text-sm">{lang.label}</span>
					{#if lang.code === currentLang}
						<Icon icon="material-symbols:check-small-rounded" class="text-[1.25rem] ml-auto text-[var(--primary)]"></Icon>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>

<!-- 移动端点击外部关闭 -->
<svelte:window onclick={(e) => {
	const panel = document.getElementById("lang-panel");
	const btn = document.getElementById("lang-switch");
	if (panel && btn && !panel.contains(e.target as Node) && !btn.contains(e.target as Node)) {
		panelOpen = false;
	}
}} />

