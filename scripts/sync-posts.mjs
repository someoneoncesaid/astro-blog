#!/usr/bin/env node
/**
 * 从 SelfMedia 同步「母稿」到博客文章。
 *
 * - 每个包含 母稿.md 的选题生成一篇 src/content/blog/<slug>.md
 * - 正文里的本地图片复制到 public/posts/<slug>/assets/ 并改写为绝对路径
 * - 指向其他 母稿.md 的链接改写成对应文章地址，其余本地文件链接降级为纯文本
 * - 少量只有占位母稿的选题可在 posts.config.json 里指定真正的正文文件
 *
 * 用法：
 *   npm run sync:posts
 *   npm run sync:posts -- --dry-run
 *   npm run sync:posts -- --force
 *   npm run sync:posts -- --only 2026-11-13-dsh-0.2.2-rc.3
 *
 * 环境变量：
 *   SELF_MEDIA_ROOT=/path/to/SelfMedia
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'posts.config.json'), 'utf8'));
const SELF_MEDIA_ROOT = path.resolve(process.env.SELF_MEDIA_ROOT || '/Users/zhiyuan/SelfMedia');
const CONTENT_DIR = path.join(BLOG_ROOT, 'src', 'content', 'blog');
const PUBLIC_DIR = path.join(BLOG_ROOT, 'public', 'posts');
const GENERATOR = 'sync-posts';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);
const CALLOUT_LABELS = {
	note: '笔记',
	tip: '提示',
	warning: '注意',
	important: '重要',
	caution: '小心',
	info: '说明',
	summary: '摘要',
};
const SKIP_DIRS = new Set([
	'.git',
	'.obsidian',
	'.claudian',
	'.workbuddy',
	'.dsh',
	'node_modules',
	'_templates',
	'_archive',
	'_trash',
	'designs',
]);

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const DRY_RUN = hasFlag('--dry-run');
const FORCE = hasFlag('--force');
const NO_PRUNE = hasFlag('--no-prune');
const onlyIndex = argv.indexOf('--only');
const ONLY = onlyIndex >= 0 ? argv[onlyIndex + 1] : null;

function log(message) {
	console.log(message);
}

function warn(message) {
	console.warn(`! ${message}`);
}

function readText(file) {
	return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

function exists(file) {
	try {
		fs.accessSync(file);
		return true;
	} catch {
		return false;
	}
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function removeDir(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

function statSig(file) {
	const stat = fs.statSync(file);
	return `${Math.round(stat.mtimeMs)}:${stat.size}`;
}

function naturalCompare(a, b) {
	return String(a).localeCompare(String(b), 'zh-Hans-CN', { numeric: true });
}

function unique(values) {
	return [...new Set(values)];
}

function toArray(value) {
	if (Array.isArray(value)) return value;
	if (value === null || value === undefined || value === '') return [];
	return [value];
}

function unquote(value) {
	const trimmed = String(value ?? '').trim();
	if (!trimmed) return '';

	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed
				.slice(1, -1)
				.replace(/\\"/g, '"')
				.replace(/\\n/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
		}
	}
	if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
		return trimmed.slice(1, -1);
	}
	return trimmed.replace(/[,，]\s*$/, '').trim();
}

function splitTopLevel(input) {
	const parts = [];
	let current = '';
	let quote = null;
	let depth = 0;

	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];

		if (quote) {
			current += char;
			if (char === quote && input[index - 1] !== '\\') quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			current += char;
			continue;
		}
		if (char === '[' || char === '{') depth += 1;
		else if (char === ']' || char === '}') depth -= 1;

		if (char === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
	}

	if (current.trim()) parts.push(current);
	return parts;
}

function topLevelColon(input) {
	let quote = null;
	let depth = 0;

	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (quote) {
			if (char === quote && input[index - 1] !== '\\') quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '[' || char === '{') depth += 1;
		else if (char === ']' || char === '}') depth -= 1;
		else if (char === ':' && depth === 0) return index;
	}
	return -1;
}

function parseFlowArray(value) {
	const inner = value.trim().slice(1, -1).trim();
	if (!inner) return [];
	return splitTopLevel(inner)
		.map((item) => unquote(item))
		.filter((item) => item !== '');
}

/**
 * 兼容 SelfMedia 里两种非标准 frontmatter：
 * - 正常 YAML（title: xxx / tags: 块数组）
 * - 类似 JSON 的 flow map（{ title: xxx, tags: [a, b] }，键不带引号）
 */
