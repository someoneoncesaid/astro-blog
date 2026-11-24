---
title: "DSH 沙箱拆解：两层拦截，一次升级"
description: "模型要写工作区外的文件，或跑一条会删目录的命令，DSH 到底在哪一层拦住它？读完 packages/sandbox 会发现它不是开关，而是两层：内核用 bwrap、Landlock、Seatbelt、受限令牌关住不可信代码，进程内的围栏只检查模型给出的目标路径。四个包的分工、四种原语的方言、Windows 为什么只能报…"
pubDate: 2026-11-17
updatedDate: 2026-11-20
category: "DeepSeek Harness"
tags: ["DeepSeek-Harness", "沙箱", "安全", "Agent", "源码分析", "博客草稿"]
hashtags: []
cards:
  - type: html
    src: "/summaries/2026-11-17-deepseek-1dfe9d8a/01.html"
    title: "封面"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-17-deepseek-1dfe9d8a/02.html"
    title: "两层机制"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-17-deepseek-1dfe9d8a/03.html"
    title: "四个包"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-17-deepseek-1dfe9d8a/04.html"
    title: "四种原语"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-17-deepseek-1dfe9d8a/05.html"
    title: "Windows 两段式"
    width: 1080
    height: 1440
  - type: html
    src: "/summaries/2026-11-17-deepseek-1dfe9d8a/06.html"
    title: "一次升级"
    width: 1080
    height: 1440
generatedBy: "sync-summaries"
sourceHash: "d8aa4ab48fbd293c"
---

模型要写工作区外的文件，或跑一条会删目录的命令，DSH 到底在哪一层拦住它？读完 packages/sandbox 会发现它不是开关，而是两层：内核用 bwrap、Landlock、Seatbelt、受限令牌关住不可信代码，进程内的围栏只检查模型给出的目标路径。四个包的分工、四种原语的方言、Windows 为什么只能报 partial，以及拒绝之后那一次审批，都在这 6 页里。
