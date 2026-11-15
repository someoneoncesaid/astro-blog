#!/usr/bin/env node
/**
 * 从 SelfMedia 同步小红书图卡到博客「图文摘要」栏目。
 *
 * - 设计稿（designs 下 project 里的 .dc.html）会被抽成独立 HTML 卡片页，
 *   保留原始 1080×1440 / 900×1200 画板，由 iframe 在博客里等比缩放。
 * - 已导出的 PNG 图卡作为 image 类型直接复制。
 * - 只收录有设计稿或成图的选题；纯文字稿跳过。
 *
 * 用法：
 *   npm run sync:summaries
 *   npm run sync:summaries -- --force
 *   npm run sync:summaries -- --dry-run
 *   npm run sync:summaries -- --only 2026-11-13-dsh-0.2.2-rc.3
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
const CONFIG = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'summaries.config.json'), 'utf8'));
const SELF_MEDIA_ROOT = path.resolve(process.env.SELF_MEDIA_ROOT || '/Users/zhiyuan/SelfMedia');
const CONTENT_DIR = path.join(BLOG_ROOT, 'src', 'content', 'summaries');
const PUBLIC_DIR = path.join(BLOG_ROOT, 'public', 'summaries');
const GENERATOR = 'sync-summaries';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
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
const INCLUDE_IMAGES = hasFlag('--include-images');
const onlyIndex = argv.indexOf('--only');
const ONLY = onlyIndex >= 0 ? argv[onlyIndex + 1] : null;

const CANDIDATE_COPY_FILES = [
	'小红书/发布文案.md',
	'小红书/文案.md',
	'小红书/摘要图文.md',
	'小红书/标题与总结-实拍版.md',
	'小红书/概述.md',
];

function log(message) {
	console.log(message);
}

function warn(message) {
	console.warn(`! ${message}`);
}

function readText(file) {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return '';
	}
}

function exists(file) {
	return fs.existsSync(file);
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function removeDir(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

function statSig(file) {
	try {
		const stat = fs.statSync(file);
		return `${file}:${stat.size}:${Math.round(stat.mtimeMs)}`;
	} catch {
		return `${file}:missing`;
	}
}

function latestMtime(dir) {
	let max = 0;
	try {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const target = path.join(dir, entry.name);
			const stat = fs.statSync(target);
			max = Math.max(max, stat.mtimeMs);
		}
	} catch {
		/* ignore */
	}
	return max;
}

