// 站点基本信息：改这里即可换成你自己的博客名与简介
export const SITE_TITLE = "SomeoneOnceSaid";
export const SITE_DESCRIPTION = "写给自己的笔记，关于代码、设计与日常。";
export const SITE_AUTHOR = "SomeoneOnceSaid";

// 51.LA 访问统计：id / ck 在后台「统计设置 → 参数」获取；
// widget 在「配置 → 参数设置 → 数据挂件」开启后获取，地址格式为
// https://v6-widget.51.la/v6/<统计ID>/quote.js（开启后约需 10 分钟生成）。
// 想暂时关闭统计时把 enable 设为 false 即可。
export const METRICS: {
	enable: boolean;
	sdk: string;
	id: string;
	ck: string;
	widget: string;
	autoTrack: boolean;
	hashMode: boolean;
} = {
	enable: true,
	sdk: "https://sdk.51.la/js-sdk-pro.min.js",
	id: "3Rqf7h76Kp7J43r3",
	ck: "3Rqf7h76Kp7J43r3",
	widget: "https://v6-widget.51.la/v6/3Rqf7h76Kp7J43r3/quote.js",
	// 自动跟踪路由变化；hashMode 用于监听 URL hash 变化（单页内锚点/路由）
	autoTrack: true,
	hashMode: true,
};

// 页脚社交媒体：换成自己的地址即可
export const SOCIAL_LINKS = {
	github: "https://github.com/someoneoncesaid",
	// TODO: 拿到小红书主页后替换这个搜索页占位链接
	xiaohongshu: "https://www.xiaohongshu.com/search_result?keyword=SomeoneOnceSaid",
	// 微信公众号二维码图片：替换 public/ 下的图片后同步改这里的路径
	wechatQr: "/wechat-qr.jpg",
};
