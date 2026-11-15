---
title: "DeepSeek Harness 的对话流处理"
description: "从「对话流是不是无限滚动」出发，拆解 DSH 的尾部窗口、手动分页、跳转补页、prepend 锚点保持与虚拟化取舍"
pubDate: "2026-11-07"
category: "DeepSeek Harness"
tags: ["DeepSeek-Harness", "前端", "虚拟列表", "源码分析"]
generatedBy: "sync-posts"
sourceHash: "756a2bf6c607ed075bc2acfe0d03aff031b0cd0c"
sourcePath: "DeepSeek Harness/2026-11-07-DeepSeekHarness的对话流处理"
---

关联：[DeepSeek Harness 的移动端与 PC 端适配逻辑](/blog/2026-11-04-dsh-dual-end-layout/)。

一个几千 turn 的长会话，浏览器会一次性渲染全部消息吗？滚到顶会自动补一页的"无限滚动"吗？本文基于本地 `fcc0ad4621` 的源码回答：都不是。DSH 对话流是**尾部窗口 + 手动分页 + 跳转补页 + 锚点保持**的组合；性能防线是"窗口不超长"，而不是"虚拟化全量列表"。

下文先给出一句话结论，再按加载、触发、滚动稳定、渲染四个层面展开；每条声明都对应文末源码索引中的具体文件与行号。

## 总览：对话流的四个机制

| 机制 | 做法 | 用户感知 |
| --- | --- | --- |
| 尾部窗口 | 打开会话只拉尾部一页（约 50 条消息、Turn 对齐） | 秒开，不渲染全量历史 |
| 手动分页 | 列表顶端是"加载更早"按钮，点击才向前 prepend | 滚到顶不会自动加载 |
| 跳转补页 | 右侧导航轨点未加载 turn，循环向后翻页直到覆盖目标 | 跳到很远的 turn 一次到位 |
| 锚点保持 | prepend 前后用语义锚点对齐阅读位置 | 加载更早内容时画面不闪跳 |

## 一、窗口分页：首开只取尾部一页

会话首次打开时调 `events.open(HISTORY_PAGE_OPTIONS)` 拉取尾部窗口，而不是全量历史。页参数集中在两处常量：

- `PAGE_MESSAGES = 50`：普通历史页的最小消息数；`turnWindow` 要求每页至少 50 条消息、对齐 2 个 Turn 起点。
- `HISTORY_PAGE_OPTIONS = { maxMessages: 500, turnWindow: { minMessages: PAGE_MESSAGES, minTurns: 2 } }`：单页上限 500 条，防止单页过大。
- `JUMP_PAGE_MESSAGES = 200`：跳转补页专用页大小，在 50 条普通页与 500 条上限之间取中，减少跳转的往返次数。

分页方向是 `beforeSeq = this.baseSeq` 的向前 prepend：新加载的一页插在已加载窗口的上方，Turn 对齐保证页边界落在完整 turn 上，不会把一个 turn 的消息劈成两半。`hasMore` / `loadingOlder` 两个状态位挂在会话对象上，供 UI 判断按钮可用性与加载中提示。

## 二、触发表：什么动作加载什么页面

对话流没有 IntersectionObserver，也不在滚动事件里自动触发加载。所有历史加载都由显式动作发起：

| 触发动作 | 加载路径 | 页参数 |
| --- | --- | --- |
| 打开会话 | `session.open()` → `events.open(HISTORY_PAGE_OPTIONS)` | 尾页，50 条 |
| 点击"加载更早"按钮 | `navigation.loadEarlier()` → `session.loadOlder()` | 50 条一次 |
| 导航轨点未加载 turn | `navigation.navigateToTurn()` → `session.loadThrough(seq)` | 每页 200 条，循环 |

"加载更早"按钮只在 `hasMore` 为真时渲染，挂载在列表顶端（加载中显示 loading 文案并禁用）。

`loadThrough` 是跳转专用的循环补页：反复向后 prepend，直到已加载窗口覆盖目标 seq；期间已有并发请求会合并重定向到更小（更早）的目标 seq，而不是排队。点击跳转前先把 `viewport.beginPreserving()` 和 `reading.pauseFollowing()` 置位，保证补页落地时阅读位置受保护、底部跟随暂时停用。

## 三、prepend 不闪跳：语义锚点保持

历史内容插到列表上方会带来一个经典问题：浏览器默认把当前 scrollTop 对应的内容顶下去，读者的视线落点瞬间错位。DSH 的解法是用**语义锚点**而不是攀升差值：

1. 每一行（消息节点或分组）挂 `data-chat-anchor-key` 属性，作为可寻址的语义锚点。
2. 发起分页前记下可见锚点及其相对视口的几何位置。
3. prepend 提交后再读取同一锚点，把 scrollTop 对齐回去。

锚点解析带排除规则：`hidden` 行不作为锚点，分组行优先取组内首个有内容的锚点，向上的默认落点是第一个可见行。加载中、被折叠的行不参与对齐。

