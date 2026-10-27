# dsh-session

DeepSeek Harness 的自写会话管理插件：会话目录、搜索、标记、回收站、工作区移动、
Agent 预设迁移、批量操作与 Markdown 导出。

## 功能

### 会话目录

- 合并 `sessionPersistence.list()` 与磁盘孤儿目录，已落盘、未落盘的会话都能看到。
- 列表只解压头帧；标题、预览、最近预设按 persistence revision 缓存，刷新不再反复
  解压整份历史。
- 支持按标题 / ID / 路径 / 标签 / 备注搜索；收藏与待回看是两个独立筛选，可与
  工作区、归档状态、优先级、标签组合；按更新 / 创建 / 名称 / 优先级 / 体积排序。
- 会话行显示预设名称：优先用 preset roster 的 `name`，内置 `standard` /`minimal`
  显示为「标准」/「精简」，没有中文名的预设保留原名。
- 子会话折叠在父会话下，父会话行显示「子会话 N」计数；空白会话默认隐藏，可手动显示。
- 管理页底部统计拆分显示：会话（主/子）、空会话、运行中、已打开、已归档、
  回收站（主/子）、工作区、标记、数据量。
- 支持置顶 / 取消置顶：置顶会话排在列表最前，并显示「置顶」标记。
- 支持会话重命名；顶部快捷区保留置顶、重命名、收藏、待回看、标签、优先级、
  归档、导出、复制与删除，完整操作（移动、迁移预设）在会话管理页。
- 顶部置顶状态与原生侧栏双向同步；已打开的会话移动工作区时会先停止并关闭。

### 标记

- 收藏、待回看、优先级 1–5、标签（最多 20 个，每个 ≤ 32 字符）、备注（≤ 2000 字符）。
- 顶部「更多操作」收纳移动工作区与迁移预设；批量移动/迁移预设逐个执行并显示进度。
- 会话管理记住上次标签页、筛选、排序和每个标签页的滚动位置；顶部「重置筛选」可恢复默认。
- 顶部「更多操作」可复制当前会话工作目录；维护弹窗可复制插件数据目录。
- 批量标签支持追加 / 替换 / 清空三种模式；批量删除先列预览，再逐个执行并显示进度。
- 批量操作支持置顶 / 取消置顶；回收站批量恢复/彻底删除也先预览，再逐个执行并显示进度。
- 长会话列表使用 `content-visibility` 按行延迟渲染，减少滚动时的布局/绘制开销。
- 批量标记、归档、删除的结果弹窗对失败项提供「重试失败」，只重试可重试的 ID。
- 设置页和会话管理顶部「维护」入口都支持导出/覆盖导入标记、清理列表缓存。
- 标记写在 `~/.dsh/dsh-plugins/dsh-session/annotations.json`，带 `revision` 与 `updatedAt`；
  多窗口保存冲突时提示“载入最新内容”。
- 原子发布 + 进程内串行 + 跨进程 advisory lock；损坏文件拒绝覆盖。
- 同源客户端通过 `BroadcastChannel` 同步。
- AI 整理（手动、可选）：标签 / 备注窗口可复制结构化 Prompt，或粘贴模型返回的 JSON
  导入 tags / note / priority；不会自动调用模型。

### 回收站

- 删除移动整个会话目录到 `~/.dsh/dsh-plugins/dsh-session/trash/<id>/payload`，并写 `meta.json`。
- 回收站按工作区折叠，子会话折叠在父会话下；支持工作区筛选、全选当前、恢复、
  彻底删除、批量恢复 / 批量彻底删除、清空回收站、清理空会话。
- 删除主会话可级联子会话；恢复主会话时会一并恢复回收站中随它移动的子会话，并保留原始项目目录。
- 子会话不能单独操作：不显示复选框与「彻底删除」，操作区显示「随主会话恢复和删除」提示；
  父会话恢复和彻底删除都会级联处理子会话。
- 删除活会话前先 flush、取消 agent、detach session store，再移动文件。
- 删除 / 恢复后向 Host 推送 `session/disposed` 与 `api-session/removed|added`，原生侧栏
  无需整页刷新即可同步。

### 工作区管理

- 工作区页展示名称、路径、会话数与目录状态；支持上移/下移排序、新建、重命名和移除工作区。
- 新建时优先复用 DSH 官方 `sidebar.workspaces.directoryFlow` 目录选择器；不可用时回退
  到内置列表（含上一级、返回、主目录、新建文件夹、显示隐藏文件）。
- 移除注册默认保留目录与会话日志；可勾选「同时把会话移到回收站」，再清空回收站
  回收磁盘空间。

### 工作区移动

- 按 DSH 的 `projectKey(cwd)` 重新定位会话目录，重写会话头 `cwd`，保留工件代际
  文件名与事件内容。
- 移动后同步工作区归属；已打开的会话需先切换，避免 live writer 与内存头不一致。
- 移动失败时回滚目录，不留下半移动状态。

### Agent 预设迁移

- 冷会话：重写最后一条 `agent-preset/selected`；没有该事件时改写头里的
  `agentPreset`。
