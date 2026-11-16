/**
 * 给 Markdown/MDX 渲染结果中的站内绝对路径补上 Astro base。
 * 内容里的图片（/posts/...）和链接（/blog/...）是同步脚本按根路径写入的，
 * GitHub Pages 项目页需要 /<repo>/ 前缀，交由构建期统一处理。
 */
const URL_ATTRIBUTES = ["src", "href", "poster"];

function normalizeBase(base = "/") {
	const trimmed = String(base).trim();
	if (!trimmed || trimmed === "/") return "";
	return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function isRootRelative(value) {
	return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

export default function rehypeBase(options = {}) {
	const base = normalizeBase(options.base);

	return (tree) => {
		if (!base) return;

		const visit = (node) => {
			if (node && node.type === "element" && node.properties) {
				for (const attribute of URL_ATTRIBUTES) {
					const value = node.properties[attribute];
					if (!isRootRelative(value)) continue;
					if (value === base || value.startsWith(`${base}/`)) continue;
					node.properties[attribute] = `${base}${value}`;
				}
			}

			if (Array.isArray(node?.children)) {
				for (const child of node.children) visit(child);
			}
		};

		visit(tree);
	};
}
