# OpenClaw Orchestrator 质量审查清单

更新时间：2026-03-12

## 范围

- 插件迁回与安装链路
- 工作流编辑、执行、定时任务
- 实时事件流、聊天刷新、监控面板
- Empire / Agent 广场 / 3D 小人交互

## 严重度定义

- 高：会导致功能错误、数据错误、执行失败、误导用户
- 中：功能基本可用，但存在明显边缘问题、状态不同步、交互错误
- 低：文案、样式、可用性或一致性问题，不阻断主流程

## 审查结果

### 高严重度

- `packages/web/src/App.tsx:14` 与 `packages/web/src/pages/DashboardPage.tsx`
  - 问题：`useWebSocket()` 原先同时挂在应用根和首页，进入首页时会建立双重订阅、双重轮询和双重事件处理。
  - 复现：停留在首页时观察实时消息、通知或工作流状态，可能出现重复写入、重复通知、连接状态抖动；切走首页时还会执行一次额外清理。
  - 处理：已移除首页重复挂载，WebSocket 现只在应用根维持单一连接。

- `extensions/openclaw-orchestrator/src/client.ts`
- `extensions/openclaw-orchestrator/src/tools.ts`
- `extensions/openclaw-orchestrator/README.md`
  - 问题：插件迁回后桥接层文件出现损坏文案/异常字符串，直接影响插件可维护性，并可能导致运行时异常字符串不可读。
  - 复现：查看插件源码可见大量损坏文本；`client.ts` 中错误字符串原本已破损。
  - 处理：已整体重写为干净版本，并验证安装脚本可复制到目标目录。

- `packages/web/src/pages/EmpireMonitorPage.tsx`
  - 问题：页面 return 区域结构不稳定，Hero/Header 区块缩进与结尾标签错位，后续改动容易引入渲染错误。
  - 复现：查看文件原始结构可见 JSX 层级错位；该区域继续增改时容易出现闭合问题。
  - 处理：已收口为稳定结构，并重新构建通过。

### 中严重度

- `packages/web/src/components/empire-dashboard/EmpireOfficeBoard.tsx`
- `packages/web/src/components/empire-dashboard/OpsSections.tsx`
- `packages/web/src/pages/DashboardPage.tsx`
  - 问题：Agent 广场和帝国页把 3D 场景与房间列表放在同一个自然流容器里，房间卡片一多就会持续撑高父容器，导致中部面板失衡、底部被挤压，滚动区域也不稳定。
  - 复现：Agent / 工作室数量增多时，首页 Agent 广场下半段会越长越高；帝国页的房间列表也会把主场景整体顶高，出现“看起来没有滑块但内容已经超出”的体验。
  - 处理：已改成“场景主体固定占位 + 房间列表独立纵向滚动”的布局，首页卡片容器也同步改为纵向 flex，避免整体高度被列表继续撑开。

- `packages/web/src/pages/WorkflowEditorPage.tsx`
- `packages/web/src/components/team/TeamWorkflowEditor.tsx`
  - 问题：定时开关 UI 使用位移 transform，实现上容易出现“关闭后滑块仍在右侧”的视觉错位，且两个页面实现重复，存在继续漂移风险。
  - 复现：多次开关、热更新后观察拨动位置；用户已实际反馈该问题。
  - 处理：已统一改为基于布局的左右贴边实现，不再依赖 transform 位移。

- `packages/web/src/pages/DashboardPage.tsx`
  - 问题：首页顶栏 `工作流` 计数只统计 `running / waiting_approval`，没有纳入“已启用定时任务”；与“活跃工作流”的用户认知不一致。
  - 复现：存在多个已启用定时任务但当前无运行中流程时，首页仍显示 `工作流 0`。
  - 处理：已改为按工作流 ID 去重，统计“运行中 + 已启用定时”的并集。

- `packages/web/src/pages/ChatPage.tsx`
  - 问题：切换 Agent 时原先会短暂沿用旧 `selectedSession` 请求新 Agent 的消息；同时 URL 上的 `?agent=` 变化后不会同步切换到对应 Agent，且会话请求存在竞态覆盖风险。
  - 复现：连续点击两个不同 Agent，或在已打开聊天页时从别处跳转到 `/chat?agent=...`。
  - 处理：已在切换 Agent 时清空旧会话状态，改用 `useSearchParams()` 响应 URL 变化，并为会话请求增加失效保护。

