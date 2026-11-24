---
title: "Anthropic 怎么设计常驻 Agent"
description: "Anthropic 这篇《Building always-on agents》值得读的地方，是它没有停在概念层。William Hu 把常驻 Agent 拆成五个外围组件——收件箱、定时器、记忆、权限、发件箱，每一块都落到具体的表和进程：唯一键去重、调度器三步把到期任务写回队列、记忆按需加载、凭据放在代理里、要人拍板就…"
pubDate: 2026-11-14
category: "anthropic"
tags: []
hashtags: []
sourceUrl: "https://claude.com/resources/articles/building-always-on-agents"
cards:
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/01.html"
    title: "备选封面 · 报纸拼贴"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/02.html"
    title: "封面"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/03.html"
    title: "系统全景"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/04.html"
    title: "事件收件箱"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/05.html"
    title: "可靠性"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/06.html"
    title: "定时器"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/07.html"
    title: "记忆"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/08.html"
    title: "上下文"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/09.html"
    title: "权限"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-building-always-on-agents-3ed4dee3/10.html"
    title: "发件箱"
    width: 1080
    height: 1440
generatedBy: "sync-summaries"
sourceHash: "0e60c2a231c5f29e"
---

Anthropic 这篇《Building always-on agents》值得读的地方，是它没有停在概念层。William Hu 把常驻 Agent 拆成五个外围组件——收件箱、定时器、记忆、权限、发件箱，每一块都落到具体的表和进程：唯一键去重、调度器三步把到期任务写回队列、记忆按需加载、凭据放在代理里、要人拍板就挂起会话。文章也写了代价：压缩会丢细节，通知频率要单独调。
