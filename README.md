# Astro Starter Kit: Blog

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/astro-blog-starter-template)

![Astro Template Preview](https://github.com/withastro/astro/assets/2244813/ff10799f-a816-4703-b967-c78997e8323d)

<!-- dash-content-start -->

Create a blog with Astro and deploy it on Cloudflare Workers as a [static website](https://developers.cloudflare.com/workers/static-assets/).

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support
- ✅ Built-in Observability logging

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/astro-blog-starter-template
```

A live public deployment of this template is available at [https://astro-blog-starter-template.templates.workers.dev](https://astro-blog-starter-template.templates.workers.dev)

## 🚀 Project Structure

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 📕 图文摘要（小红书图卡）

`/summaries` 是独立于博客文章的图文栏目，用来归档 SelfMedia 里带设计稿的小红书内容。图卡不是截图，而是把设计稿的 HTML 抽出来直接嵌入（`public/summaries/<slug>/NN.html`），所以文字清晰、可以随窗口缩放。

同步命令：

```bash
npm run sync:summaries              # 增量同步（默认只处理带 designs 的项目）
npm run sync:summaries -- --dry-run # 只打印将要做的事，不写文件
npm run sync:summaries -- --force   # 忽略 sourceHash，强制重建
npm run sync:summaries -- --only <slug>  # 只同步某一个条目
npm run sync:summaries -- --include-images # 同时收录只有图片、没有 designs 的项目
npm run sync:summaries -- --no-prune # 不清理源目录已删除的生成条目
```

- 源目录默认是 `/Users/zhiyuan/SelfMedia`，可用 `SELF_MEDIA_ROOT=/path/to/SelfMedia npm run sync:summaries` 覆盖。
- 顶层设计集到内容项目的映射、以及固定 slug，写在 [`scripts/summaries.config.json`](scripts/summaries.config.json)。新增设计稿时在这里补一条 `designProjects`，再跑同步。
- 同步会生成两类文件：`src/content/summaries/*.md`（标题、配文、话题、卡片列表）和 `public/summaries/<slug>/`（图卡 HTML 与素材）。源内容变化时才重建；生成条目在源内容消失后会自动清理。
- 阅读页左侧是图卡滑动预览，右侧是配文；支持方向键、滑动翻页和点击放大。

## 📝 文章同步（SelfMedia 母稿）

博客文章直接从 SelfMedia 各项目的 `母稿.md` 同步：

```bash
npm run sync:posts              # 增量同步全部母稿
npm run sync:posts -- --dry-run # 只看计划，不写文件
npm run sync:posts -- --force   # 忽略 sourceHash，强制重写
npm run sync:posts -- --only <slug>  # 只同步一篇
npm run sync:posts -- --no-prune     # 不清理源项目已删除的生成文章
```

- 源目录默认是 `/Users/zhiyuan/SelfMedia`，可用 `SELF_MEDIA_ROOT=/path/to/SelfMedia npm run sync:posts` 覆盖。
- 固定 slug、特殊源文件（例如正文在 `更新总结.md` 或 `公众号/正文.md`）和分类改名写在 [`scripts/posts.config.json`](scripts/posts.config.json)。
- 正文里的图片会复制到 `public/posts/<slug>/assets/`，Obsidian 的 `![[...]]` 嵌入、跨文章链接、callout 和本地绝对路径都会转成适合发布的写法。
- 生成的文章带 `generatedBy: "sync-posts"` 与 `sourceHash`，方便增量更新和安全清理；手写文章不会被覆盖。
- 文章卡片在没有 `heroImage` 时会生成排版封面，分类与标签来自 frontmatter。

## 📊 图表（PlantUML / Mermaid）

` ```plantuml `、` ```puml `、` ```uml `、` ```mermaid `、` ```mmd ` 围栏会由 [`src/utils/remark-diagrams.mjs`](src/utils/remark-diagrams.mjs) 转成图表占位块，再由 [`src/scripts/diagrams.js`](src/scripts/diagrams.js) 在浏览器里按需渲染成 SVG；渲染失败时保留源码可读。

- PlantUML 使用 `@plantuml/core` 本地渲染，不经过任何外部服务；引擎文件通过 `?url` 原样输出（minify 会破坏 TeaVM 生成的代码），只在页面出现图表时才加载。
- Mermaid 使用 `mermaid` 官方引擎，关闭 HTML label，渲染结果会跟随站点的明暗主题重新生成。
- 图表颜色从 CSS 变量（`--ink`、`--accent`、`--surface` 等）读取，与图文摘要卡片共用一套色板。

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                           | Action                                           |
| :-------------------------------- | :----------------------------------------------- |
| `npm install`                     | Installs dependencies                            |
| `npm run dev`                     | Starts local dev server at `localhost:4321`      |
| `npm run build`                   | Build your production site to `./dist/`          |
| `npm run preview`                 | Preview your build locally, before deploying     |
| `npm run astro ...`               | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help`         | Get help using the Astro CLI                     |
| `npm run build && npm run deploy` | Deploy your production site to Cloudflare        |
| `npm wrangler tail`               | View real-time logs for all Workers              |

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).