`ChatNavigation` 用一个小状态机管理这段窗口期：跳转有 `loading → settled` 的相位和 `pending → landed → interrupted` 的落地状态；用户一旦手动滚动（`readerSampled` 检测到阅读位移），跳跃落地就被标记为 `interrupted` 并停止位置补偿——用户的主动滚动优先于回放锚定。滚动尚未结束时（`readerSettled`），补偿会等滚动停下再接管。若补页后窗口仍未覆盖跳转目标（`firstSeq` 还大于目标 seq 且有更多历史），`reconcile` 会继续循环补页，直到覆盖后才把滚动落到目标 turn；覆盖不了时降级为落到当前窗口内最近的 turn。

## 四、渲染策略：平面流不虚拟化，两处例外

**对话流本体是平面流**：`ChatFlow` 直接 `entries.map` 渲染已加载窗口的每一行为真实 DOM，不插父容器、不虚拟化。行数由"窗口不超长"控制（首屏一页，每次手动补 50 或 200 条），而不是由虚拟化控制 DOM 数。简单性换来的是：全窗口可被原生文本查找、可整段复制、无虚拟行高测量误差。

虚拟化只用在两个**有清单语义**的地方：

- **Turn 导航轨**（右侧 turn 刻度条）：用 `@tanstack/react-virtual` 渲染会话全部 turn 的刻度（含未加载 turn），固定 10px 节距、`overscan: 3`；`rangeExtractor` 额外保留焦点 turn 的邻近项防止焦点丢失；`directDomUpdates`、`scrollend` 事件、首帧按活动 turn 居中初始化都是为了让刻度条跟随不抢滚动。
- **Trajectory 表格视图**：同样用 `@tanstack/react-virtual` 的表格式全窗口渲染。

一类是"消息流"（逐条语义，比例不受控），一类是"清单/刻度"（固定节距，条目数可线性膨胀）。DSH 的取舍是前者靠窗口控制规模，后者靠虚拟化控制规模。

## 五、配套的阅读状态

- **底部跟随**：每个滚动口挂一个 `ScrollFollow` 控制器表达跟随意图；区分"原生滚动动画进行中"与"用户主动滚动"，前者不计为读者移动，不会误停跟随。
- **分页与跟随互斥**：发起加载更早或跳转前先 `pauseFollowing`，补页落地或用户滚动后再恢复。
- **底部留白槽**：列表底部有一个 spacer，为"收卷中的行"保留空间，直到滚动或内容增长使继续保留变得不必要。
- **打开期提示**：会话打开失败或加载中，列表区显示明确的 loading / 错误卡片，不用空白页。

## 应用到自己的产品

- 长流式内容先问"窗口多大"，再问"要不要虚拟化"；把历史分页对齐到业务单元（会话、turn、天），页边缘才不撕裂。
- 分页触发方式与阅读节奏匹配：聊天场景滚到顶自动加载会与"看顶上最近消息"的意图冲突，显式按钮更符合控制感。
- prepend 场景必须做锚点保持，且锚点要选择"读者看得见的语义行"；用户主动滚动后应停止补偿，而不是与用户抢滚动位置。
- 虚拟化的收益取决于节距是否规律：均匀行高清单值得虚拟化，天然不定高的消息流适合窗口化。

## 附录：源码索引

所有路径相对 DeepSeek Harness 仓库根目录；行号对应 `fcc0ad4621`。

窗口分页参数与加载实现：

- session-controller/src/client/sessions/session.ts:52-61 — `PAGE_MESSAGES`、`HISTORY_PAGE_OPTIONS`、`JUMP_PAGE_MESSAGES` 常量
- session-controller/src/client/sessions/session.ts:419-436 — `loadOlder` 向前 prepend 一页
- session-controller/src/client/sessions/session.ts:440-488 — `loadThrough` 跳转循环补页与合并重定向
- session-controller/src/client/sessions/session.ts:632 — 首开拉尾页

触发入口与 UI：

- ui-chat/src/client/chat/ChatView.tsx:239-242 — "加载更早"按钮
- ui-chat/src/client/apply.ts:288 — 按钮到 `session.loadOlder()` 的接线
- ui-chat/src/client/chat/use-chat-navigation.ts — `ChatNavigation` 跳转状态机与锚点窗口期
- ui-chat/src/client/chat/turn-rail-items.ts — 导航轨 loaded/unloaded 锚点合并

锚点保持与滚动几何：

- ui-chat/src/client/chat/ChatNodeSeat.tsx:156 — 行级 `data-chat-anchor-key` 写入
- ui-chat/src/client/chat/ChatGroupSeat.tsx:192 — 分组锚点 `group:` 前缀
- ui-chat/src/client/chat/use-chat-viewport.ts:641-694 — 锚点解析与位置对齐

渲染：

- ui-chat/src/client/chat/ChatFlow.tsx:18-44 — 平面流渲染，零父容器
- ui-chat/src/client/chat/TurnNavigator.tsx:110-177 — 导航轨虚拟化（10px 节距、overscan 3、rangeExtractor）
- ui-trajectory/src/client/TrajectoryTable.tsx — 轨迹表格虚拟化

阅读状态：

- ui-chat/src/client/chat/use-scroll-follow.ts — 底部跟随意图与读者移动判定
