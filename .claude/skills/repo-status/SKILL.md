---
name: repo-status
description: "查看 git status、当前分支、最近提交（只读）。"
---

## Purpose

快速了解工作区与分支状态，**不**修改仓库。

## Scope / Boundary

- **仅**只读 Git 命令。
- **不**暂存、提交、推送。

## Execution Checklist

1. `git status`
2. `git branch`（或带当前分支标记的等价命令）
3. `git log --oneline -5`

## Pass / Block Criteria

| 结果 | 条件 |
|------|------|
| **完成** | 三条命令均执行并汇总输出给用户 |

## References

- [Skill 统一模板](../../../docs/guides/skill-shared-skill-template.md)
- 路由入口：[`repo-router`](../repo-router/SKILL.md)
