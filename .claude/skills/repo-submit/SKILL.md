---
name: repo-submit
description: "Use when user asks to commit current changes in this repository."
---

# repo-submit

提交当前工作目录的更改。

## Instructions

1. 运行 `git status` 查看未暂存的更改
2. 运行 `git diff` 查看具体的更改内容
3. 分析更改内容，使用中文生成合适的 commit message
4. 使用 `git add` 暂存相关文件
5. 使用 `git commit` 提交，遵循 conventional commits（类型英文、描述中文）
6. 运行 `git status` 确认提交成功

## Notes

- commit message 使用中文
- 只提交与当前任务相关的文件，避免提交无关更改
- 永远不要执行破坏性操作如 `git push --force`
