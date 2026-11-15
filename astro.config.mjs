// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";
import remarkDiagrams from "./src/utils/remark-diagrams.mjs";

// https://astro.build/config
export default defineConfig({
	site: "https://example.com",
	// 纯静态博客不需要开发浮标，关闭后预览画面更干净
	devToolbar: { enabled: false },
	integrations: [mdx(), sitemap()],
	// PlantUML / Mermaid 围栏先转成图表占位块，浏览器端再按需渲染成 SVG
	markdown: { remarkPlugins: [remarkDiagrams] },
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
