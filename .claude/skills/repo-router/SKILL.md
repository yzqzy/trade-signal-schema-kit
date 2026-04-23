---
name: repo-router
description: "Git 状态 / 提交等仓库操作：路由到 repo-status 与 repo-submit。"
---

## Purpose

承接「看状态」vs「做提交」类需求，避免与研究工作流 skill 混淆。

## Scope / Boundary

- **仅** Git 只读或经确认的提交（由子 skill 执行）。
- **不**跑 workflow、business-analysis、质量门禁（除非用户显式要求顺序组合）。

## Execution Checklist

1. 判断意图：状态 / 分支 / log → **`repo-status`**；提交 → **`repo-submit`**。
2. 仓库操作与代码改动并行时：**先**完成改动与测试，**再** `repo-submit`。

## Pass / Block Criteria

| 场景 | 动作 |
|------|------|
| 仅查询 | 使用 `repo-status`，无需确认 |
| 提交 | 使用 `repo-submit`；须遵守其子 skill 的用户确认规则 |

## References

- [Skill 统一模板](../../../docs/guides/skill-shared-skill-template.md)
- 子 skill：[`repo-status`](../repo-status/SKILL.md)（只读状态）、[`repo-submit`](../repo-submit/SKILL.md)（需用户确认后提交）
