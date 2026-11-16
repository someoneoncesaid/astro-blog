/**
 * 拼接站内路径与 Astro 的 base 前缀。
 * 本地开发 / Cloudflare 构建时 base 为 "/"；
 * GitHub Pages 项目页构建时为 "/<repo>/"。
 */
export function withBase(path = "/"): string {
	const base = import.meta.env.BASE_URL.replace(/\/+$/, "");

	// 外链、协议相对地址、锚点原样返回
	if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//") || path.startsWith("#")) {
		return path;
	}

	const clean = path.startsWith("/") ? path : `/${path}`;
	if (!base) return clean;

	// 已经是带 base 的路径时不重复拼接
	if (clean === base || clean.startsWith(`${base}/`)) return clean;

	return clean === "/" ? `${base}/` : `${base}${clean}`;
}

/** 生成页面绝对 URL，用于 canonical / Open Graph。 */
export function absoluteUrl(path: string, site: URL | undefined): URL {
	return new URL(withBase(path), site);
}
