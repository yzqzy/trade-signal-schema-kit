# Claude Skill 统一结构（共享模板）

本仓库 `.claude/skills/*/SKILL.md` 建议统一为以下 **5 段**，便于维护与路由：

1. **Purpose**：1～2 行说明本 skill 解决什么问题。
2. **Scope / Boundary**：做什么、**不**做什么；与相邻入口（如 workflow vs business-analysis）的边界一句话写清。
3. **Execution Checklist**：按顺序的可执行步骤（编号列表），避免长叙事。
4. **Pass / Block Criteria**：通过条件与阻断条件（可表格或短列表）；复杂细则链接到 `docs/guides/skill-shared-*.md`。
5. **References**：仅保留链接（契约、CLI、共享规范），**不在 skill 内重复**大段规则正文。

## 共享规范索引

| 文档 | 用途 |
|------|------|
| [skill-shared-final-narrative-criteria.md](./skill-shared-final-narrative-criteria.md) | 六维终稿呈现、硬约束、阻断模板、输出标准 |
| [skill-shared-pdf-gate-semantics.md](./skill-shared-pdf-gate-semantics.md) | `data_pack_report` / `gateVerdict` 与终稿完成态关系 |
| [entrypoint-narrative-contract.md](./entrypoint-narrative-contract.md) | 入口矩阵与 CLI vs Claude 语义 |
| [report-polish-narrative-contract.md](./report-polish-narrative-contract.md) | workflow report-polish 证据边界 |
