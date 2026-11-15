---
title: "DeepSeek 发布全家桶应用 API"
description: "这次发布的重点不是多了几个接口，而是把联网、读链接、文件解析、语音、风控整条链路搬到了服务端；代价是参数控制权、账单结构和合规责任一起转移，需要你写的东西从「调用工具」变成「渲染内容块并原样回传」"
pubDate: "2026-11-14"
category: "DeepSeek Harness"
tags: ["DeepSeek", "API", "Chatbot"]
generatedBy: "sync-posts"
sourceHash: "3c05ac2413e6bf525b681ee309078c3499dee56b"
sourcePath: "DeepSeek Harness/2026-11-14-DeepSeek 发布全家桶应用 API-9dafa4f8"
---

DeepSeek 在 2026-11-13 把自家 App 的对话能力整套开放到了 API 上：在原有请求里声明 `deepseek_web_search`、`deepseek_read_url`，或者打开 `safety_check`，联网搜索、深度思考搜索、阅读链接、文件解析和内容风控就由服务端执行；OCR、ASR、TTS、Search、Fetch 另有独立接口，可以单独调用。

以前是接模型、自己找工具；现在是模型、工具和审核都在服务端，客户端负责界面和状态。官方还开源了一个前端 Demo，可以导入网页端导出的历史对话继续聊，演示这套接口能达到的效果。

省下这份工作量的代价，是另外三样东西也一并推到了服务端：参数控制权（开启服务端工具后，temperature 这类参数直接被忽略）、账单结构（从纯 token 变成 token 加按次计费的工具费）、风险控制点（安全参数能开，但内容安全责任仍在你身上）。

本稿事实来自官方文档的发布说明、构建 Chatbot 指南与各工具接口文档，以及公众号原文；**未做实际调用实测**，示例请求均取自文档。文中带「待核实」标记的部分，是我没有找到官方说法的地方。

## 一、事实卡

| 项 | 内容 |
| --- | --- |
| 发布时间 | 2026-11-13（官方文档 release note），公众号推文 11-14 |
| 适用模型 | `deepseek-flash`（DeepSeek-V4.1-Flash-1017），1M 上下文、最大 384K 输出、支持图像理解 |
| 协议 | Messages（Anthropic 格式）、Responses、Chat Completions |
| 对话内服务端工具 | `deepseek_web_search`、`deepseek_read_url` |
| 对话内开关 | `safety_check`、`title`（按对话生成会话标题） |
| 独立接口 | Search、Fetch、OCR、ASR、TTS |
| 文件输入 | 走 Files API 上传解析后拿 `file_id`，再在对话里引用 |
| 附带产物 | Demo：`cdn.deepseek.com/chat-demo`；源码：`github.com/deepseek-ai/chat-demo` |

这套能力目前只在 `deepseek-flash` 上提供，`deepseek-v4-pro` 不在支持范围内；要用深度思考搜索这类能力，只能选 `deepseek-flash`。

## 二、最小改动：加几行声明

在 Chat Completions 下声明这两类工具，就能得到一个能联网、能读链接、带风控的 Chatbot 后端：

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-flash",
    "thinking": {"type": "enabled"},
    "tools": [
      {"type": "deepseek_web_search"},
      {"type": "deepseek_read_url"}
    ],
    "safety_check": {"level": "high"},
    "title": {"enabled": true},
    "messages": [{"role": "user", "content": "DeepSeek V4.1 有哪些更新？"}],
    "stream": true
  }'