function listImages(dir) {
	if (!exists(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
		.sort(naturalCompare);
}

function naturalCompare(a, b) {
	return String(a).localeCompare(String(b), 'zh-Hans-CN', {
		numeric: true,
		sensitivity: 'base',
	});
}

function unique(values) {
	return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

function toArray(value) {
	if (Array.isArray(value)) return value;
	if (value === null || value === undefined || value === '') return [];
	return [value];
}

function unquote(value) {
	const trimmed = String(value).trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		if (trimmed.startsWith('"')) {
			try {
				return JSON.parse(trimmed);
			} catch {
				/* fall through */
			}
		}
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * 只解析同步需要的简单 frontmatter：标量、行内数组、块数组。
 * 不追求完整 YAML 兼容。
 */
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
			data[key] = value
				.slice(1, -1)
				.split(',')
				.map((item) => unquote(item.trim()))
				.filter(Boolean);
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
		try {
			data = JSON.parse(block);
		} catch {
			data = {};
		}
	} else {
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

function cleanTag(value) {
	return String(value || '')
		.replace(/^#+/, '')
		.replace(/[，。；、,.!?！？：:]+$/g, '')
		.trim();
}

function extractHashtags(input) {
	const matches = String(input || '').match(/(^|[\s，。；、])#([^\s#，。；、]+)/gm) || [];
	return matches.map((match) => cleanTag(match.replace(/^[\s，。；、]#/, ''))).filter(Boolean);
}

function removeHashtags(input) {
	const hashtags = [];
	const text = String(input || '').replace(
		/(^|[\s，。；、])#([^\s#，。；、]+)/g,
		(_, lead, tag) => {
			hashtags.push(cleanTag(tag));
			return lead;
		},
	);
	return {
		text: text
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim(),
		hashtags: unique(hashtags.filter(Boolean)),
	};
}

function truncate(value, max = 160) {
	const text = String(value || '').trim();
	if (text.length <= max) return text;
	return `${text.slice(0, max).replace(/[，。；、,\s]+$/g, '')}…`;
}

function describe(input) {
	const { text } = removeHashtags(stripMarkdown(input));
	return truncate(
		text
			.replace(/\s+/g, ' ')
			.trim(),
		160,
	);
}

function firstLine(input) {
	return String(input || '')
		.split(/\r?\n/)
		.map((line) => stripMarkdown(line.trim()))
		.find(Boolean) || '';
}

function firstParagraph(body) {
	const blocks = String(body || '').split(/\n\s*\n/);
	const candidates = [];

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed || /^[#!>|<]|^-{3,}$/.test(trimmed)) continue;

		const text = stripMarkdown(trimmed).replace(/\s+/g, ' ').trim();
		if (text.length < 20) continue;
		if (/^(本文|本稿|这组图卡|以下|目录|说明)/.test(text)) continue;

		candidates.push(text);
		if (text.length >= 60) break;
	}

	if (candidates.length === 0) return '';
	const long = candidates.find((text) => text.length >= 60);
	if (long) return long;
	return candidates.sort((a, b) => b.length - a.length)[0];
}

function parseSections(body) {
	const sections = [];
	let current = { heading: '', level: 0, lines: [] };

	for (const line of String(body || '').split(/\r?\n/)) {
		const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
		if (heading) {
			sections.push(current);
			current = { heading: heading[2].trim(), level: heading[1].length, lines: [] };
		} else {
			current.lines.push(line);
		}
	}
	sections.push(current);

	return sections.map((section) => ({
		heading: section.heading,
		level: section.level,
		content: section.lines.join('\n').trim(),
	}));
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

function cleanTitle(value) {
	return stripMarkdown(value)
		.replace(/[（(]\s*小红书[^）)]*[）)]/g, '')
		.replace(/小红书(摘要)?图卡/g, '')
		.replace(/[·|]\s*图卡\s*$/g, '')
		.replace(/\s*图卡\s*$/g, '')
		.replace(/\s*[·|]\s*$/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

function titleFromFolder(name) {
	return name
		.replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '')
		.replace(/-[a-f0-9]{8}$/i, '')
		.replace(/[-_]+/g, ' ')
		.trim();
}

function cleanCardTitle(value) {
	return String(value || '')
		.replace(/^原\s*/, '')
		.replace(/^\s*\d{1,2}\s*[·.\-:：]\s*/, '')
		.replace(/^\s*\d{1,2}\s+/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function cleanFigcaption(value) {
	let text = stripHtml(value);
	text = text.replace(/^\d+\s*\/\s*\d+\s*[·:：\-–—]?\s*/, '');
	text = text.replace(/^\d{1,2}\s*[·.\-:：]\s*/, '');
	text = text.replace(/^\d{1,2}\s+/, '');
	text = text.replace(/下载本页|查看大图|点击查看/g, '');
	return text.replace(/\s+/g, ' ').trim();
}

function parseProps(source) {
	const match = source.match(/data-props='([^']*)'/);
	if (!match) return {};
	try {
		return JSON.parse(match[1]);
	} catch {
		return {};
	}
}

function cardDimensions(source, board) {
	if (board && Number(board.w) && Number(board.h)) {
		return { width: Number(board.w), height: Number(board.h) };
	}
	const props = parseProps(source);
	if (props.$preview?.width && props.$preview?.height) {
		return { width: Number(props.$preview.width), height: Number(props.$preview.height) };
	}
	const style = source.match(/width:\s*(\d+)px[^;]*?height:\s*(\d+)px/);
	if (style) {
		return { width: Number(style[1]), height: Number(style[2]) };
	}
	return { width: 1080, height: 1440 };
}

function readPngSize(file) {
	try {
		const buffer = fs.readFileSync(file);
		if (buffer.length >= 24 && buffer.subarray(1, 4).toString('ascii') === 'PNG') {
			return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
		}
	} catch {
		/* ignore */
	}
	return { width: 1080, height: 1440 };
}

function parseCaptionJson(designDir) {
	const file = path.join(designDir, 'project', 'caption.json');
	if (!exists(file)) return null;
	try {
		const data = JSON.parse(readText(file));
		return {
			title: typeof data.title === 'string' ? data.title : '',
			content: typeof data.content === 'string' ? data.content : '',
		};
	} catch {
		return null;
	}
}

function readManuscript(projectDir) {
	const file = path.join(projectDir, '母稿.md');
	if (!exists(file)) return { data: {}, body: '' };
	return parseFrontmatter(readText(file));
}

function readSourceUrl(projectDir, manuscript) {
	const projectFile = path.join(projectDir, '.dsh', 'project.json');
	if (exists(projectFile)) {
		try {
			const project = JSON.parse(readText(projectFile));
			const url = project.settings?.sourceLink?.url;
			if (typeof url === 'string' && /^https?:/i.test(url)) return url;
		} catch {
			/* ignore */
		}
	}
	const source = manuscript.data.source;
	if (typeof source === 'string' && /^https?:/i.test(source)) return source;
	return undefined;
}

function readOverview(projectDir) {
	const file = path.join(projectDir, '小红书', '概述.md');
	if (!exists(file)) return '';
	return firstParagraph(parseFrontmatter(readText(file)).body);
}

function parseXhsCopy(projectDir) {
	let title = '';
	let caption = '';
	let date = '';
	const tags = [];
	const hashtags = [];

	for (const relative of CANDIDATE_COPY_FILES) {
		const file = path.join(projectDir, relative);
		if (!exists(file)) continue;

		const { data, body } = parseFrontmatter(readText(file));
		const sections = parseSections(body);
		const h1Section = sections.find((section) => section.level === 1);
		const h1 = h1Section?.heading || '';

		let candidateTitle = typeof data.title === 'string' ? data.title : '';
		if (!candidateTitle && h1 && !/发布标题|发布文案|标题与总结|正文/.test(h1)) {
			candidateTitle = h1;
		}

		const titleSection = sections.find(
			(section) => section.level <= 2 && /发布标题|推荐标题|^标题$|标题与总结/.test(section.heading),
		);
		if (!candidateTitle && titleSection) {
			candidateTitle = firstLine(titleSection.content);
		}
		if (h1Section && /发布标题|发布文案/.test(h1) && !candidateTitle) {
			candidateTitle = firstLine(h1Section.content);
		}

		const captionSection = sections.find(
			(section) =>
				section.level === 2 &&
				/发布配文|^配文$|正文总结|正文（可直接复制）|^正文$|总结文案|简介|^摘要$/.test(
					section.heading,
				),
		);

		let candidateCaption = captionSection?.content || '';
		if (!candidateCaption) {
			const quote = body.match(/(^|\n)>[ \t]?([\s\S]*?)(?=\n\s*\n|$)/);
			if (quote) candidateCaption = quote[2].replace(/^\s*>\s?/gm, '').trim();
		}
		if (!candidateCaption) {
			const hasPageSections = sections.some((section) => /^第\s*\d+\s*页/.test(section.heading));
			if (!hasPageSections) candidateCaption = firstParagraph(body);
		}

		const tagSection = sections.find(
			(section) => section.level === 2 && /标签|话题/.test(section.heading),
		);
		const tagText = tagSection?.content || '';
		const frontmatterTags = toArray(data.tags).map(cleanTag);
		const sectionHashtags = extractHashtags(tagText);
		const bodyHashtags = extractHashtags(body);

		if (!title && candidateTitle) title = candidateTitle;
		if (!caption && candidateCaption && candidateCaption.length > 20) {
			caption = candidateCaption;
		}
		tags.push(...frontmatterTags);
		hashtags.push(...sectionHashtags, ...bodyHashtags);
		if (!date && data.date) date = normalizeDate(data.date);
	}

	return {
		title: cleanTitle(title),
		caption: caption.trim(),
		date,
		tags: unique(tags.map(cleanTag).filter(Boolean)),
		hashtags: unique(hashtags.map(cleanTag).filter(Boolean)),
	};
}

function extractTitleTag(source) {
	const match = source.match(/<title>([\s\S]*?)<\/title>/i);
	return match ? stripHtml(match[1]) : '';
}

function readDesignSet(designDir) {
	const projectDir = path.join(designDir, 'project');
	if (!exists(projectDir)) return null;

	let canvas = {};
	const canvasFile = path.join(projectDir, 'canvas.json');
	if (exists(canvasFile)) {
		try {
			canvas = JSON.parse(readText(canvasFile));
		} catch {
			canvas = {};
		}
	}

	let files = [];
	if (Array.isArray(canvas.order)) {
		files = canvas.order.filter(
			(file) => typeof file === 'string' && file.endsWith('.dc.html') && exists(path.join(projectDir, file)),
		);
	}
	if (files.length === 0) {
		files = fs
			.readdirSync(projectDir)
			.filter((file) => file.endsWith('.dc.html'))
			.sort((a, b) => {
				if (a.startsWith('Main')) return -1;
				if (b.startsWith('Main')) return 1;
				return naturalCompare(a, b);
			});
	}

	const cards = [];
	const seenTitles = new Set();

	for (const file of files) {
		const fullPath = path.join(projectDir, file);
		const source = readText(fullPath);
		const board = canvas.boards?.[file];
		const rawTitle = board?.title || extractTitleTag(source) || file.replace(/\.dc\.html$/i, '');
		const normalizedTitle = String(rawTitle)
			.replace(/^原\s*/, '')
			.replace(/^\d{1,2}\s*/, '')
			.trim();
		if (seenTitles.has(normalizedTitle)) continue;
		seenTitles.add(normalizedTitle);

		const dimensions = cardDimensions(source, board);
		cards.push({
			file: fullPath,
			title: cleanCardTitle(rawTitle),
			width: dimensions.width,
			height: dimensions.height,
		});
	}

	if (cards.length === 0) return null;

	return {
		dir: designDir,
		projectDir,
		canvas,
		cards,
		caption: parseCaptionJson(designDir),
		mtime: latestMtime(projectDir),
	};
}

function listDesignDirs(projectDir) {
	const designsDir = path.join(projectDir, 'designs');
	if (!exists(designsDir)) return [];
	return fs
		.readdirSync(designsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
		.map((entry) => path.join(designsDir, entry.name));
}

function listDesignSets(projectDir) {
	return listDesignDirs(projectDir)
		.map((dir) => readDesignSet(dir))
		.filter(Boolean)
		.sort((a, b) => b.mtime - a.mtime);
}

function findFigcaptions(dir, files) {
	const parent = path.dirname(dir);
	const candidates = [];

	for (const name of ['contact.html', 'index.html', '联系表.html', '预览.html']) {
		candidates.push(path.join(parent, name));
		candidates.push(path.join(dir, name));
	}

	try {
		for (const name of fs.readdirSync(parent)) {
			if (!name.endsWith('.html')) continue;
			if (/gallery|联系表|预览|contact/i.test(name)) candidates.push(path.join(parent, name));
		}
	} catch {
		/* ignore */
	}

	for (const file of unique(candidates)) {
		if (!exists(file)) continue;
		const html = readText(file);
		const captions = [...html.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi)]
			.map((match) => cleanFigcaption(match[1]))
			.filter(Boolean);
		if (captions.length === files.length) return captions;
	}

	return null;
}

function findCopyLabels(projectDir, files) {
	for (const relative of ['小红书/文案.md', '小红书/摘要图文.md']) {
		const file = path.join(projectDir, relative);
		if (!exists(file)) continue;

		const { body } = parseFrontmatter(readText(file));
		const refs = [];
		let heading = '';

		for (const line of body.split(/\r?\n/)) {
			const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);
			if (headingMatch) heading = headingMatch[1];
			const imageMatch = line.match(/!\[\[([^\]]+)\]\]/) || line.match(/!\[[^\]]*\]\(([^)]+)\)/);
			if (imageMatch) refs.push({ heading, file: imageMatch[1] });
		}

		if (refs.length !== files.length) continue;

		const labels = new Array(files.length).fill('');
		refs.forEach((ref, index) => {
			const basename = path.basename(ref.file);
			const fileIndex = files.indexOf(basename);
			const label = cleanFigcaption(ref.heading);
			if (fileIndex >= 0) labels[fileIndex] = label;
			else if (index < labels.length) labels[index] = label;
		});

		return labels;
	}

	return null;
}

function readImageSet(dir, projectDir) {
	const files = listImages(dir);
	if (files.length === 0) return null;

	const labels = findFigcaptions(dir, files) || findCopyLabels(projectDir, files);
	const cards = files.map((file, index) => {
		const fullPath = path.join(dir, file);
		const size = readPngSize(fullPath);
		return {
			file: fullPath,
			title: labels?.[index] || `第 ${String(index + 1).padStart(2, '0')} 页`,
			width: size.width,
			height: size.height,
		};
	});

	return {
		dir,
		cards,
		mtime: latestMtime(dir),
	};
}

function findImageSet(projectDir) {
	const candidates = [];
	const add = (dir, priority) => {
		const files = listImages(dir);
		if (files.length > 0) candidates.push({ dir, priority });
	};

	add(path.join(projectDir, '小红书', '图卡'), 1);

	const exportRoot = path.join(projectDir, '小红书', '导出');
	if (exists(exportRoot)) {
		const batches = fs
			.readdirSync(exportRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort(naturalCompare)
			.reverse();
		if (batches[0]) add(path.join(exportRoot, batches[0]), 2);
	}

	add(path.join(projectDir, '素材', '原有图卡'), 3);

	for (const designDir of listDesignDirs(projectDir)) {
		add(path.join(designDir, 'export', 'PNG'), 4);
		add(path.join(designDir, 'export', 'cards'), 4);
	}

	candidates.sort((a, b) => a.priority - b.priority);
	if (candidates.length === 0) return null;
	return readImageSet(candidates[0].dir, projectDir);
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
			projects.push({
				dir,
				rel: relative,
				category: parts.length > 1 ? parts[0] : '未分类',
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

function buildDesignLinks(projects) {
	const byRelative = new Map(projects.map((project) => [project.rel, project]));
	const links = new Map();

	for (const [designRelative, projectRelative] of Object.entries(CONFIG.designProjects || {})) {
		const project = byRelative.get(projectRelative);
		if (!project) {
			warn(`找不到设计稿对应的选题：${designRelative} → ${projectRelative}`);
			continue;
		}

		const designSet = readDesignSet(path.join(SELF_MEDIA_ROOT, designRelative));
		if (!designSet) {
			warn(`设计稿没有可读取的卡片：${designRelative}`);
			continue;
		}

		links.set(projectRelative, designSet);
	}

	return links;
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

function buildProjectEntry(project, forcedDesignSet) {
	const manuscript = readManuscript(project.dir);
	const xhs = parseXhsCopy(project.dir);
	const designSet = forcedDesignSet || listDesignSets(project.dir)[0] || null;
	const imageSet = !designSet && INCLUDE_IMAGES ? findImageSet(project.dir) : null;

	if (!designSet && !imageSet) return null;

	const folderName = path.basename(project.dir);
	const folderDate = normalizeDate(folderName.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '');
	const captionJson = designSet?.caption || null;

	const title =
		[
			cleanTitle(captionJson?.title),
			cleanTitle(xhs.title),
			cleanTitle(manuscript.data.title),
			cleanTitle(designSet?.canvas?.title),
			titleFromFolder(folderName),
		].find(Boolean) || '';

	if (!title) return null;

	const rawCaption = captionJson?.content || xhs.caption || '';
	const cleanedCaption = (() => {
		const text = String(rawCaption || '')
			.replace(/\r\n/g, '\n')
			.replace(/\n##\s*(标签|话题)\s*\n[\s\S]*$/g, '')
			.trim();
		const { text: withoutTags, hashtags } = removeHashtags(text);
		return {
			caption: withoutTags.replace(/\n{3,}/g, '\n\n').trim(),
			hashtags,
		};
	})();

	const description =
		[
			describe(captionJson?.content),
			describe(xhs.caption),
			describe(readOverview(project.dir)),
			describe(firstParagraph(manuscript.body)),
			cleanTitle(designSet?.canvas?.title),
			title,
		].find(Boolean) || title;

	const pubDate =
		[
			xhs.date,
			normalizeDate(manuscript.data.date),
			folderDate,
			designSet ? new Date(designSet.mtime).toISOString().slice(0, 10) : '',
		].find(Boolean) || new Date().toISOString().slice(0, 10);

	const updatedCandidate = normalizeDate(
		manuscript.data.updated || manuscript.data.updatedDate || manuscript.data.updated_at,
	);
	const updatedDate = updatedCandidate && updatedCandidate > pubDate ? updatedCandidate : undefined;

	const hashtags = unique([
		...xhs.hashtags,
		...cleanedCaption.hashtags,
		...extractHashtags(captionJson?.content),
		...extractHashtags(xhs.caption),
	])
		.map(cleanTag)
		.filter(Boolean);

	const tags = unique([
		...toArray(manuscript.data.tags).map(cleanTag),
		...xhs.tags,
	]).filter(Boolean);

	const slug =
		CONFIG.slugs?.[project.rel] || fallbackSlug(project.rel, pubDate);

	const cardSource = designSet ? designSet.cards : imageSet.cards;
	const cards = cardSource.map((card, index) => {
		const number = String(index + 1).padStart(2, '0');
		if (designSet) {
			return {
				type: 'html',
				src: `/summaries/${slug}/${number}.html`,
				title: card.title,
				width: card.width,
				height: card.height,
			};
		}
		const extension = path.extname(card.file).toLowerCase();
		return {
			type: 'image',
			src: `/summaries/${slug}/${number}${extension}`,
			title: card.title,
			width: card.width,
			height: card.height,
		};
	});

	const signature = [];
	for (const card of cardSource) signature.push(statSig(card.file));
	if (designSet) {
		const assetsDir = path.join(designSet.projectDir, 'assets');
		if (exists(assetsDir)) {
			for (const file of fs.readdirSync(assetsDir).sort(naturalCompare)) {
				signature.push(statSig(path.join(assetsDir, file)));
			}
		}
	}

	const sourceHash = crypto
		.createHash('sha1')
		.update(
			JSON.stringify({
				slug,
				title,
				description,
				pubDate,
				updatedDate,
				category: project.category,
				tags,
				hashtags,
				caption: cleanedCaption.caption,
				sourceUrl: readSourceUrl(project.dir, manuscript) || '',
				cards: cards.map((card) => ({
					type: card.type,
					title: card.title,
					width: card.width,
					height: card.height,
				})),
				signature,
			}),
		)
		.digest('hex')
		.slice(0, 16);

	return {
		project,
		slug,
		title,
		description,
		pubDate,
		updatedDate,
		category: project.category,
		tags,
		hashtags,
		sourceUrl: readSourceUrl(project.dir, manuscript),
		caption: cleanedCaption.caption,
		cards,
		sourceHash,
		cardPlan: designSet
			? { type: 'design', designSet }
			: { type: 'images', imageSet },
	};
}

function escapeHtml(value) {
	return String(value || '').replace(/[&<>"]/g, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			default:
				return character;
		}
	});
}

function buildAssetMap(assetsDir) {
	const map = new Map();
	if (!exists(assetsDir)) return map;
	for (const file of fs.readdirSync(assetsDir)) {
		const match = file.match(/^([a-f0-9]{8,})\.([a-z0-9]+)$/i);
		if (match) map.set(match[1], path.join(assetsDir, file));
	}
	return map;
}

function generateDesignCard(card, targetDir, assetMap) {
	const source = readText(card.file);
	const bodyMatch = source.match(/<x-dc>([\s\S]*?)<\/x-dc>/);
	if (!bodyMatch) throw new Error(`卡片缺少 <x-dc>：${card.file}`);

	let body = bodyMatch[1];
	let helmet = body.match(/<helmet>([\s\S]*?)<\/helmet>/)?.[1] || '';
	body = body.replace(/<helmet>[\s\S]*?<\/helmet>/g, '');

	const props = parseProps(source);
	body = body.replace(/\{\{\s*([\w$]+)\s*\}\}/g, (_, key) => {
		const prop = props[key];
		return prop && typeof prop === 'object' && 'default' in prop ? String(prop.default ?? '') : '';
	});

	const assetDir = path.join(targetDir, 'assets');
	ensureDir(assetDir);

	const rewriteBlob = (text) =>
		text.replace(/\/_blob\/([a-zA-Z0-9_-]+)/g, (full, id) => {
			const assetFile = assetMap.get(id);
			if (!assetFile) {
				warn(`缺少设计稿素材 ${id}：${card.file}`);
				return full;
			}
			const outputName = `${id}${path.extname(assetFile)}`;
			fs.copyFileSync(assetFile, path.join(assetDir, outputName));
			return `assets/${outputName}`;
		});

	body = rewriteBlob(body);
	helmet = rewriteBlob(helmet);

	body = body.replace(/(\bsrc\s*=\s*["'])([^"']+)(["'])/g, (full, prefix, reference, suffix) => {
		if (/^(https?:|data:|#|\/)/i.test(reference) || reference.endsWith('support.js')) {
			return full;
		}
		const absolute = path.resolve(path.dirname(card.file), reference);
		if (!exists(absolute)) return full;
		const outputName = `rel-${crypto.createHash('sha1').update(absolute).digest('hex').slice(0, 8)}${path.extname(absolute)}`;
		fs.copyFileSync(absolute, path.join(assetDir, outputName));
		return `${prefix}assets/${outputName}${suffix}`;
	});

	body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
	body = body.replace(/<helmet>[\s\S]*?<\/helmet>/g, '');

	const fontLinks = (source.match(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi) || []).join('\n');
	const headFontLinks = /fonts\.googleapis\.com/.test(helmet) ? '' : fontLinks;
	const width = card.width;
	const height = card.height;

	const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(card.title)}</title>
${headFontLinks}
<style>
html,body{margin:0;padding:0;overflow:hidden;background:transparent}
#xhs-card{position:relative;width:${width}px;height:${height}px;overflow:hidden;transform-origin:top left}
</style>
${helmet}
</head>
<body>
<div id="xhs-card">${body}</div>
<script>
(function(){
  var card = document.getElementById('xhs-card');
  var W = ${width}, H = ${height};
  function fit(){
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = document.documentElement.clientHeight || window.innerHeight;
    var scale = Math.min(vw / W, vh / H);
    card.style.transform = 'scale(' + scale + ')';
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) { new ResizeObserver(fit).observe(document.documentElement); }
  fit();
})();
</script>
</body>
</html>`;

	fs.writeFileSync(card.targetFile, html, 'utf8');
}

function materializeCards(entry) {
	const finalDir = path.join(PUBLIC_DIR, entry.slug);
	const tempDir = path.join(PUBLIC_DIR, `.${entry.slug}.tmp`);

	removeDir(tempDir);
	ensureDir(tempDir);

	try {
		if (entry.cardPlan.type === 'design') {
			const designSet = entry.cardPlan.designSet;
			const assetMap = buildAssetMap(path.join(designSet.projectDir, 'assets'));
			entry.cards.forEach((card, index) => {
				generateDesignCard(
					{ ...designSet.cards[index], targetFile: path.join(tempDir, path.basename(card.src)) },
					tempDir,
					assetMap,
				);
			});
		} else {
			entry.cardPlan.imageSet.cards.forEach((card, index) => {
				fs.copyFileSync(card.file, path.join(tempDir, path.basename(entry.cards[index].src)));
			});
		}

		removeDir(finalDir);
		fs.renameSync(tempDir, finalDir);
	} catch (error) {
		removeDir(tempDir);
		throw error;
	}
}

function yamlString(value) {
	return JSON.stringify(String(value ?? ''));
}

function writeEntryFile(file, entry) {
	const lines = [
		'---',
		`title: ${yamlString(entry.title)}`,
		`description: ${yamlString(entry.description)}`,
		`pubDate: ${entry.pubDate}`,
	];

	if (entry.updatedDate) lines.push(`updatedDate: ${entry.updatedDate}`);

	lines.push(`category: ${yamlString(entry.category)}`);
	lines.push(`tags: [${entry.tags.map(yamlString).join(', ')}]`);
	lines.push(`hashtags: [${entry.hashtags.map(yamlString).join(', ')}]`);

	if (entry.sourceUrl) lines.push(`sourceUrl: ${yamlString(entry.sourceUrl)}`);

	lines.push('cards:');
	for (const card of entry.cards) {
		lines.push(`  - type: ${card.type}`);
		lines.push(`    src: ${yamlString(card.src)}`);
		if (card.title) lines.push(`    title: ${yamlString(card.title)}`);
		lines.push(`    width: ${card.width}`);
		lines.push(`    height: ${card.height}`);
	}

	lines.push(`generatedBy: ${yamlString(GENERATOR)}`);
	lines.push(`sourceHash: ${yamlString(entry.sourceHash)}`);
	lines.push('---', '');

	if (entry.caption) lines.push(entry.caption, '');

	ensureDir(path.dirname(file));
	const temporary = `${file}.tmp`;
	fs.writeFileSync(temporary, lines.join('\n'), 'utf8');
	fs.renameSync(temporary, file);
}

function readExistingSourceHash(file) {
	if (!exists(file)) return null;
	const { data } = parseFrontmatter(readText(file));
	return typeof data.sourceHash === 'string' ? data.sourceHash : null;
}

function publicPath(src) {
	return path.join(BLOG_ROOT, 'public', src.replace(/^\//, ''));
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

	const projects = findProjects(SELF_MEDIA_ROOT);
	const designLinks = buildDesignLinks(projects);
	const entries = [];
	const failures = [];

	for (const project of projects) {
		let entry = null;
		try {
			entry = buildProjectEntry(project, designLinks.get(project.rel) || null);
		} catch (error) {
			failures.push({ label: project.rel, error });
			continue;
		}

		if (!entry) continue;
		if (ONLY && entry.slug !== ONLY) continue;
		entries.push(entry);
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
		const filesExist =
			entry.cards.length > 0 &&
			entry.cards.every((card) => exists(publicPath(card.src)));

		if (!FORCE && existingHash === entry.sourceHash && filesExist) {
			skipped += 1;
			log(`= ${entry.slug}  ${entry.cards.length} 张  (未变化)`);
			continue;
		}

		if (DRY_RUN) {
			synced += 1;
			log(`+ ${entry.slug}  ${entry.cards.length} 张  ${entry.cardPlan.type}  (将写入)`);
			continue;
		}

		try {
			materializeCards(entry);
			writeEntryFile(contentFile, entry);
			synced += 1;
			log(`✓ ${entry.slug}  ${entry.cards.length} 张  ${entry.cardPlan.type}`);
		} catch (error) {
			failures.push({ label: entry.slug, error });
			console.error(`✗ ${entry.slug}: ${error.message}`);
		}
	}

	if (!NO_PRUNE && !ONLY && !DRY_RUN && failures.length === 0) {
		pruneGenerated(new Set(uniqueEntries.map((entry) => entry.slug)));
	}

	console.log('');
	console.log(
		`完成：${synced} 组写入，${skipped} 组未变化，${failures.length} 组失败。`,
	);

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
