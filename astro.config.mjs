// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";
import remarkDiagrams from "./src/utils/remark-diagrams.mjs";
import rehypeBase from "./src/utils/rehype-base.mjs";

// GitHub Pages 项目页部署在 https://<owner>.github.io/<repo>/ 下。
// CI 中设置 DEPLOY_TARGET=gh-pages 即切换为静态构建；本地与 Cloudflare 构建不变。
// 自定义域名时再设置 SITE_URL=https://your.domain、BASE_PATH=/。
const isGitHubPages = process.env.DEPLOY_TARGET === "gh-pages";
const [repoOwner, repoName] = (process.env.GITHUB_REPOSITORY ?? "someoneoncesaid/astro-blog").split("/");
const base = process.env.BASE_PATH || (isGitHubPages ? `/${repoName}` : "/");
const site =
	process.env.SITE_URL ||
	(isGitHubPages ? `https://${repoOwner}.github.io` : "https://example.com");

// https://astro.build/config
export default defineConfig({
	site,
	base,
	// 纯静态博客不需要开发浮标，关闭后预览画面更干净
	devToolbar: { enabled: false },
	integrations: [mdx(), sitemap()],
	// PlantUML / Mermaid 围栏先转成图表占位块，浏览器端再按需渲染成 SVG
	markdown: {
		remarkPlugins: [remarkDiagrams],
		// 内容中的 /posts/... 图片和站内链接统一补上 base 前缀
		rehypePlugins: [[rehypeBase, { base }]],
	},
	// GitHub Pages 只能用纯静态产物；其他环境保留 Cloudflare 适配器
	...(isGitHubPages
		? {}
		: {
				adapter: cloudflare({
					platformProxy: {
						enabled: true,
					},
				}),
			}),
});
