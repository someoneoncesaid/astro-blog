---
title: "双端适配，除了缩小界面还要做什么？"
description: "从 DeepSeek Harness 的双端方案里，可以借鉴哪些经验？先总结四条设计方法，再看空间布局、阅读体验、操作入口、输入过程、弹层焦点、状态保留与运行环境七个场景，最后补充 Windows、macOS 桌面顶部入口的真实截图与实现。共 10 张：封面＋核心经验＋7 张分述＋1 张实图补充。已有源码处理与待验收项…"
pubDate: 2026-11-07
category: "DeepSeek Harness"
tags: ["DeepSeek-Harness", "前端", "响应式设计", "源码分析", "博客草稿", "AI工具", "双端适配"]
hashtags: ["DeepSeekHarness", "AI编程", "AI工具", "Agent", "移动端适配", "产品设计"]
cards:
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/01.html"
    title: "双端适配，一套界面怎么做？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/02.html"
    title: "DSH 的双端适配，最值得学这四点"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/03.html"
    title: "三栏放不下，空间怎么分？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/04.html"
    title: "长文本与字号，怎样看得清？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/05.html"
    title: "没有鼠标，功能怎么找？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/06.html"
    title: "手机输入，焦点如何切换？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/07.html"
    title: "抽屉打开，焦点应该去哪？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/08.html"
    title: "窗口变了，哪些状态该留下？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/09.html"
    title: "同一套 UI，桌面还差什么？"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-04-dsh-dual-end-layout/10.html"
    title: "侧栏收起来，顶部入口怎么留？"
    width: 1080
    height: 1440
generatedBy: "sync-summaries"
sourceHash: "6ed17063f83bb6a2"
---

从 DeepSeek Harness 的双端方案里，可以借鉴哪些经验？先总结四条设计方法，再看空间布局、阅读体验、操作入口、输入过程、弹层焦点、状态保留与运行环境七个场景，最后补充 Windows、macOS 桌面顶部入口的真实截图与实现。共 10 张：封面＋核心经验＋7 张分述＋1 张实图补充。已有源码处理与待验收项分开说明，不代表完成了全设备真机验收。
