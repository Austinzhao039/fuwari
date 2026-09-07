class TwikooComment extends HTMLElement {
	connectedCallback() {
		const envId = this.getAttribute("data-env-id");
		const path = this.getAttribute("data-path");
		if (!envId || !path) return;

		// 用唯一 id 避免冲突
		const uid = "tcomment-" + Math.random().toString(36).slice(2, 8);
		this.innerHTML = `<div id="${uid}"></div>`;

		const loadTwikoo = () => {
			if (typeof twikoo !== "undefined") {
				twikoo.init({ envId, el: "#" + uid, path });
			} else {
				const s = document.createElement("script");
				s.src = "https://cdn.staticfile.org/twikoo/1.6.32/twikoo.all.min.js";
				s.onload = () => twikoo.init({ envId, el: "#" + uid, path });
				document.head.appendChild(s);
			}
		};

		requestAnimationFrame(loadTwikoo);
	}
}

if (!customElements.get("twikoo-comment")) {
	customElements.define("twikoo-comment", TwikooComment);
}
