/**
 * 浏览器端图表渲染：PlantUML 与 Mermaid。
 *
 * 思路参考 dsh-learn/packages/markdown-renderer：
 * - 源码留在页面里，渲染失败时仍可阅读；
 * - 引擎只在页面出现图表时按需加载；
 * - SVG 先在内存中生成、清理，再写入文档；
 * - 跟随站点的明暗主题重新渲染。
 */

// 引擎文件很大，而且 minify 会破坏 TeaVM 生成的代码。
// 用 ?url 原样复制成静态资源，运行时再按需 import。
import plantUmlVizUrl from "@plantuml/core/viz-global.js?url";
import plantUmlEngineUrl from "@plantuml/core/plantuml.js?url";

const PLANTUML_LIMIT = 100_000;
const MERMAID_LIMIT = 100_000;
const MERMAID_TAGS = new Set([
	"svg", "g", "path", "rect", "line", "polygon", "polyline", "circle", "ellipse",
	"text", "tspan", "defs", "marker", "title", "desc", "clipPath",
	"linearGradient", "radialGradient", "stop", "style", "use",
]);

const PLANTUML_ELEMENTS = new Set([
	"svg", "g", "path", "rect", "line", "polygon", "polyline", "circle", "ellipse",
	"text", "tspan", "defs", "marker", "title", "desc",
]);
const PLANTUML_ATTRIBUTES = new Set([
	"xmlns", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy",
	"r", "rx", "ry", "d", "points", "transform", "fill", "fill-rule", "stroke",
	"stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
	"stroke-dashoffset", "opacity", "fill-opacity", "stroke-opacity", "font-family",
	"font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "id",
	"class", "marker-end", "marker-start", "markerWidth", "markerHeight", "refX", "refY",
	"orient", "preserveAspectRatio", "style",
]);

const figures = new Set();
let plantUmlEngine;
let mermaidEngine;
let queue = Promise.resolve();

function palette() {
	const styles = getComputedStyle(document.documentElement);
	const value = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
	return {
		paper: value("--paper", "#faf8f3"),
		surface: value("--surface", "#fffdf8"),
		surfaceSoft: value("--surface-soft", "#f2eee5"),
		ink: value("--ink", "#16181d"),
		inkSoft: value("--ink-soft", "#3a3f47"),
		line: value("--line", "#dcd5c8"),
		lineStrong: value("--line-strong", "#c4bcae"),
		accent: value("--accent", "#002fa7"),
		fontFamily: value("--font-sans", "system-ui, sans-serif"),
		dark: document.documentElement.dataset.theme === "dark",
	};
}

/* ---------- PlantUML ---------- */

function plantUmlSource(source, colors) {
	let text = source.trim();
	if (!/^\s*@start\w+/m.test(text)) text = `@startuml\n${text}\n@enduml`;
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => /^\s*@start\w+/.test(line));
	lines.splice(
		start < 0 ? 0 : start + 1,
		0,
		"<style>",
		"root {",
		`  BackgroundColor ${colors.surface}`,
		`  FontColor ${colors.ink}`,
		`  LineColor ${colors.accent}`,
		"}",
		"element {",
		`  BackgroundColor ${colors.surfaceSoft}`,
		`  FontColor ${colors.ink}`,
		"}",
		"arrow {",
		`  LineColor ${colors.accent}`,
		"}",
		"sequenceDiagram {",
		"  lifeLine {",
		`    LineColor ${colors.inkSoft}`,
		"  }",
		"}",
		"</style>",
	);
	return lines.join("\n");
}

