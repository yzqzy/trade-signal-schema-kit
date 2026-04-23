---
name: repo-submit
description: "在用户确认后，暂存并提交当前相关更改（conventional commits + 中文 message）。"
---

## Purpose

在明确授权下完成一次 **git commit**，避免误提交无关文件。

## Scope / Boundary

- **仅**本地 `git add` + `git commit`；不 `push --force` 等破坏性操作。
- **必须先**取得用户确认（未经允许不得执行 commit）。

## Execution Checklist

1. `git status` 查看未暂存更改。
2. `git diff` 查看具体差异。
3. 用中文生成合适 **conventional commits** 风格 message（feat/fix/docs/…）。
4. `git add` 仅相关文件。
5. `git commit -m "<message>"`；可选：若可读取 `git config user.email`，附加 `Co-Authored-By` 行。
6. `git status` 确认提交成功。

## Pass / Block Criteria

| 结果 | 条件 |
|------|------|
| **完成** | 用户已确认且 commit 成功 |
| **阻断** | 用户未确认 / 无有效改动 / 含无关文件且用户不同意暂存 |

## References

- [Skill 统一模板](../../../docs/guides/skill-shared-skill-template.md)
- 路由入口：[`repo-router`](../repo-router/SKILL.md)

## Notes

- message 简洁、中文为主；只提交与当前任务相关的文件。
- 永不执行 `git push --force`。
