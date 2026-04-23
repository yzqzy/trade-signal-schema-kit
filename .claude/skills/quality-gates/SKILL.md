---
name: quality-gates
description: "质量门禁：conformance → contract → regression → phase3-golden；test:linkage 烟测；regression/golden 支持 cn_a、hk、all。"
---

## Purpose

在变更后按固定顺序跑质量门禁，避免回归漂移；**不**替代业务编排或终稿收口。

## Scope / Boundary

- **仅**脚本化校验（`pnpm run quality:*`、`test:linkage`）。
- **不**修改产物、不写回终稿、不执行 `git commit`。

## Execution Checklist

1. `pnpm run quality:all`（或按仓库文档拆分步骤）。
2. `pnpm run test:linkage`（链路结构烟测）。
3. 按需：`pnpm --filter @trade-signal/research-strategies run quality:regression -- --suite hk|cn_a|all`。
4. 按需：`pnpm --filter @trade-signal/research-strategies run quality:phase3-golden -- --suite cn_a`。

## Pass / Block Criteria

| 结果 | 条件 |
|------|------|
| **通过** | 上述命令均以 0 退出 |
| **阻断** | 任一门禁失败；更新 golden 后须同步 `golden_manifest` 与基线并复跑 |

## References

- [Skill 统一模板](../../../docs/guides/skill-shared-skill-template.md)
- 根目录 `package.json`：`quality:all`、`test:linkage`；`@trade-signal/research-strategies`：`quality:regression`、`quality:phase3-golden`
- **顺序（与 `quality:all` 一致）**：conformance → contract → regression → phase3-golden
- **套件路径**：`cn_a` → `output/phase3_golden/cn_a/`；`hk` → `output/phase3_golden/hk/`；`all` → 两者依次
- 更新 golden 后：同步 `run/golden_manifest.json` 与基线文件，再跑 `pnpm run quality:all`
