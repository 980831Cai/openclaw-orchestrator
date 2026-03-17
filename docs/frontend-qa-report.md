## 前端质量测试报告（2026-03-17）

### 测试范围
- 主导航与一层页面：`/`、`/agents`、`/teams`、`/workflows`、`/monitor`、`/chat`
- 核心闭环：Dashboard 跳转、TeamDetail Tab、Workflow 入口、Monitor CTA、Chat 发送链路
- 专项审计：虚假按钮/伪可编辑控件/可见可点但无持久化

### 测试环境
- 前端：`pnpm dev`（Vite `http://127.0.0.1:5173`）
- 后端：FastAPI（`http://127.0.0.1:3721`）
- 自动化工具：`playwright-cli` + `agent-browser`
- 说明：本报告仅保留可复现结论；本地截图与控制台采样不随仓库存储

### 通过项（关键闭环）
- Dashboard 两个“查看全部”入口均可跳转（团队/Agent）
- TeamDetail “办公室实景”Tab 可进入并加载
- Workflow 页面可打开并触发“新建”入口
- Monitor 主 CTA “打开通信频道”可跳转到 Chat
- Chat `?agent=` 与 `/chat/:agentId` 路由在实测中均可选中目标 Agent
- Chat 发送链路可触发并出现消息回显（包含 optimistic message）

### 缺陷清单（按优先级）

#### P1 - 排班“时段编辑”看起来可改，但保存后不落库
- **页面/模块**：TeamDetail -> `ScheduleEditor`
- **复现步骤**：
  1. 打开团队详情，进入“排班表”
  2. 切换到“时段”模式
  3. 将首个时间输入改为 `07:30`
  4. 点击“保存排班”
  5. 请求 `GET /api/teams/{teamId}` 查看 `schedule.entries`
- **期望**：保存后存在 `startTime: "07:30"`（或对应时段字段）
- **实际**：`schedule.type` 变为 `time-based`，但 entries 仅保留 `agentId/order`，无 `startTime/endTime`
- **影响**：排班配置 UI 与后端状态不一致，属于典型“伪可编辑”
- **疑似根因**：`ScheduleEditor.tsx` 中 time/custom 输入使用 `defaultValue`，无 `onChange` 回写到 `entries`
- **证据**：保存后回读团队详情，`entries` 未出现 `startTime/endTime`，且比对结论为 `after_has_0730=False`

#### P1 - 成员角色下拉可切换，但未持久化
- **页面/模块**：TeamDetail -> `MemberManager`
- **复现步骤**：
  1. 打开团队详情“成员管理”
  2. 将成员角色从“成员”切到“审核者”
  3. 请求 `GET /api/teams/{teamId}` 对比 members.role
- **期望**：角色更新并持久化
- **实际**：前后 role 完全不变
- **影响**：权限/职责配置无效，误导用户认为已生效
- **疑似根因**：`Select` 只有 `defaultValue`，缺少 `onValueChange` 与更新 API 调用
- **证据**：切换前后回读 `members.role` 未变化，接口对比结果为 `changed=False`

#### P2 - 办公室场景存在伪交互文案与视觉暗示
- **页面/模块**：TeamDetail -> 办公室实景（scene）
- **现象**：
  - 会议桌文案“点击编辑 →”可见，点击后无可观察状态变化
  - `MeetingTable`、`BookShelf`、`ScheduleCalendar` 组件有 `cursor-pointer`/强 hover，但未绑定业务 handler
- **影响**：用户被误导为可操作入口，实际无功能闭环
- **证据**：
  - `agent-browser` 全量快照包含文案（如“点击编辑 →”）
  - 交互快照中无对应可交互 ref
  - 点击“点击编辑”前后 URL 不变

#### P3 - 可访问性警告（非阻断）
- **现象**：控制台出现 `DialogContent` 缺失 `Description` 警告
- **影响**：A11y 不完整，影响无障碍质量与规范一致性
- **证据**：本地验证过程中出现 `DialogContent` 缺失 `Description` 的控制台警告

### 其它观测
- 本轮网络日志中主链路接口基本为 `200`，未见前端致命报错
- 清理测试数据时发现 `DELETE /api/teams/{id}` 返回 `500`（服务端稳定性问题，非前端交互问题）

### 修复建议（按优先级）
1. **先修 P1**：
   - `ScheduleEditor`：为 time/custom 输入补 `onChange`，并写回 `entries`
   - `MemberManager`：补 `onValueChange`，联动 `PUT /teams/{teamId}/members/...`（或统一 update endpoint）
2. **再修 P2**：
   - 对 scene 装饰元素二选一：
     - 要么去掉 `cursor-pointer`/“点击编辑”文案
     - 要么补真实入口（跳转/弹窗/编辑面板）
3. **补充回归自动化**：
   - 将“可编辑 -> 保存 -> API回读校验”沉淀为回归脚本，防止 UI 假生效复发

### 附注
- 本地验证过程中曾生成截图与控制台采样，但本仓库不纳入 `.playwright-cli` 运行产物。
- 如需补充证据，建议在后续 MR 中单独上传或转存到正式文档附件位置。