```

三个协议的区别只在声明细节：Messages 走 `x-api-key` 和 `/anthropic/v1/messages`，工具要额外带 `name`；Responses 用 `reasoning.effort` 表达思考强度，输入是 `input` 字段；Chat Completions 用 `thinking.type`。

工作量的转移大致是：

| 环节 | 以前（自己拼） | 现在（服务端） | 你仍然要做 |
| --- | --- | --- | --- |
| 搜不搜 | 自己判断意图 | 模型判断 | 提供 UI 让用户能关掉 |
| 搜索执行 | 接第三方搜索 API | 自研搜索引擎 | 渲染结果卡片 |
| 网页正文 | 自己抓、自己清洗 | 服务端抓取 | 用 `signature` 原样回传 |
| 文件解析 | 自己写解析链路 | Files API + OCR | 选解析方式、管 `file_id` |
| 多轮上下文 | 自己拼工具结果 | 服务端拼接 | 保留 `kind` 与 `signature` |
| 内容审核 | 自建或接第三方 | `safety_check` 基础风控 | 拒答文案与合规义务 |

最后两列是这次发布真正的分界：服务端接过去的是执行，界面和责任仍在你这边。

## 三、联网工具：两种形态，一套内容块

同一个 `deepseek_web_search`，开不开思考是两种产品：

| 形态 | 开启方式 | 行为 | `kind` |
| --- | --- | --- | --- |
| 联网搜索 | 声明工具，关闭思考 | 模型判断是否搜索，一次可带多个查询词，带引用作答 | `search` |
| 深度思考搜索 | 声明工具，开启思考 | 多步推理中自主搜索、打开网页、页内查找 | `deep_search` |
| 图片搜索 | 用户消息带图片 | 按图搜索，无查询词 | `image_search` / `deep_image_search` |

深度思考搜索的执行动作有三种，都在 `content[].input.action` 里：

| action | 含义 | 对应工具 | 是否计费 |
| --- | --- | --- | --- |
| `search` | 联网搜索 | `deepseek_web_search` | 按查询词条数 |
| `open_page` | 打开网页 | `deepseek_web_search` | 仅真实抓取时计费 |
| `find_in_page` | 页内查找 | `deepseek_web_search` | 不计费 |

两个实现细节：

1. 深度思考搜索有次数上限，官方文档写的是「模型最多调用约 20 次工具后作答」。这个上限决定单轮能查多深，也决定工具费的上限。
2. 流式下工具块是整块下发的。`server_tool_use` 和结果块的内容一次性出现在 `content_block_start` 里，不会分段流出来；前端要按 `tool_use_id` 关联调用与结果，不能假设结果紧跟调用。

## 四、阅读链接：正文不在响应里

`deepseek_read_url` 有几条规则直接决定前端怎么存历史：

- 只识别**最后一条用户消息**里的 URL，重复的算一个，最多考虑前 10 个不同 URL，由模型决定读其中哪些。
- 正文**不在响应块里返回**，而是加密后放在 `signature` 字段；块中的 `url`、`title`、`data`、`published_at` 仅供展示，改了不影响结果。
- 同一轮读多个链接时，单个网页可用的长度会减少，长网页会被截断。
- 开启内容安全后，阅读结果通过审核才下发，未通过的返回 `url_not_allowed` 错误。
- 开启思考且同时声明了 `deepseek_web_search` 时，本轮走深度思考搜索，不再单独读链接。

`signature` 承担两件事：服务端不必把网页正文塞进响应体，下一轮又能靠它把这页内容还原回上下文。代价是客户端必须原样回传；一旦自行清洗历史，网页内容就丢了。

## 五、多轮对话：回传规则决定联网是否可用

把上一轮回复原样回传，保留 `kind` 和 `signature`，是这套 API 的硬约束。具体规则：

| 内容 | 下一轮是否进入上下文 |
| --- | --- |
| 回答正文（含 `citations`） | 是 |
| 搜索结果块 | 否 |
| 深度思考中打开的网页 | 否 |
| 历史轮次的思考过程 | 否 |
| 读链接得到的网页 | 是，但靠 `signature` 还原后拼到该轮用户消息末尾 |

`signature` 失效时，网页不会拼回上下文，但请求仍然正常执行。也就是说历史丢了接口不报错，只能在前端发现内容缺失。带联网工具块的旧消息也可以发给没有声明这些工具的请求，服务端会忽略。

所以历史不能当成随便裁剪的聊天数组：客户端要按协议保真回放，而不是按界面需要重组。

## 六、文件与语音：对话内解析，接口外单独调

文件输入分两步：先 `POST /files` 上传，`purpose` 指定解析方式，解析成功后才返回 `file_id`；再在对话消息里引用这个 `file_id`。两个 `purpose` 的差别在于模型能不能看到图：

| `purpose` | 模型拿到什么 | 适合 |
| --- | --- | --- |
| `text_recognition` | 只有文字，图全部丢弃 | 合同、论文、扫描件 |
| `rich_layout_recognition` | 文字 + 按原位裁出的图，占输入 token | 带图表的报告、幻灯片、说明书 |

两个坑：`purpose` 字段必须放在 `file` 字段之前（OpenAI Python SDK 会自动处理）；Anthropic 兼容接口调用 Files API 时要带 `anthropic-beta: files-api-2025-04-14`。文件解析完成才返回响应，解析期间不发送任何数据，客户端和中间代理的超时要按「上传 + 解析」设置，而不是只按上传设置。

五个独立接口的限制：

| 接口 | Endpoint | 关键限制 |
| --- | --- | --- |
| Search | `POST /v1/tools/search` | 自研搜索引擎；暂不支持图片搜索；QPS 100 |
| Fetch | `POST /v1/tools/fetch` | 返回 Markdown 正文；QPS 25，另有目标域名级限速 |
| OCR | `POST /v1/tools/ocr` | 100 MiB、1000 页；上传 120 s（中途停顿 ≤30 s）、总时长 180 s |
| ASR | `POST /v1/tools/asr` | 8 MiB、≤120 s；21 语种自动识别；双声道只识别左声道；不支持流式 |
| TTS | `POST /v1/tools/tts`（整段）/ `wss://.../v1/tools/tts`（流式） | 两个音色 `stella`（女，默认）、`tide`（男）；10 语种自动识别 |