function sanitizePlantUml(source) {
	const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
	const root = parsed.documentElement;
	if (root.localName !== "svg" || parsed.querySelector("parsererror") !== null) {
		throw new Error("PlantUML did not return valid SVG");
	}
	const text = Array.from(root.querySelectorAll("text")).map((node) => node.textContent ?? "");
	if (text[0]?.startsWith("Diagram not supported") || text.some((line) => /^Syntax Error\?/i.test(line))) {
		throw new Error(text.slice(0, 2).join(": "));
	}
	for (const element of Array.from(root.querySelectorAll("*"))) {
		if (!PLANTUML_ELEMENTS.has(element.localName)) {
			element.remove();
			continue;
		}
		for (const attribute of Array.from(element.attributes)) {
			const safeReference =
				(attribute.name === "marker-end" || attribute.name === "marker-start") &&
				/^url\(#[\w-]+\)$/.test(attribute.value);
			const safeTextStyle = attribute.name === "style" && attribute.value.trim() === "white-space: pre";
			const unsafeValue = !safeReference && /url\s*\(|javascript:|https?:/i.test(attribute.value);
			if (
				(!PLANTUML_ATTRIBUTES.has(attribute.name) && !safeReference) ||
				unsafeValue ||
				(attribute.name === "style" && !safeTextStyle)
			) {
				element.removeAttribute(attribute.name);
			}
		}
	}
	root.setAttribute("style", "display:block;max-width:100%;height:auto;margin:auto");
	return new XMLSerializer().serializeToString(root);
}

async function plantUml(source, colors) {
	if (!plantUmlEngine) {
		plantUmlEngine = (async () => {
			await import(/* @vite-ignore */ plantUmlVizUrl);
			const { renderToString } = await import(/* @vite-ignore */ plantUmlEngineUrl);
			const viz = globalThis.Viz;
			if (!viz) throw new Error("PlantUML Viz engine did not initialize");
			globalThis.PLANTUML_VIZ = viz;
			return renderToString;
		})();
	}
	const renderToString = await plantUmlEngine;
	const svg = await new Promise((resolve, reject) => {
		renderToString(plantUmlSource(source, colors).split(/\r?\n/), resolve, reject);
	});
	return sanitizePlantUml(svg);
}

/* ---------- Mermaid ---------- */

async function mermaid(source, colors) {
	if (!mermaidEngine) {
		mermaidEngine = import("mermaid").then((module) => module.default ?? module);
	}
	const engine = await mermaidEngine;
	engine.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		theme: "base",
		htmlLabels: false,
		suppressErrorRendering: true,
		fontFamily: colors.fontFamily,
		flowchart: { htmlLabels: false, useMaxWidth: false },
		themeVariables: {
			darkMode: colors.dark,
			background: colors.surface,
			primaryColor: colors.surfaceSoft,
			primaryTextColor: colors.ink,
			primaryBorderColor: colors.accent,
			lineColor: colors.accent,
			textColor: colors.ink,
			secondaryColor: colors.surfaceSoft,
			tertiaryColor: colors.paper,
			edgeLabelBackground: colors.surface,
			clusterBkg: colors.surfaceSoft,
			clusterBorder: colors.accent,
			// 时序图使用独立的一组变量，否则暗色下消息文字仍是黑色
			actorBkg: colors.surfaceSoft,
			actorBorder: colors.accent,
			actorTextColor: colors.ink,
			actorLineColor: colors.lineStrong,
			signalColor: colors.accent,
			signalTextColor: colors.ink,
			labelBoxBkgColor: colors.surfaceSoft,
			labelBoxBorderColor: colors.accent,
			labelTextColor: colors.ink,
			loopTextColor: colors.ink,
			noteBkgColor: colors.surfaceSoft,
			noteTextColor: colors.ink,
			noteBorderColor: colors.lineStrong,
			activationBkgColor: colors.surfaceSoft,
			activationBorderColor: colors.accent,
			sequenceNumberColor: colors.surface,
			fontFamily: colors.fontFamily,
			fontSize: "14px",
		},
	});
	const { svg } = await engine.render(`diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, source);
	if (/foreignObject/i.test(svg)) throw new Error("Mermaid returned HTML labels");
	const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
	const root = parsed.documentElement;
	if (root.localName !== "svg") throw new Error("Mermaid did not return valid SVG");
	for (const element of Array.from(root.querySelectorAll("*"))) {
		if (!MERMAID_TAGS.has(element.localName)) element.remove();
	}
	return new XMLSerializer().serializeToString(root);
}

/* ---------- 调度 ---------- */

function setStatus(figure, message) {
	const status = figure.querySelector(".diagram-status");
	if (status) status.textContent = message;
}

async function render(figure) {
	if (!figure.isConnected) return;
	const kind = figure.dataset.diagram;
	const source = figure.querySelector(".diagram-fallback code")?.textContent ?? "";
	const limit = kind === "mermaid" ? MERMAID_LIMIT : PLANTUML_LIMIT;
	if (!source.trim() || source.length > limit) {
		figure.dataset.state = "error";
		setStatus(figure, "源码为空或超出长度限制，已显示原文");
		return;
	}

	const token = (figure.dataset.renderToken = String(Number(figure.dataset.renderToken ?? 0) + 1));
	figure.dataset.state = "loading";
	setStatus(figure, "正在渲染图表…");
	try {
		const colors = palette();
		const svg = kind === "mermaid" ? await mermaid(source, colors) : await plantUml(source, colors);
		if (figure.dataset.renderToken !== token) return;
		const canvas = figure.querySelector(".diagram-canvas");
		if (!canvas) return;
		canvas.innerHTML = svg;
		canvas.setAttribute("aria-busy", "false");
		figure.dataset.state = "ready";
	} catch (error) {
		if (figure.dataset.renderToken !== token) return;
		console.error(`[diagram] ${kind} render failed`, error);
		figure.dataset.state = "error";
		setStatus(figure, "图表渲染失败，已显示源码");
	}
}

function enqueue(figure) {
	queue = queue.then(() => render(figure)).catch((error) => {
		console.error("[diagram] render queue failed", error);
	});
}

function init() {
	const found = document.querySelectorAll("figure[data-diagram]");
	if (found.length === 0) return;
	found.forEach((figure) => figures.add(figure));

	if (!("IntersectionObserver" in window)) {
		figures.forEach(enqueue);
	} else {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					observer.unobserve(entry.target);
					enqueue(entry.target);
				}
			},
			{ rootMargin: "600px 0px" },
		);
		figures.forEach((figure) => observer.observe(figure));
	}

	let timer;
	new MutationObserver(() => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			figures.forEach((figure) => {
				if (figure.dataset.state === "ready") enqueue(figure);
			});
		}, 200);
	}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
	init();
}