function parseFlowMap(block) {
	const trimmed = block.trim();
	if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

	const data = {};
	for (const part of splitTopLevel(trimmed.slice(1, -1))) {
		const colon = topLevelColon(part);
		if (colon < 0) continue;
		const key = unquote(part.slice(0, colon));
		if (!key) continue;
		const rawValue = part.slice(colon + 1).trim();
		if (!rawValue) {
			data[key] = '';
		} else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
			data[key] = parseFlowArray(rawValue);
		} else {
			data[key] = unquote(rawValue);
		}
	}
	return data;
}

function parseSimpleYaml(block) {
	const data = {};
	let currentKey = null;

	for (const rawLine of block.split(/\r?\n/)) {
		const line = rawLine.replace(/\t/g, '  ');
		if (!line.trim() || line.trim().startsWith('#')) continue;

		const listMatch = line.match(/^\s*-\s+(.*)$/);
		if (listMatch && currentKey) {
			if (!Array.isArray(data[currentKey])) data[currentKey] = [];
			data[currentKey].push(unquote(listMatch[1]));
			continue;
		}

		const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!keyMatch) continue;

		const [, key, rawValue] = keyMatch;
		currentKey = key;
		const value = rawValue.trim();

		if (!value) {
			data[key] = [];
			continue;
		}

		if (value.startsWith('[') && value.endsWith(']')) {
			data[key] = parseFlowArray(value);
		} else {
			data[key] = unquote(value);
		}
	}

	return data;
}

function parseFrontmatter(text) {
	if (!text.startsWith('---')) return { data: {}, body: text };
	const end = text.indexOf('\n---', 3);
	if (end === -1) return { data: {}, body: text };

	const block = text.slice(3, end).trim();
	const body = text.slice(end + 4).replace(/^\s*\n/, '');

	let data = {};
	if (block.startsWith('{')) {
		data = parseFlowMap(block) || {};
	}
	if (Object.keys(data).length === 0) {
		data = parseSimpleYaml(block);
	}

	return { data, body };
}

function stripHtml(value) {
	return String(value || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

function stripMarkdown(input) {
	return String(input || '')
		.replace(/!\[\[([^\]]+)\]\]/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, first, second) => second || first)
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '')
		.replace(/^[-*+]\s+/gm, '')
		.replace(/^\d+\.\s+/gm, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/__([^_]+)__/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\|/g, ' ')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function truncate(value, max = 180) {
	const text = String(value || '').trim();
	if (text.length <= max) return text;
	return `${text.slice(0, max).replace(/[，。；、,\s]+$/g, '')}…`;
}