两个语音接口的形态不同：ASR 一次发完整音频、返回完整文本，做实时字幕要自己在客户端切片；TTS 提供 WebSocket 流式，可以边生成边播，对应 App 里的「朗读回答」。TTS 目前只有两个音色。

## 七、内容安全：能开的是风控，开不出的是免责

`safety_check` 只有 `low` 和 `high` 两档，传别的值直接 400。行为和边界：

| 场景 | 表现 |
| --- | --- |
| 输入未通过 | `400 Content Exists Risk`，且输入 token 仍按缓存命中价计费 |
| 输出未通过 | 响应以拒答结束，Messages 下 `stop_reason: "refusal"`，`stop_details` 带类型 |
| 流式响应 | 拒答前已下发的文本无法撤回，前端要主动删除已展示的回答 |
| 审核时机 | 输出结束后连接不立刻关闭，服务端还要做一次完整审核 |
| 单独使用 | 不联网，`tool_choice` 只能 `auto` 或 `none` |

官方文档把这两条写得很直接：「已经流式下发的文本无法撤回」「响应不会说明拒答的具体原因」。前者要求前端能撤回已渲染的内容，后者意味着拒答无法做精细归因。

另外两个边界：没有开启 `safety_check`、但声明了联网工具的请求也可能以拒答结束；图片未通过审核时会指出具体是哪几张，但同样说明不了原因。

## 八、被忽略的参数

声明服务端工具、开启 `safety_check: high` 或 `title` 之后，以下参数由服务端决定，请求里传的值会被忽略：

| 协议 | 被忽略的参数 |
| --- | --- |
| Messages | `temperature`、`top_p`、`top_k`、`stop_sequences`、`thinking.budget_tokens`、`preserve_thinking`、`tool_choice.disable_parallel_tool_use`、`metadata`（`user_id` 除外） |
| Responses | `temperature`、`top_p`、`reasoning.summary`、`text.verbosity`、`include`、`max_tool_calls`、`truncation`、`metadata`、`parallel_tool_calls`、`store` |
| Chat Completions | `temperature`、`top_p`、`frequency_penalty`、`presence_penalty`、`stop`、`seed`、`n`、`preserve_thinking`、`parallel_tool_calls` |

`max_tokens` 照常生效，但它限制的是「一轮中每一步推理的输出长度」，不是整轮总输出。

另外几条硬限制：同一个工具不能声明两次；声明 `deepseek_web_search` 后不能再和自定义工具混用（会直接返回错误）；`allowed_domains`、`blocked_domains`、`user_location` 不支持；`tool_choice` 不能强制指定联网工具。

## 九、钱怎么算

两块费用叠加：token 费 + 工具调用费。

`deepseek-flash` 的 token 价（元 / 百万 tokens，空闲时段 / 高峰时段）：

| 项目 | 空闲时段 | 高峰时段 |
| --- | --- | --- |
| 输入（缓存命中） | 0.02 | 0.04 |
| 输入（缓存未命中） | 1 | 2 |
| 输出 | 4 | 8 |

工具价（来自官方定价图，与 Search、Fetch 接口同价）：

| 项目 | 价格 |
| --- | --- |
| 文字 / 图片搜索 | 5 元 / 千次 |
| 网页抓取 | 5 元 / 千次 |
| 文字识别 | 1.5 元 / 千页 |
| 语音识别 | 0.39 元 / 小时（划线价 0.78，限时 5 折） |
| 语音合成 | 1.5 元 / 万字符（划线价 3.0，限时 5 折） |

![DeepSeek 工具 API 定价](/posts/2026-11-14-deepseek-app-api/assets/120528c1a388.jpg)

