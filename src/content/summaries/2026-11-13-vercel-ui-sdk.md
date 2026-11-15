---
title: "Vercel 把 UI 组件拆成零件，专供 AI Agent 组装"
description: "Agent 能生成界面，却常把键盘导航和无障碍做错？Vercel 开源的 UI SDK 换了个思路：不做组件库，而是把组件底层拆成 50+ 个可复用的「行为」——焦点、选区、弹层、拖拽，都经过测试。definePrimitive 定义原语，createParts 把同一份代码渲染到 React / Vue / Svel…"
pubDate: 2026-11-13
category: "未分类"
tags: []
hashtags: ["AI", "前端开发", "开源项目", "Vercel", "AI-Agent"]
cards:
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/01.html"
    title: "封面"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/02.html"
    title: "零件思维"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/03.html"
    title: "50+ 行为"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/04.html"
    title: "五层架构"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/05.html"
    title: "一套形状，五个框架"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/06.html"
    title: "面向 Agent 的设计"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/07.html"
    title: "校验与操作"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-13-vercel-ui-sdk/08.html"
    title: "工程化与适合谁"
    width: 1080
    height: 1440
generatedBy: "sync-summaries"
sourceHash: "06c6ca3a5f3aabe3"
---

Agent 能生成界面，却常把键盘导航和无障碍做错？Vercel 开源的 UI SDK 换了个思路：不做组件库，而是把组件底层拆成 50+ 个可复用的「行为」——焦点、选区、弹层、拖拽，都经过测试。definePrimitive 定义原语，createParts 把同一份代码渲染到 React / Vue / Svelte / Solid / Web Components，还能按 WAI-ARIA 自动校验。Agent 不用截图就能直接操作界面，官网自测快 2 倍以上，成本不到一半。几分钟看懂这个仓库的分层设计。
