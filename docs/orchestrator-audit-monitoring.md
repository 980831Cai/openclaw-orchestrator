# Monitoring And Interaction Audit

## High

- **WebSocket hook 被挂载了两次，实时事件会重复消费**
  - 文件：`packages/web/src/App.tsx`、`packages/web/src/pages/DashboardPage.tsx`、`packages/web/src/hooks/use-websocket.ts`、`packages/web/src/lib/websocket.ts`
  - 问题：`useWebSocket()` 在 `App.tsx` 已全局挂载一次，`DashboardPage.tsx` 又再挂一次。结果是同一个页面会重复注册事件处理器、重复拉高 `subscriberCount`，带来重复消息、重复通知、重复状态更新，离开页面时还会触发一次额外断连计数。
  - 复现条件：停留首页时接收一条 `workflow_update` 或 `gateway_chat`，可能出现重复事件/重复消息入库；切出首页后连接计数与实际订阅数也会偏移。
  - 建议修法：只在应用根部挂载一次 `useWebSocket()`；页面内只消费 store，不再重复建立订阅。

- **聊天发送没有错误兜底，失败时会卡在发送中**
  - 文件：`packages/web/src/pages/ChatPage.tsx`
  - 问题：`handleSend` 没有 `try/finally`。如果接口报错，`setSending(false)` 不会执行，输入框和发送按钮会一直处于发送态。
  - 复现条件：断开后端或让 `/send` 返回错误后发送消息。
  - 建议修法：补 `try/catch/finally`，失败时 toast，且不要让 UI 卡死。

## Medium

- **活跃工作流与定时工作流是两套口径，首页语义不一致**
  - 文件：`packages/web/src/pages/DashboardPage.tsx`
  - 问题：`activeWorkflowSignals` 只认 `running / waiting_approval`，而定时工作流被放在另一块 `scheduledWorkflows`。如果产品定义“活跃”包含已启用定时但当前未运行，就会和用户认知冲突。
  - 复现条件：一个工作流已启用定时但当前未在跑，首页不会把它视作活跃执行，只会出现在下方另一块列表。
  - 建议修法：统一“活跃”的产品定义，或在卡片标题上区分“执行中”和“已启用定时”。

- **工作流运行信号 20 秒后自动清理，面板很快失忆**
  - 文件：`packages/web/src/hooks/use-websocket.ts`
  - 问题：`completed / failed / stopped` 的运行信号 20 秒后会被清掉，导致首页、监控页、帝国态势面板很快看不到刚结束的执行。
  - 复现条件：执行一个短工作流，结束后等待 20 秒，相关信号会自动消失。
  - 建议修法：改为“近期执行”与“当前活跃执行”分层存储，活跃信号及时清理，近期记录延长保留或改由后端历史接口驱动。

- **Gateway 连通状态有两套来源，容易出现 UI 打架**
  - 文件：`packages/web/src/hooks/use-websocket.ts`、`packages/web/src/pages/DashboardPage.tsx`、`packages/web/src/pages/EmpireMonitorPage.tsx`
  - 问题：一套来自 `/health` 轮询，一套来自 `gateway_status` WebSocket 事件。若两者更新时机不同，页面可能短时出现“实时通道已连接但 Gateway 离线”或反过来。
  - 复现条件：Gateway 重启、前后端重连、网络抖动时最明显。
  - 当前处理：已先收掉“实时通道断开但页面还保留旧 Gateway 在线态”的陈旧状态问题；`use-websocket` 现在在 WS 断开时会同步把 `gatewayConnected` 置为 `false`。但要彻底消除双源抖动，仍需要把 Gateway 健康汇总成单一真源。

- **聊天页只按 `wf-` 前缀过滤临时工作流会话，规则过脆**
  - 文件：`packages/web/src/pages/ChatPage.tsx`
  - 问题：原实现依赖 `session.id.startsWith('wf-')` 猜测临时会话，命名规则一变就会失效。
  - 复现条件：工作流侧创建的临时会话不以 `wf-` 命名。
  - 处理：已修复。前端不再猜命名规则，改为直接消费后端 `/agents/{id}/sessions` 的结果；临时会话过滤统一由后端 `chat_service.list_sessions()` 负责。

- **聊天页在主布局内再次使用 `h-screen`，会把头部一起顶出滚动容器**
  - 文件：`packages/web/src/pages/ChatPage.tsx`、`packages/web/src/components/layout/MainLayout.tsx`
  - 问题：`MainLayout` 已经给内容区做了 `h-screen` 限高，`ChatPage` 内层再套一层 `h-screen` 会形成双重视口高度，导致页面整体而不是消息区单独滚动，顶部信息区会跟着滑动。
  - 复现条件：进入聊天页并滚动消息区，尤其在侧边栏展开/收起或窗口高度较小时更明显。
  - 修复：已将聊天页根容器改为 `h-full min-h-0`，保持消息区内部滚动，头部和输入区固定。

## Low

- **单一主会话场景仍显示会话数，容易误导为存在多个对话**
  - 文件：`packages/web/src/pages/ChatPage.tsx`
  - 问题：每个 Agent 只有一个 `main` 会话时，顶部仍显示 `1 会话`，信息价值低，还会让用户误以为右上角有独立的会话管理入口。
  - 复现条件：选择仅有 `main` 会话的 Agent。
  - 修复：已改为单会话时显示 `主会话`，多会话时才显示数量。

- **首页工作流跳转依赖 query 参数，但缺少“定位成功”反馈**
  - 文件：`packages/web/src/pages/DashboardPage.tsx`、`packages/web/src/pages/WorkflowEditorPage.tsx`
  - 问题：虽然已经带 `workflowId` 跳转，但页面没有明显高亮反馈或滚动定位提示，用户会误以为只是跳到了列表页。
  - 复现条件：从首页点击某个工作流卡片跳转到编辑页。
  - 建议修法：进入后高亮目标工作流项，必要时 toast 或滚动到当前工作流。 