function cleanTag(value) {
	return String(value || '')
		.replace(/^#+/, '')
		.replace(/[，。；、,.!?！？：:]+$/g, '')
		.trim();
}

function cleanTitle(value) {
	return stripMarkdown(value)
		.replace(/^["'“”]+|["'“”]+$/g, '')
		.replace(/[，,。；;、]+$/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function firstH1(body) {
	const match = String(body || '').match(/^\s*#\s+(.+?)\s*$/m);
	return match ? cleanTitle(match[1]) : '';
}

function stripLeadingH1(body) {
	return String(body || '').replace(/^\s*#\s+[^\n]+\n+/, '');
}

function firstParagraph(body) {
	const blocks = String(body || '').split(/\n\s*\n/);
	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed || /^[#!|<]|^-{3,}$/.test(trimmed)) continue;

		const text = stripMarkdown(trimmed).replace(/\s+/g, ' ').trim();
		if (text.length >= 20) return text;
	}
	return '';
}

function normalizeDate(value) {
	if (!value) return '';
	if (value instanceof Date) {
		return Number.isNaN(value.valueOf()) ? '' : value.toISOString().slice(0, 10);
	}
	const text = String(value).trim();
	const match = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
	if (match) {
		return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
	}
	const date = new Date(text);
	if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
	return '';
}

function dateFromRelative(relative) {
	const match = path.basename(relative).match(/^(\d{4}-\d{2}-\d{2})/);
	return match ? match[1] : '';
}

function titleFromFolder(name) {
	return name
		.replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '')
		.replace(/-[a-f0-9]{8}$/i, '')
		.replace(/[-_]+/g, ' ')
		.trim();
}

function fallbackSlug(relative, date) {
	const base = path
		.basename(relative)
		.replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	const stable = base || crypto.createHash('sha1').update(relative).digest('hex').slice(0, 8);
	return `${date}-${stable}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function routeSlug(slug) {
	// Astro 的 glob loader 会把内容 ID 里的点去掉（0.2.2 → 022）。
	return slug.replace(/\./g, '');
}

function findProjects(root) {
	const projects = [];

	const walk = (dir, depth) => {
		if (depth > 3) return;

		let entries = [];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		if (exists(path.join(dir, '母稿.md'))) {
			const relative = path.relative(root, dir).split(path.sep).join('/');
			const parts = relative.split('/');
			const category = parts.length > 1 ? parts[0] : '未分类';
			projects.push({
				dir,
				rel: relative,
				category: CONFIG.categories?.[category] || category || '未分类',
			});
			return;
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
			walk(path.join(dir, entry.name), depth + 1);
		}
	};

	walk(root, 0);
	return projects.sort((a, b) => naturalCompare(a.rel, b.rel));
}

function cleanLinkTarget(raw) {
	let target = String(raw || '').trim();
	if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1).trim();
	target = target.replace(/\s+["'][^"']*["']\s*$/, '').trim();
	if (!target) return '';
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

function isRemote(target) {
	return /^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(target) || target.startsWith('/posts/');
}

function isImageTarget(target) {
	const clean = target.split('#')[0].split('?')[0];
	return IMAGE_EXT.has(path.extname(clean).toLowerCase());
}

function mapOutsideFences(body, transform) {
	const parts = String(body || '').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
	return parts.map((part, index) => (index % 2 === 1 ? part : transform(part))).join('');
}

function createAssetManager(slug, sourceDir) {
	const files = [];
	const byTarget = new Map();
	const targetDir = path.join(PUBLIC_DIR, slug);
	const tempDir = path.join(PUBLIC_DIR, `.${slug}.tmp`);

	const add = (rawTarget) => {
		const target = cleanLinkTarget(rawTarget);
		if (!target || isRemote(target)) return null;

		const absolute = path.isAbsolute(target) ? target : path.resolve(sourceDir, target);
		if (byTarget.has(absolute)) return byTarget.get(absolute);
		if (!exists(absolute) || !fs.statSync(absolute).isFile()) return null;

		const extension = path.extname(absolute).toLowerCase();
		if (!IMAGE_EXT.has(extension)) return null;

		const digest = crypto
			.createHash('sha1')
			.update(`${absolute}:${statSig(absolute)}`)
			.digest('hex')
			.slice(0, 12);
		const name = `${digest}${extension}`;
		const publicUrl = `/posts/${slug}/assets/${name}`;

		byTarget.set(absolute, publicUrl);
		if (!files.some((file) => file.name === name)) {
			files.push({ from: absolute, name });
		}
		return publicUrl;
	};

	const commit = () => {
		if (DRY_RUN) return;

		if (files.length === 0) {
			removeDir(targetDir);
			return;
		}

		removeDir(tempDir);
		ensureDir(path.join(tempDir, 'assets'));
		for (const file of files) {
			fs.copyFileSync(file.from, path.join(tempDir, 'assets', file.name));
		}
		removeDir(targetDir);
		fs.renameSync(tempDir, targetDir);
	};

	return { add, commit, files };
}

function rewriteLinks(body, sourceDir, assets, projectByManuscript) {
	let result = String(body || '').replace(/\r\n?/g, '\n');

	// Obsidian 嵌入：![[素材/xxx.png|720]]
	result = result.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (whole, rawTarget, alias) => {
		const target = cleanLinkTarget(rawTarget);
		if (isRemote(target)) return whole;

		const publicUrl = assets.add(target);
		if (!publicUrl) {
			warn(`图片不存在，已跳过：${target}`);
			return `<!-- 图片缺失：${target} -->`;
		}
		const fallbackAlt = path.basename(target, path.extname(target));
		const alt = alias && !/^\d+$/.test(alias.trim()) ? alias.trim() : fallbackAlt;
		return `![${alt}](${publicUrl})`;
	});

	// 标准 Markdown 图片：![alt](素材/xxx.png)
	result = result.replace(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)]+?)\s*\)/g, (whole, alt, rawTarget) => {
		const target = cleanLinkTarget(rawTarget);
		if (isRemote(target)) return whole;

		const publicUrl = assets.add(target);
		if (!publicUrl) {
			warn(`图片不存在，已跳过：${target}`);
			return `<!-- 图片缺失：${target} -->`;
		}
		return `![${alt}](${publicUrl})`;
	});

	// 图片套链接：[![封面](a.png)](../另一篇/母稿.md)
	result = result.replace(
		/\[(!\[[^\]]*\]\([^)]+\))\]\(\s*(<[^>]+>|[^)]+?)\s*\)/g,
		(whole, image, rawTarget) => {
			const target = cleanLinkTarget(rawTarget);
			if (!target || isRemote(target)) return whole;

			const absolute = path.isAbsolute(target) ? target : path.resolve(sourceDir, target);
			if (path.basename(absolute) === '母稿.md') {
				const project = projectByManuscript.get(absolute);
				if (project) return `[${image}](/blog/${routeSlug(project.slug)}/)`;
			}
			if (isImageTarget(target)) {
				const publicUrl = assets.add(target);
				if (publicUrl) return `[${image}](${publicUrl})`;
			}
			return image;
		},
	);

	// 普通链接：能对应到别的母稿就改成文章链接，本地非图片文件降级为纯文本
	result = mapOutsideFences(result, (segment) =>
		segment.replace(/(?<!!)\[([^\]]*)\]\(\s*(<[^>]+>|[^)]+?)\s*\)/g, (whole, label, rawTarget) => {
			const target = cleanLinkTarget(rawTarget);
			if (!target || isRemote(target)) return whole;

			const absolute = path.isAbsolute(target) ? target : path.resolve(sourceDir, target);

			if (path.basename(absolute) === '母稿.md') {
				const project = projectByManuscript.get(absolute);
				if (project) return `[${label}](/blog/${routeSlug(project.slug)}/)`;
			}

			if (isImageTarget(target)) {
				const publicUrl = assets.add(target);
				if (publicUrl) return `[${label}](${publicUrl})`;
			}

			return label || target;
		}),
	);

	return result;
}

function buildProjectEntry(project, projectByManuscript) {
	const slug =
		CONFIG.slugs?.[project.rel] || fallbackSlug(project.rel, dateFromRelative(project.rel));
	const sourceRelative = CONFIG.sources?.[project.rel] || '母稿.md';
	const masterPath = path.join(project.dir, '母稿.md');
	const sourcePath = path.resolve(project.dir, sourceRelative);
	const sourceDir = path.dirname(sourcePath);

	const masterText = exists(masterPath) ? readText(masterPath) : '';
	const sourceText = exists(sourcePath) ? readText(sourcePath) : masterText;
	if (!sourceText.trim()) {
		return { skipReason: '正文为空' };
	}

	const master = parseFrontmatter(masterText);
	const source = parseFrontmatter(sourceText);
	const data = { ...master.data, ...source.data };
	const rawBody = source.body.trim();
	if (!rawBody) {
		return { skipReason: '正文为空' };
	}

	const date =
		normalizeDate(source.data.date || master.data.date) ||
		dateFromRelative(project.rel) ||
		normalizeDate(source.data.updated || master.data.updated);
	if (!date) {
		return { skipReason: '缺少日期' };
	}

	const title =
		cleanTitle(source.data.title || master.data.title || firstH1(source.body)) ||
		cleanTitle(titleFromFolder(path.basename(project.dir)));
	if (!title) {
		return { skipReason: '缺少标题' };
	}

	const description =
		cleanTitle(source.data.description || master.data.description || '') ||
		truncate(
			stripMarkdown(source.data.angle || master.data.angle || firstParagraph(source.body)),
			180,
		) ||
		title;

	const updatedSource = source.data.updated || master.data.updated || source.data.updatedDate;
	const updated = normalizeDate(updatedSource);
	const tags = unique(
		toArray(source.data.tags || master.data.tags)
			.flatMap((tag) => toArray(tag))
			.map((tag) => cleanTag(tag))
			.filter(Boolean)
			.filter((tag) => !(CONFIG.tagDenylist || []).includes(tag)),
	);

	const assets = createAssetManager(slug, sourceDir);
	const body = rewriteLinks(rawBody, sourceDir, assets, projectByManuscript)
		.replace(
			/^>\s*\[!(note|tip|warning|important|caution|info|summary)\]\s*(.*)$/gim,
			(_, type, heading) => {
				const label = CALLOUT_LABELS[type.toLowerCase()] || type;
				const suffix = heading.trim() ? `：${heading.trim()}` : '';
				return `> **${label}${suffix}**`;
			},
		)
		.replace(/\/Users\/[^/\s`"'()<>]+/g, '~')
		.replace(/^\s*#\s+[^\n]+\n+/, '')
		.replace(/\n{4,}/g, '\n\n\n')
		.trim();

	if (!body) {
		return { skipReason: '正文为空' };
	}

	const hash = crypto.createHash('sha1');
	hash.update(project.rel);
	hash.update(sourceText);
	hash.update(masterText);
	hash.update(body);
	hash.update(JSON.stringify({ title, description, date, updated, tags, category: project.category }));
	for (const file of assets.files.sort((a, b) => a.name.localeCompare(b.name))) {
		hash.update(`${file.name}:${statSig(file.from)}`);
	}

	return {
		slug,
		project,
		title,
		description,
		date,
		updated: updated && updated !== date ? updated : '',
		category: project.category,
		tags,
		body,
		assets,
		sourceHash: hash.digest('hex'),
		sourcePath: project.rel,
		sourceRelative,
	};
}

function yamlString(value) {
	return JSON.stringify(String(value ?? ''));
}

function writePostFile(file, entry) {
	const lines = [
		'---',
		`title: ${yamlString(entry.title)}`,
		`description: ${yamlString(entry.description)}`,
		`pubDate: ${yamlString(entry.date)}`,
	];
	if (entry.updated) lines.push(`updatedDate: ${yamlString(entry.updated)}`);
	lines.push(`category: ${yamlString(entry.category)}`);
	lines.push(`tags: [${entry.tags.map(yamlString).join(', ')}]`);
	lines.push(`generatedBy: ${yamlString(GENERATOR)}`);
	lines.push(`sourceHash: ${yamlString(entry.sourceHash)}`);
	lines.push(`sourcePath: ${yamlString(entry.sourcePath)}`);
	lines.push('---', '', entry.body, '');

	const content = lines.join('\n');
	ensureDir(path.dirname(file));
	const temp = `${file}.tmp`;
	fs.writeFileSync(temp, content, 'utf8');
	fs.renameSync(temp, file);
}

function readExistingSourceHash(file) {
	if (!exists(file)) return null;
	const { data } = parseFrontmatter(readText(file));
	return typeof data.sourceHash === 'string' ? data.sourceHash : null;
}

function pruneGenerated(keepSlugs) {
	if (!exists(CONTENT_DIR)) return;

	for (const file of fs.readdirSync(CONTENT_DIR)) {
		if (!file.endsWith('.md')) continue;
		const slug = file.replace(/\.md$/, '');
		if (keepSlugs.has(slug)) continue;

		const fullPath = path.join(CONTENT_DIR, file);
		const { data } = parseFrontmatter(readText(fullPath));
		if (data.generatedBy !== GENERATOR) continue;

		fs.rmSync(fullPath, { force: true });
		removeDir(path.join(PUBLIC_DIR, slug));
		log(`- ${slug}  (源已不存在，已清理)`);
	}
}

function main() {
	if (!exists(SELF_MEDIA_ROOT)) {
		console.error(`找不到 SelfMedia 目录：${SELF_MEDIA_ROOT}`);
		console.error('请设置 SELF_MEDIA_ROOT 环境变量后重试。');
		process.exit(1);
	}

	if (!DRY_RUN) {
		ensureDir(CONTENT_DIR);
		ensureDir(PUBLIC_DIR);
	}

	const projects = findProjects(SELF_MEDIA_ROOT).map((project) => ({
		...project,
		slug: CONFIG.slugs?.[project.rel] || fallbackSlug(project.rel, dateFromRelative(project.rel)),
	}));
	const projectByManuscript = new Map(
		projects.map((project) => [path.join(project.dir, '母稿.md'), project]),
	);

	const entries = [];
	const failures = [];

	for (const project of projects) {
		if (ONLY && project.slug !== ONLY) continue;
		try {
			const entry = buildProjectEntry(project, projectByManuscript);
			if (entry.skipReason) {
				warn(`${project.rel}：${entry.skipReason}，已跳过`);
				continue;
			}
			entries.push(entry);
		} catch (error) {
			failures.push({ label: project.rel, error });
		}
	}

	const seenSlugs = new Set();
	const uniqueEntries = [];
	for (const entry of entries) {
		if (seenSlugs.has(entry.slug)) {
			warn(`重复的 slug，已跳过：${entry.slug}（${entry.project.rel}）`);
			continue;
		}
		seenSlugs.add(entry.slug);
		uniqueEntries.push(entry);
	}

	let synced = 0;
	let skipped = 0;

	for (const entry of uniqueEntries) {
		const contentFile = path.join(CONTENT_DIR, `${entry.slug}.md`);
		const existingHash = readExistingSourceHash(contentFile);
		const assetsExist =
			entry.assets.files.length === 0 || exists(path.join(PUBLIC_DIR, entry.slug, 'assets'));

		if (!FORCE && existingHash === entry.sourceHash && assetsExist && exists(contentFile)) {
			skipped += 1;
			log(`= ${entry.slug}  ${entry.body.length} 字  (未变化)`);
			continue;
		}

		if (DRY_RUN) {
			synced += 1;
			log(`+ ${entry.slug}  ${entry.body.length} 字  ${entry.assets.files.length} 图  (将写入)`);
			continue;
		}

		try {
			entry.assets.commit();
			writePostFile(contentFile, entry);
			synced += 1;
			log(`✓ ${entry.slug}  ${entry.body.length} 字  ${entry.assets.files.length} 图`);
		} catch (error) {
			failures.push({ label: entry.slug, error });
			console.error(`✗ ${entry.slug}: ${error.message}`);
		}
	}

	if (!NO_PRUNE && !ONLY && !DRY_RUN && failures.length === 0) {
		pruneGenerated(new Set(projects.map((project) => project.slug)));
	}

	console.log('');
	console.log(`完成：${synced} 篇写入，${skipped} 篇未变化，${failures.length} 篇失败。`);

	if (failures.length > 0) {
		console.log('');
		console.log('失败明细：');
		for (const failure of failures) {
			console.log(`  - ${failure.label}: ${failure.error.message}`);
		}
		process.exit(1);
	}
}

main();
