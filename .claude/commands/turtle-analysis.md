---
description: 全流程研究编排（turtle-strict 严格前置校验 + Phase3 估值与报告）
argument-hint: [--code] [--mode standard|turtle-strict] [--pdf|--report-url]
---

在 **monorepo 根目录**执行。

## 映射 CLI（严格模式）

```bash
pnpm run workflow:run -- \
  --code <必填> \
  --mode turtle-strict \
  [--year 2024] \
  [--pdf "./path/to/annual.pdf"] \
  [--report-url "https://..."] \
  [--output-dir "./output/workflow/<code>"] \
  [--phase1b-channel http|mcp]
```

## 标准模式（兼容旧行为）

```bash
pnpm run workflow:run -- --code 600887 --year 2024
```

无 PDF 时 Phase3 仍可能运行（`data_pack_report` 为空输入），与 strict 不同。

## turtle-strict 行为

- 启动前：**必须** `--pdf` 或 `--report-url`。
- 管线结束后：必须已成功生成 `data_pack_report.md`，否则 fail-fast 并提示检查 PDF/下载/2A/2B。

## 产物

- `valuation_computed.json`
- `analysis_report.md` / `analysis_report.html`
- `workflow_manifest.json`
- 以及 Phase1A/1B/2A/2B 中间产物（同 `workflow:run` 文档）。

## 相关 skill

执行顺序与检查清单见 `.claude/skills/turtle-strict/SKILL.md`。
