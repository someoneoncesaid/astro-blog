import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";
import { withBase } from "../utils/url";

export async function GET(context) {
	const posts = await getCollection("blog");
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		// 频道链指向站点 base 根路径（GitHub Pages 项目页为 /<repo>/）
		site: new URL(import.meta.env.BASE_URL, context.site),
		items: posts.map((post) => ({
			...post.data,
			link: withBase(`/blog/${post.id}/`),
		})),
	});
}
