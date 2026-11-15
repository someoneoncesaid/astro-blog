---
title: "OAR：用一个接口调用多种编程 Agent"
description: "本文从项目已有 HTML 图卡逐页提取，保留原稿内容与来源链接。"
pubDate: "2026-10-29"
category: "DeepSeek Harness"
tags: ["DeepSeek-Harness", "AI工具"]
generatedBy: "sync-posts"
sourceHash: "cbc09fd49d6b6d6f5d527a6c718373984935dd0d"
sourcePath: "DeepSeek Harness/2026-10-29-OAR-编程Agent统一调用"
---

本文从项目已有 HTML 图卡逐页提取，保留原稿内容与来源链接。

## 第 01 页

OPEN AGENT RUNTIME技术拆解 / 01

把调用方式统一起来

一个接口
接入多种
编程 Agent

OAR 是什么？DeepSeek Harness 又怎样用它委派编程任务？

DSH 实验性接入subagent_oar 工具

DeepSeek Harness 新增实验性 subagent-oar provider，配合 subagent_oar 工具，将一次性文本任务交给 Codex 或 Claude Code。

OAR = Open Agent Runtime向右滑，拆开看 →

## 第 02 页

01 / 项目定位一个接口，多种运行时

OAR 到底
统一了什么？

OAR 是一个 TypeScript 库。它用共同的 Runtime / Session 接口，让应用启动、控制并观察不同的编程 Agent。

你的应用

OAR统一 Runtime / Session API

CodexClaude CodeCursor

01
运行前：知道能不能用
检查 Agent 是否已安装；按运行时查询模型、登录和用量等可用信息。

02
运行中：用同一套会话接口
创建 Session、发送任务；可用的排队、转向和取消能力由运行时声明。

03
运行后：读统一事件与原始记录
用 events() 展示过程；用 records() / rawEvents() 核对原生消息。

依据： https://github.com/botiverse/oar/blob/main/packages/oar/README.md @botiverse/oar README。具体能力依运行时而异。

上层调用统一 · 底层各自执行02 / 07

## 第 03 页

02 / 生命周期以 Codex 为例

一项任务，
从启动到收尾

先选运行时并打开会话，再发任务、观察结果，最后释放资源。

选择 Runtime
从注册表取出 Codex 对应的运行时实现。

确认安装可用
调用 installation()；只有返回 available 才继续。

打开 Session
传入安装结果与工作目录；订阅事件以观察过程。

发送任务并等待本轮结果
promptAndWait() 将输入关联到对应 Turn；事件可同时流向界面。

读取结果，释放会话
检查完成或拒绝结果；不再使用时调用 dispose()。

TypeScript 调用示例 省略 import；直接使用 process.cwd()

const runtime = defaultRuntimes.require("codex")
const found = await runtime.installation?.()
if (found?.kind !== "available") throw Error("Codex unavailable")
const session = await runtime.session(found, { cwd: process.cwd() })
try { await promptAndWait(session, "修复问题") }
finally { await session.dispose() }

两个时间点Turn 结束：本轮有结果 · dispose()：释放会话资源

依据： https://github.com/botiverse/oar/blob/main/packages/oar/README.md @botiverse/oar README 的使用示例。

一个 Session 可以承载后续交互03 / 07

## 第 04 页

03 / 能力边界统一接口，不等于完全一致

统一的是入口，
差异还在底层

可统一

会话控制
发任务、收事件、取消会话；部分运行时支持恢复与排队。

可统一结果记录
把交互整理成事件或记录，方便上层处理与回放。

仍有差异

功能支持
模型与功能取决于具体 Agent 及其版本。

仍有差异权限与沙箱
权限与沙箱仍按各 Agent 的设置生效。

OAR 的处理原则

不支持的选项会在启动前报错。

接入前先核对：运行时版本、支持选项、权限模式、沙箱设置。

调用方式可以统一，能力需要逐个确认04 / 07

## 第 05 页

04 / 实现架构一张图看懂 OAR

任务怎么下去，
结果怎么回来？

统一接口向下调用原生 Agent；记录流向上提供事件与状态。

任务下行 · 记录上行05 / 07

## 第 06 页

05 / DSH 中的 OAR看一个真实用法

在 DSH 里，
它用于一次性委派

subagent_oar 选择 Codex 或 Claude Code，执行一次文本任务。

DSH 主 Agent

OAR 工具

原生 CLI

返回最终文本或失败通知

当前集成范围
已验证 Codex 和 Claude Code；其他运行时待验证。

重要限制
不创建 DSH 子 Session；不支持继续或恢复。

在 DSH 中开启 · Profile 配置
① 安装并登录 Codex / Claude Code 原生 CLI。
② 为 Profile 添加 OAR 提供方与工具包依赖，按文档补丁挂载运行时、权限及 providers 映射。
③ 通过 dsh 启动该 Profile，使用 subagent_oar 委派任务。

最小 Profile 补丁：只接入 Codex
- insert:
    - name: '@deepseek-ai/dsh-experimental-subagent-oar'
      config:
        runtime: codex
        providerName: oar-codex
        launchArgs: ['-c', 'sandbox_mode="workspace-write"']
    - name: '@deepseek-ai/dsh-experimental-tool-subagent-oar'
      config:
        providers:
          codex: oar-codex

先在组合中声明以上两个包的依赖，再将补丁加入 Profile 配置层。Codex CLI 需已安装并登录。

原生 CLI 需单独安装与认证；权限由 profile 配置。

示例：DeepSeek Harness experimental/subagent-oar06 / 07

## 第 07 页

06 / 总结对比专用适配 vs 统一适配

都能调用多种 Agent，
接入方式有何不同？

DSH 专用接入和 OAR 接入，都能把任务交给 Codex 或 Claude Code。

DSH 专用接入 官方插件

入口：subagent_codex / subagent_claude_code
适配：分别对接 Codex app-server / Claude SDK
安装：专用 Bundle 提供对应原生载荷
进程：纳入 DSH 子进程管理

OAR 接入 实验性统一入口

入口：subagent_oar，用 runtime 选择已配置后端
适配：DSH → OAR → Codex / Claude Code
安装：自行安装、认证和维护原生 CLI
进程：由 OAR 管理

例：Codex 改代码，Claude 审查

专用接入：先调用 Codex 工具，再调用 Claude 工具。
OAR 接入：调用同一个工具，分别传 codex、claude。

核心差异：专用接入分别适配各产品；OAR 用统一接口适配多个产品。两者均为独立的一次性任务，不支持续聊或恢复。

依据：DSH Codex、Claude Code、OAR 提供方文档。OAR 其他运行时尚未经 DSH 验证。

不同工具选后端 / 同一工具传参数07 / 07