计费口径有几处和直觉不同：

- 搜索按**查询词条数**计费：一次调用含 3 个查询词就计 3 次；调用失败或没有结果不计费。
- 抓取按**成功抓取的网页数**计费，而且包含被安全审核替换成 `url_not_allowed` / `unavailable` 的网页；抓取失败的不计费。
- 深度思考搜索里，再次打开同一网页、翻页、打开内容已随搜索结果返回的网页都不计费；页内查找不计费。
- 响应里的 `web_search_requests` / `web_fetch_requests` 含错误块，**只是展示，不是计费次数**；要算钱看 `tool_search`、`tool_fetch`、`tool_image_search`。

拿官方那段流式示例的 usage 算一遍（空闲时段）：输入 9078 token，其中缓存命中 4096、未命中 4982，输出 1686。token 费约 `4982×1e-6 + 4096×0.02e-6 + 1686×4e-6 ≈ 0.012 元`；同一次响应的 `tool_search` 为 2，工具费 `2×0.005 = 0.01 元`。这一次普通联网问答里，工具费和 token 费是同一量级。

深度思考搜索会把比例拉开：按 20 次调用上限、每次 1 个查询词估，工具费上限约 0.1 元；每次 3 个查询词约 0.3 元。此时 token 侧通常只有几万 token（约 0.02–0.05 元），账单主要由工具调用次数决定。1M 上下文配 0.02 元/M 的缓存命中价，意味着长历史重读很便宜，花钱的地方在联网调用。

## 十、边界与未确认

可以确认的边界：

- 图片搜索只在联网工具里能用，Search 接口暂不支持，官方写的是「后续会支持」。
- 联网工具不能和自定义工具混用，想让模型既搜索又调你自己的函数，目前得自己在应用层串。
- 深度思考搜索的「约 20 次」是文档措辞，不是可配置参数，具体边界行为（第 21 次怎么办）未说明。
- ASR 不支持流式，实时语音输入需要自己在客户端做 VAD 和分段。
- TTS 只有两个音色和 10 个语种，文档没有提定制音色。

待核实的地方（没找到官方说明，不宜写进结论）：

1. 覆盖范围里的「文件输入」在对话内是否完全等价于 Files API 手工上传，还是存在额外的服务端预处理。
2. 开启 `title` 后返回的标题字段在三个协议里的一致性，文档只给了示例。
3. 拒答的具体 `category` 取值：示例中 `stop_details` 的类型和解释都是 `null`，实际是否可能有值未说明。
4. 工具调用在 `usage` 之外是否有独立的用量查询接口。

## 十一、上手顺序

1. 先用一个 curl 打通 `chat/completions` + 两个工具声明，确认 `server_tool_use` 和结果块长什么样。
2. 再写历史管理：按 `tool_use_id` 关联，原样回传并保留 `kind`、`signature`。这一步写错，后面所有联网体验都会「看起来能用、追问就断」。
3. 加 `safety_check: high`，把拒答（含流式下撤回已渲染文本）做成产品流程，而不是异常兜底。
4. 需要文档问答时接 Files API，先想清楚 `text_recognition` 还是 `rich_layout_recognition`，这直接决定 token 和答案质量。
5. 最后再做语音：ASR 和 TTS 各自是独立接口，和对话链路可以解耦上线。

## 十二、来源与索引

| 内容 | 地址 |
| --- | --- |
| 公众号原文 | https://mp.weixin.qq.com/s/78KBHc4-4N5b2vfL9SkutQ |
| 官方发布说明 | https://api-docs.deepseek.com/zh-cn/news/news261113 |
| 构建 Chatbot | https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot |
| 联网工具 | https://api-docs.deepseek.com/zh-cn/guides/web_tools |
| 网页搜索与抓取 | https://api-docs.deepseek.com/zh-cn/guides/search |
| 模型内容安全 | https://api-docs.deepseek.com/zh-cn/guides/safety |
| 文件解析 | https://api-docs.deepseek.com/zh-cn/guides/document_parsing |
| OCR / ASR / TTS | https://api-docs.deepseek.com/zh-cn/guides/ocr 、`/asr`、`/tts` |
| 模型与价格 | https://api-docs.deepseek.com/zh-cn/quick_start/pricing |
| Demo 体验 | https://cdn.deepseek.com/chat-demo |
| Demo 源码 | https://github.com/deepseek-ai/chat-demo |

素材留档：`素材/公众号原文.md`（正文提取）、`素材/工具API定价.jpg`（官方定价图）。
