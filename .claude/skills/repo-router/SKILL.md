---
name: repo-router
description: "Use when user asks for git 状态检查、提交当前更改、查看最近提交等仓库操作。路由到 repo-status 与 repo-submit。"
---

# repo-router（仓库操作路由）

本技能用于承接仓库操作类需求（Git 状态、提交），与视频生产能力解耦。

## 子技能表

| 子技能 | 说明 | 触发场景 |
|--------|------|----------|
| repo-status | 查看当前仓库状态 | git status、当前分支、最近提交 |
| repo-submit | 提交当前工作目录更改 | 提交代码、生成 commit message、只提交相关文件 |

## 路由规则

1. 看当前仓库状态 / 当前分支 / 最近 commit → 使用 `repo-status`。
2. 提交当前改动 / 帮我 commit → 使用 `repo-submit`。
3. 仓库操作与内容制作并行时，先完成内容改动，再执行 `repo-submit`。
