/**
 * 把 ```plantuml / ```mermaid 代码块换成图表占位块。
 *
 * 服务端只负责保留源码和版式，真正的 SVG 由 src/scripts/diagrams.js
 * 在浏览器里按需渲染（与 dsh-markdown-renderer 的做法一致，不依赖外部服务）。
 */

const DIAGRAM_LANGS = {
	plantuml: "plantuml",
	puml: "plantuml",
	uml: "plantuml",
	mermaid: "mermaid",
	mmd: "mermaid",
};

const KIND_LABELS = {
	plantuml: "PlantUML",
	mermaid: "Mermaid",
};

function escapeHtml(value) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function walk(node, visit) {
	if (!node || !Array.isArray(node.children)) return;
	node.children.forEach((child, index) => {
		visit(child, node, index);
		walk(child, visit);
	});
}

export default function remarkDiagrams() {
	return (tree) => {
		walk(tree, (node, parent, index) => {
			if (!node || node.type !== "code" || !parent) return;
			const kind = DIAGRAM_LANGS[String(node.lang || "").toLowerCase()];
			if (!kind) return;

			const source = node.value.trimEnd();
			const label = KIND_LABELS[kind];
			parent.children[index] = {
				type: "html",
				value: `<figure class="diagram" data-diagram="${kind}">
<div class="diagram-canvas" aria-busy="true"></div>
<pre class="diagram-fallback"><code>${escapeHtml(source)}</code></pre>
<figcaption class="diagram-caption"><span class="diagram-kind">${label}</span><span class="diagram-status">正在渲染图表…</span></figcaption>
</figure>`,
			};
		});
	};
}
