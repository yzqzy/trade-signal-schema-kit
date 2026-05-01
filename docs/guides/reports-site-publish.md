# 研报中心发布（entries / views 协议 v2）

[返回 workflows](./workflows.md) · [文档索引](../README.md)

## 破坏性变更（v2）

- 协议版本 **`index.json` → `version: "2.0"`**。
- 每条目正文固定为 **`entries/<entryId>/content.md`**，与 **`meta.json`** 同目录。
- **`index.html` 已废弃**：旧数据不会自动迁移，请在 monorepo 根对每次 run **重跑** `reports-site:emit` 并 **`sync:reports-to-app`**。
- Phase3 / workflow 不再产出 **`analysis_report.html`**；主消费形态为 **Markdown**（`analysis_report.md`）与研报站的 **`content.md`**。

## 职责边界

| 组件 | 职责 |
|------|------|
| `trade-signal-research-kit`（`@trade-signal/research-runtime`） | 从单次 `workflow` / `business-analysis` run 归一化生成 `output/site/reports/**` |
| `apps/research-hub`（`@trade-signal/research-hub`） | 消费 `public/reports/**`，静态导出 `/reports` 列表与详情（详情页 **仅 Markdown 渲染**） |

## 目录协议（`site/reports`）

- `index.json`：`version`（`"2.0"`）、`generatedAt`、`entryCount`、`timelineHref`
- `views/timeline.json`：时间流列表项（`entryId`、`displayTitle`、`topicType`、`code`、`publishedAt`、`href`、`requiredFieldsStatus`、`confidenceState`）
- `views/by-topic/<topicType>.json`、`views/by-code/<code>.json`：分类视图
- `entries/<entryId>/meta.json`、`entries/<entryId>/content.md`：详情元数据 + **Markdown 正文**

`entryId`：`<date>-<code>-<topicSlug>-<runIdShort>`（去重键：`date + code + topicType`，timeline 保留最新 `publishedAt`）。

`meta.json` 中 **`contentFile`** 固定为 **`content.md`**（与协议类型一致）。

## 常用命令

在 **本 monorepo 仓库根**（`trade-signal-research-kit` / 本地目录名可不同）：

```bash
# 从已有 run 目录聚合写入 output/site/reports（并重建 views/index）
pnpm run reports-site:emit -- --run-dir output/workflow/600941/<runId>

# 仅重建索引（entries 已存在）
pnpm --filter @trade-signal/research-runtime run run:reports-site-emit -- --reindex-only

# 同步到本仓库 apps/research-hub/public/reports（默认）
pnpm run sync:reports-to-app

# 仍同步到兄弟仓库 trade-signal-docs（可选，需目录存在）
pnpm run sync:reports-to-docs

# 自定义目标目录
pnpm --filter @trade-signal/research-runtime run run:reports-site-sync -- \
  --target-dir /path/to/any/public/reports
```

根脚本 `reports-site:emit` / `sync:reports-to-app` 只会构建 `@trade-signal/research-runtime` 后执行发布 CLI，不会触发 `apps/research-hub` 的 Next build；如需完整站点构建，另行执行 `pnpm run app:build`。同一工作区内避免并发执行多个会写入 `.next` 的站点构建命令。

`workflow:run` / `business-analysis:run` 可选 **`--reports-site-dir output/site/reports`**：跑完后追加写入同一聚合目录。

## 架构 V2：`topic_manifest.json` / `publish_only`

- 每次 `reports-site:emit` 在 **run 根目录** 写入 **`topic_manifest.json`**（`manifestVersion: "1.0"`），列出本次写入站点的专题：`v2TopicId`、`siteTopicType`、`entryId`、`sourceMarkdownRelative` 等，供外部工具与 **manifest 驱动发布** 对齐（见 [v2-plugin-model](../architecture/v2-plugin-model.md)）。
- 发布索引按 **同一自然日 + 股票代码 + Topic** 去重，优先级为 `complete > degraded > missing`，同优先级取更新发布时间；被替换的 entry 目录会从 `entries/` 移除，避免静态导出继续暴露旧降级页。
- workflow run 不再把降级的 `business_quality.md` 发布为完整商业质量页；只有 business-analysis run 的 `finalNarrativeStatus=complete` 才会发布 `topic:business-six-dimension` 正文。
- **仅再发布**：若目录下 **没有** `workflow_manifest.json` / `business_analysis_manifest.json`，但存在合法的 **`topic_manifest.json`**，则 emit 走 **`emitFromTopicManifestOnly`**，按清单中的 `sourceMarkdownRelative` 读取 Markdown 并重写 `entries`（`runProfile: publish_only` 场景）。

## 选股（Selection）侧产物

- `pnpm run screener:run`（包内 `run:screener`）在输出目录额外写入 **`selection_manifest.json`**（V2 `selection_fast` 简化视图，含候选列表与可选 `drillDownTopicIds`）。**不**经 `reports-site:emit` 进入个股专题站，除非后续显式接管线。

## GitHub Pages（本仓库 · Tag 发布）

本仓库提供 GitHub Actions：推送 **`v*`** 标签后构建 `apps/research-hub` 静态导出并部署到 **GitHub Pages**（与 `trade-signal-docs` 的 `deploy.yml` 模式一致：`upload-pages-artifact` + `deploy-pages`）。

- 工作流：[`.github/workflows/pages-deploy.yml`](../../.github/workflows/pages-deploy.yml)
- 触发：`push` **`tags: ['v*']`**；另支持 **`workflow_dispatch`**（可选输入 `run_dir`：在构建前对指定 run 执行 `reports-site:emit` + `reports-site:sync` 写入 `apps/research-hub/public/reports`）。
- 仓库设置：**Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**（首次需同意 Pages 权限）。
- **项目页**（`https://<user>.github.io/<repo>/`）：CI 会设置 `NEXT_BASE_PATH=/<repo名>`，与 Next `basePath` / `assetPrefix` 对齐；站点入口为 **`/<repo>/reports/`**。
- 本地模拟子路径构建：

```bash
NEXT_BASE_PATH=/你的仓库名 pnpm --filter @trade-signal/research-hub run build
# 产物：apps/research-hub/out
```

## GitHub Pages（仅站点子树 · 通用说明）

1. 在 CI 或本地生成并同步：`reports-site:emit` → `sync:reports-to-app`，再 `pnpm --filter @trade-signal/research-hub run build`（或直接部署 `output/site/reports` 子树）。
2. 静态托管可将 **`research-hub/out/`** 作为站点根，入口 **`/reports/`**；若单独发布 `site/reports`，按托管商配置子路径。兄弟仓库 **`trade-signal-docs`** 已有独立 Next 站点与 Pages 工作流，本仓研报子站与之解耦，仅文档上可对齐发布习惯。

## 与历史 HTML 产出的关系

此前独立的 **Markdown → HTML** CLI 与 **`analysis_report.html`** 链路已移除。定性/龟龟报告请以 **`content.md` / `analysis_report.md`** 为准；如需离线阅读可复制 Markdown 或用通用 MD 预览工具。
