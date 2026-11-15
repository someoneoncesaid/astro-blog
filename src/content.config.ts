import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
	}),
});

const summaryCard = z.object({
	// html：小红书设计稿抽出的静态卡片页，用 iframe 等比缩放嵌入；
	// image：已经导出的 PNG/JPG 成图。
	type: z.enum(["html", "image"]),
	src: z.string(),
	title: z.string().optional(),
	width: z.number().positive().default(1080),
	height: z.number().positive().default(1440),
});

const summaries = defineCollection({
	// 由 scripts/sync-summaries.mjs 从 SelfMedia 生成，正文保存小红书配文。
	loader: glob({ base: "./src/content/summaries", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string(),
		description: z.string().default(""),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		category: z.string().default("未分类"),
		tags: z.array(z.string()).default([]),
		hashtags: z.array(z.string()).default([]),
		sourceUrl: z.string().optional(),
		cards: z.array(summaryCard).default([]),
		// 同步脚本写入，用于增量更新与安全清理。
		generatedBy: z.string().optional(),
		sourceHash: z.string().optional(),
		draft: z.boolean().default(false),
	}),
});

export const collections = { blog, summaries };
