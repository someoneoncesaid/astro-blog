---
title: "Electron 当瘦壳，Web 原样跑"
description: "把现成的 Web 应用装进桌面窗口，两条老路都会撞墙：再写一套后端要维护两套应用，原样塞进 BrowserWindow 会在认证、流式、插件安装上卡住。 DeepSeek Harness 选了第三条：Electron 只当瘦壳，完整 Web 应用照原样跑在 desktop profile 上，适配只发生在两者的接触面…"
pubDate: 2026-11-11
updatedDate: 2026-11-14
category: "DeepSeek Harness"
tags: ["DeepSeek-Harness", "Electron", "桌面端", "源码分析", "博客草稿", "小红书"]
hashtags: ["DeepSeekHarness", "Electron", "桌面端开发", "源码阅读", "前端架构", "Agent"]
cards:
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/01.html"
    title: "封面"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/02.html"
    title: "进程结构"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/03.html"
    title: "传输适配"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/04.html"
    title: "启动适配"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/05.html"
    title: "Profile 所有权"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/06.html"
    title: "能力桥"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/07.html"
    title: "控制面"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-09-dsh-electron-shell/08.html"
    title: "收束 · 三条不变量"
    width: 1080
    height: 1440
generatedBy: "sync-summaries"
sourceHash: "c97ca4f977960440"
---

把现成的 Web 应用装进桌面窗口，两条老路都会撞墙：再写一套后端要维护两套应用，原样塞进 BrowserWindow 会在认证、流式、插件安装上卡住。

DeepSeek Harness 选了第三条：Electron 只当瘦壳，完整 Web 应用照原样跑在 desktop profile 上，适配只发生在两者的接触面。8 页图卡按源码拆完七层——

01 进程：Electron 可执行文件当 Node 用，拉起跑着完整 Web 应用的子进程
02 传输：dsh-app:// 自定义协议本地读静态页、动态请求转发并补认证
03 启动：注入内容变成纯 JSON 行表，同一个 index.html 里逐行接力
04 Profile：独占 profiles/desktop，启动只校验、不装包
05 能力桥：preload 全局对象，探测到就用，不在就回退 Web
06 控制面：带 requestId 和死线的反向询问，超时宁可问用户也不猜
07 环境差异：登录 shell、语言缓存、平台窗口都消化在壳里

收束成三条：复用不复制、同一文档内引导、能力探测降级而非条件编译。

几个容易写错的点也标进图里了：不是「客户端代码完全不分支」，boot 分岔只有 apps/web/src/main.ts 一处；DesktopHostUncleanExitError 不是超时错误，来自非优雅 teardown；插件 revision 随产物内容变化，别当成每次启动必换。

代价写清楚：桌面仍要在 127.0.0.1 监听一个本地端口，换的是 Web 的路由、认证、流全部复用，不宣称性能收益。基于本地源码 fcc0ad46 逐条核对，逐行源码位置见主页长文。