- 活会话：追加一条 `agent-preset/selected` 并 `sessions.flush()`，可选
  `agentPresets.recompose()`。
- 只允许切换到当前 roster 中未损坏的预设。

### 导出

- 单会话 Markdown，包含标题、工作区、创建 / 更新时间、预设、标记、用户 / 助手文本、
  工具调用与工具结果摘要。
- 批量导出 ZIP（内置无压缩 ZIP writer，保留 UTF-8 文件名）。

### UI 与主题

- 侧栏底部“会话管理”入口，`shell.overlay` 全屏管理窗口。
- 会话头部动作：归档、收藏、待回看、标签 / 备注、复制 Session ID、删除。
- 设置 → 内置插件 → “会话管理”页：版本、路径、会话 / 回收站 / 标记 / 数据量统计。
- 所有颜色走 DSH 主题 token（`--dsw-alias-*`），跟随浅色、深色与第三方主题。
- 弹窗支持 ESC 与点击遮罩关闭；批量操作逐条展示成功 / 失败 / 跳过。

## 安装

```sh
dsh plugin --profile web add link:/path/to/dsh-session
```

或把本仓库加入 profile 的 bundle 列表。安装后刷新 Web 页面；客户端 bundle 由
`client-hmr` 监听，宿主改动需要重载插件或重启 `dsh web`。

## 数据布局

```
~/.dsh/
  sessions/                              # DSH 自己的会话日志（不搬移）
    <projectKey(cwd)>/<encodeSegment(id)>/session.vN.jsonl.zstd
  dsh-plugins/
    dsh-session/
      annotations.json                   # 标记，0600
      metadata-cache.json                # 标题/预览/预设缓存
      trash/<id>/
        payload/                         # 原始会话目录
        meta.json                        # origin / header / 时间 / 工作区
```

旧版 `~/.dsh/session-hub/`、`~/.dsh/session-trash/` 和 `~/.dsh/session-annotations.json`
会在启动时迁移到 `~/.dsh/dsh-plugins/dsh-session/`。

## API

所有路由挂在 `/api/session-hub`，同源且通过 DSH `connection.admit()` 认证
（owner 权限；不可用时 fail closed）。

```
GET  /list
GET  /trash
GET  /annotations
POST /annotations                { id, patch, expectedRevision? }
POST /batch-annotations          { ids, patch, expectedRevisions? }
POST /annotations-import         { sessions }   # 覆盖导入全部标记
POST /cache-clear                # 清理标题/预览元数据缓存
POST /move-to-trash              { id, includeChildren? }
POST /batch-trash                { ids }
POST /restore                    { id }
POST /batch-restore              { ids }
POST /purge                      { id }
POST /batch-purge                { ids }
POST /empty-trash
POST /cleanup-empty
GET  /workspaces
POST /move                       { id, workspaceId, includeChildren? }
POST /batch-move                 { ids, workspaceId, includeChildren? }
POST /archive                    { id, archived }
POST /batch-archive              { ids, archived }
GET  /presets
POST /preset-migrate             { id, toPreset }
POST /batch-preset               { ids, toPreset }
POST /workspace-create            { path, title? }
POST /workspace-rename            { workspaceId, title }
POST /workspace-remove            { workspaceId, trashSessions? }
GET  /stats
GET  /export?id=<id>
POST /export                     { id }
POST /export-zip                 { ids }
```

响应统一为 `{ ok: true, ... }`；错误为 `{ ok: false, error, code? }`。

## 安全与正确性

- **认证**：优先调用 DSH `connection.admit()`，要求 owner peer；无认证服务时仅允许
  loopback / 同源请求。
- **路径围栏**：会话 id 编码为单一路径段；移动 / 删除 / 恢复前校验目录必须恰好位于
  `<sessions>/<project>/<session>`，拒绝符号链接、`..` 和错误段。
- **日志格式**：按 DSH 的 Zstandard 分帧规则解析，第一帧单独存放头行；拒绝截断帧和
  不完整尾行。
- **发布**：临时文件 + fsync + rename，失败时 backup 回滚；不会把成功解码的前缀当成
  完整日志发布。
- **活会话**：删除前 flush / cancel / detach；移动拒绝 live 会话；预设迁移走 live
  append 或冷重写。
- **标记文件**：损坏时拒绝写入，避免把部分状态覆盖到真实标记上。

## 已知限制

- 工作区移动要求目标工作区已在 DSH 注册；没有“新建工作区”入口。
- 标记只保存在本机 profile 的 `~/.dsh/dsh-plugins/dsh-session`，不随会话文件迁移。

## 开发

```sh
npm test          # node --test test/*.test.mjs
npm run check     # 语法检查 + 导入检查
```

测试覆盖：路径编码、Zstandard 多帧、原子发布、列表缓存、回收站往返、移动、预设迁移、
Markdown 导出、标记版本冲突与损坏拒绝、UI 主题 token / slot 静态检查。

## 兼容性

- DSH 0.2.x（`sessionPersistence`、`workspaceRegistry`、`connection`、`agentPresets`）。
- Node `^22.15.0 || >=24.0.0`（`node:zlib` 的 Zstandard 支持）。
