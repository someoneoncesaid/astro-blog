---
title: "Claude 如何设计常驻 Agent：五个组件拆开看"
description: "Agent 想「一直在线」，难点不在模型，而在每次运行之间的交接。William Hu 在 Anthropic 的文章里给出五个组件：收件箱负责落盘、去重和失败重试；定时器到点才把任务写进收件箱；记忆只留规则、偏好、已通知内容和未完成进度；权限遇到要人决定的操作就保存会话、结束运行，等回复再开新 run 接续；发件箱控…"
pubDate: 2026-11-14
category: "DeepSeek Harness"
tags: []
hashtags: []
sourceUrl: "https://claude.com/resources/articles/building-always-on-agents"
cards:
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/01.html"
    title: "封面"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/02.html"
    title: "run 与 session"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/03.html"
    title: "事件收件箱"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/04.html"
    title: "定时器"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/05.html"
    title: "记忆"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/06.html"
    title: "权限"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/07.html"
    title: "发件箱"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-14-always-on-agents/08.html"
    title: "完整链路"
    width: 1080
    height: 1440
generatedBy: "sync-summaries"
sourceHash: "f84b80376ce29c2b"
---

Agent 想「一直在线」，难点不在模型，而在每次运行之间的交接。William Hu 在 Anthropic 的文章里给出五个组件：收件箱负责落盘、去重和失败重试；定时器到点才把任务写进收件箱；记忆只留规则、偏好、已通知内容和未完成进度；权限遇到要人决定的操作就保存会话、结束运行，等回复再开新 run 接续；发件箱控制通知节奏和投递失败后的恢复。周五汇总，就是这五件事依次发生。