- `packages/web/src/lib/websocket.ts`
  - 问题：`onmessage` 里原先直接 `JSON.parse(event.data)`，收到畸形帧时缺少保护与降级。
  - 复现：让后端发送非 JSON 文本帧，或代理层插入损坏 payload。
  - 处理：已为消息解析增加 try/catch，坏帧现在只记警告，不影响后续分发。

### 中严重度（Empire / 3D）

- `packages/web/src/components/empire-office/office-view/officeTicker.ts`
  - 问题：普通 Agent 每帧都会被强制拉回工位基点，只剩粒子特效，没有任何基于 `empire_status` 的状态演出；状态从 `working` 切走后，旧的工作粒子还会残留，形成“状态没更新”的错觉。
  - 复现：让 Agent 在忙碌、审批、回归待命之间切换，观察工位中的小人始终只在原位站立；从忙碌切到待命后，头顶工作粒子会短暂残留。
  - 处理：已把 `empire_status` 透传到 ticker，给 `working / delegating / reviewing / approval / returning / break / idle` 增加轻量状态动画，并让旧工作粒子在离开忙碌态后自动衰减清理。

- `packages/web/src/components/empire-dashboard/EmpireOfficeBoard.tsx`
- `packages/web/src/components/empire-dashboard/OpsSections.tsx`
- `packages/web/src/pages/DashboardPage.tsx`
  - 问题：Empire / Agent 广场页面里的主场景、下方卡片列表、外围卡片高度边界不清晰，数据一多时容易出现内容超出但内部没有独立滚动的问题。
  - 复现：工作室或 Agent 数量较多时，主场景下方卡片会把外层面板继续撑高，页面观感不稳定。
  - 处理：已把主场景容器改为 `flex + min-h-0` 结构，并给下方卡片区补独立纵向滚动。

### 低严重度

- `package.json`
- `pnpm-workspace.yaml`
- `scripts/install-openclaw-plugin.mjs`
- `scripts/install_openclaw_plugin.ps1`
  - 说明：插件迁回后安装链路已建立，但仍需后续补一次真实安装到 `~/.openclaw/extensions` 的端到端验收。

- `packages/web/src/components/empire-office/office-view/officeTicker.ts`
  - 说明：当前仍然不是“真实寻路”。现阶段是工位内的状态驱动演出：CEO 漫游、delivery 行走、会议隐藏、普通 Agent 的轻量状态动画。真正的局部路径移动/避障仍属于后续增强项。

- `package.json`
  - 说明：前端构建已通过，但仍存在 chunk 体积过大警告；这属于性能与拆包优化项，不阻断当前功能修复。

## 修复记录

### 已完成

- 将插件源码主位恢复到 `extensions/openclaw-orchestrator`
- 新增 `pnpm plugin:install` 与安装脚本，支持复制到 `~/.openclaw/extensions/openclaw-orchestrator`
- 修复插件桥接层损坏编码与异常字符串，恢复为可维护文本
- 修复 `EmpireMonitorPage` 的 JSX 结构风险，并通过前端构建验证
- 修复 `WorkflowEditorPage` / `TeamWorkflowEditor` 的定时拨动开关位置逻辑
- 修复 Agent 广场 / 帝国页的场景与房间列表耦合布局，改为场景固定、列表独立滚动
- 修复首页工作流统计口径，使其包含“运行中 + 已启用定时”
- 收敛 `useWebSocket()` 到应用根单一挂载点，消除重复订阅与重复轮询
- 修复聊天页切换 Agent 时的旧会话串读问题，让 `?agent=` 跳转可实时同步，并避免旧请求覆盖新状态
- 为 WebSocket 客户端补坏帧容错，单条异常消息不再影响后续分发

### 待处理

- 继续排查工作流/监控/Empire/聊天的边缘情况
- 完善 3D 小人运动逻辑，补真实局部移动/避障观感
- 做一次端到端手测：工作流、定时、聊天、Empire 面板、插件安装
