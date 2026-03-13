# Workflow Audit

## High

- **手动执行与待审批状态的“活跃执行”判断不一致，可能并发跑出多条同工作流执行**
  - 文件：`packages/web/src/pages/WorkflowEditorPage.tsx`、`packages/web/src/components/team/TeamWorkflowEditor.tsx`、`server/openclaw_orchestrator/services/workflow_engine.py`
  - 问题：后端 `has_active_execution()` 已把 `waiting_approval` 视为活跃执行，但手动执行接口没有复用这条约束；前端“执行 / 停止”按钮也只把 `running` 当作活跃态，导致审批挂起时仍可再次点击执行，且无法直接停止。
  - 复现条件：启动一个包含审批节点的工作流 -> 走到 `waiting_approval` -> 再次点击“执行”，会生成第二条同工作流执行；同时“停止”按钮是灰的。
  - 修复：后端 `execute_workflow()` 统一拦截 `running / waiting_approval` 的重复触发；两个编辑器入口统一以活跃态集合控制按钮与状态徽标，`waiting_approval` 显示为“待审批”。

- **定时开关问题的根因判断**
  - 文件：`packages/web/src/pages/WorkflowEditorPage.tsx`、`packages/web/src/components/team/TeamWorkflowEditor.tsx`
  - 判断：从当前源码看，`checked={schedule.enabled}` 与 `onCheckedChange={(checked) => setSchedule(...enabled: checked)}` 这条状态流是成立的，看不出明显的 React 状态错误；`translate-x-4` / `translate-x-0.5` 也是标准条件类写法，单看源码不像“状态没切回来”。
  - 更可能的根因：**同一套工作流编辑器存在两份实现**，而且用户可能看到的是另一条入口或旧构建产物；也就是更像“页面/构建漂移问题”，不是当前这段 `checked` 状态流本身。
  - 复现条件：只修其中一个编辑器、或前端服务仍在跑旧 bundle 时，用户会看到开关视觉状态与源码不一致。
  - 建议修法：抽出共享的 `ScheduleToggle + schedule form` 组件，两个入口共用；同时强制重建前端并核对实际被访问的是 `/workflows` 还是团队详情里的编辑器。

- **停止执行接口没有校验 workflowId 与 executionId 的归属关系**
  - 文件：`server/openclaw_orchestrator/routes/workflow_routes.py`
  - 问题：`POST /workflows/{workflow_id}/stop` 里实际只按 `executionId` 停止，没有确认这个执行记录是否属于 URL 里的 `workflow_id`。
  - 复现条件：传入任意 `workflow_id`，只要 `executionId` 存在，就可能停掉别的工作流执行。
  - 处理：此前已修复。后端会先查询 execution；不存在返回 `404`，归属不匹配返回 `400`。

## Medium

- **“无产物”判断把普通文本响应也当成了产物，导致成功/失败/无产物语义不一致**
  - 文件：`server/openclaw_orchestrator/services/workflow_engine.py`
  - 问题：任务节点会把普通文本响应包装成 `agent_response` 放进 `normalized_artifacts`；后续 `requireArtifacts` 校验与完成态 `totalArtifacts` 统计都直接拿整个列表，结果是“仅有文本回复”也会被判定为“有产物”。
  - 复现条件：任务节点仅返回文本、未生成任何文件/结构化产物；工作流最终仍会显示“产出 N 个产物”，定时静默通知抑制逻辑也不会命中“无产物”分支。
  - 修复：把 `agent_response` 与真正产物区分开；`requireArtifacts` 仅接受非 `agent_response` 项，完成态统计也只统计真实产物。

- **调度器计算 `nextRunAt` 时没有跳过窗口外的 Cron 命中，首页定时状态会误报**
  - 文件：`server/openclaw_orchestrator/services/workflow_scheduler.py`、`server/openclaw_orchestrator/routes/workflow_routes.py`、`packages/web/src/pages/DashboardPage.tsx`
  - 问题：原实现先算下一个 Cron，再在 tick 时临门一脚判断是否落在时间窗内；这会让 `nextRunAt` 停留在一个注定被跳过的时间点，首页只能退化展示 Cron，且窗口外会反复空跑推进。
  - 复现条件：配置 `*/5 * * * *` 并加 `09:00-18:00` 时间窗，晚上查看首页时，旧逻辑拿到的“下次执行”不是明早窗口内的首个时间点，而是最近一个窗口外命中或干脆没有可展示值。
  - 修复：调度器在计算与推进 `nextRunAt` 时直接跳过窗口外命中；路由层给工作流响应补齐 `schedule.nextRunAt`，首页在无可执行时间时明确提示。

- **工作流编辑器存在双实现，后续功能修复很容易只落一边**
  - 文件：`packages/web/src/pages/WorkflowEditorPage.tsx`、`packages/web/src/components/team/TeamWorkflowEditor.tsx`
  - 问题：节点编辑、定时执行、分支/汇合、删除逻辑都复制了两份，任何一侧修复都可能遗漏另一侧。
  - 复现条件：修复 `/workflows` 页面但团队详情页仍复现旧问题，或反过来。
  - 建议修法：抽出共享编辑器组件，只保留页面壳差异。

- **工作流执行轮询只在 `running / waiting_approval` 期间刷新，页面切换后缺少恢复机制**
  - 文件：`packages/web/src/pages/WorkflowEditorPage.tsx`、`packages/web/src/components/team/TeamWorkflowEditor.tsx`
  - 问题：执行状态依赖本地 `execution` 状态触发轮询；页面刷新或重新进入后，不会自动恢复到最近一次正在跑的 execution。
  - 复现条件：启动执行 -> 刷新页面或切走再回来 -> 页面丢失当前执行上下文。
  - 处理：已修复。两个入口现在都会在选中工作流后调用 `/workflows/{workflowId}/executions`，自动恢复最近一个 `running / waiting_approval` 的执行态；仍缺少“最近已结束执行”的持久展示，这是后续体验项。

## Low

- **新建空工作流允许保存，但直到启用/执行才报不可运行**
  - 文件：`server/openclaw_orchestrator/routes/workflow_routes.py`、`server/openclaw_orchestrator/services/workflow_engine.py`
  - 问题：这是有意设计，但对用户而言错误反馈滞后。
  - 复现条件：创建空 DAG 后立即保存不会报错，真正执行或启用定时才被拦截。
  - 建议修法：前端增加“草稿 / 可运行”显式状态提示。

- **定时主开关关闭后会保留 Cron/窗口配置，这更像“暂停”而非“清空”**
  - 文件：`packages/web/src/pages/WorkflowEditorPage.tsx`、`packages/web/src/components/team/TeamWorkflowEditor.tsx`
  - 判断：这不是状态同步 bug；当前实现是显式保留配置，重新开启时继续沿用。
  - 风险：如果文案没有讲清楚，用户会把“保留旧值”误解为“关闭没生效”。
  - 处理建议：当前先保留行为不改，后续可补一条更直白的提示文案，说明“关闭仅暂停，不清空配置”。
