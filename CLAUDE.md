# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`trade-signal-schema-kit` is a TypeScript analysis framework for A-share and Hong Kong stock research. It provides data collection → qualitative analysis → quantitative evaluation → valuation → report output capabilities.

## Common Commands

```bash
# Install dependencies
pnpm install

# Type check all packages
pnpm run typecheck

# Build all packages
pnpm run build

# Linkage smoke (after build) + quality gates
pnpm run test:linkage
pnpm run quality:all

# Work on specific package
pnpm --filter @trade-signal/schema-core run typecheck
pnpm --filter @trade-signal/provider-http run build

# research-strategies：根目录仍提供 workflow:run 等聚合命令；包内直跑请用 run:*（例：pnpm --filter @trade-signal/research-strategies run run:workflow）
# 产物目录 output v2：默认 `output/workflow/<code>/<runId>/`；`workflow:run` 可选 `--run-id` 固定子目录名（续跑以 checkpoint 为准）；business-analysis 默认 `output/business-analysis/<code>/<runId>/`（PDF 自动发现/下载与 workflow 共用 ensure-annual-pdf）；续跑必须 `--output-dir` 指向 run 根目录。详见 docs/guides/workflows.md
```

## Architecture

Three-layer structure:

```
research-strategies + reporting  ← Top: workflow orchestration
           │
       schema-core               ← Middle: standard fields & Provider contracts
           │
   ┌───────┴───────┐
provider-http   provider-mcp    ← Bottom: data adapters
           │
    trade-signal-feed            ← Data source
```

**Key design principles:**
- Research layer only consumes standard fields, not raw upstream fields
- Adapters handle data mapping, error translation, semantic alignment
- HTTP and MCP channels produce consistent output for same queries
- Strategy rules are swappable; data and report contracts remain stable

## Package Structure

| Package | Purpose |
|---------|---------|
| `schema-core` | Standard fields & MarketDataProvider contracts |
| `provider-http` | HTTP data adapter |
| `provider-mcp` | MCP data adapter |
| `research-strategies` | Strategy & research workflow orchestration |
| `reporting` | MD + HTML report output |

## Main Workflow (Phase 0-3)

Logical stages (Turtle-aligned). `workflow:run` executes **sequentially**: Phase 0 (optional) → Phase 1A → **when annual PDF is available: Phase 2A/2B before Phase 1B** → Phase 3. Phase 0 in that path only when `--report-url` is used (or auto-discovery in strict mode).

```
User Input (stock code [+ PDF or report URL])
         │
    ┌────▼────┐ Phase 0: Optional fetch/cache (CLI or workflow --report-url)
    └────┬────┘
         │
    ┌────▼──────────┐ Phase 1A: Structured data (MarketDataProvider; workflow uses HTTP)
    └────┬──────────┘
         │
    ┌────▼──────────┐ Phase 2A/2B (optional; runs before 1B when annual PDF path exists)
    └────┬──────────┘
         │
    ┌────▼────┐
    │ Phase 1B External info
    └────┬────┘
         │
    ┌────▼────────┐
    │ Phase 3     │
    │Qual+Quant+Valuation
    └────┬────────┘
         │
   <output-dir>/analysis_report.md + .html
```

## CLI & Claude entrypoints

| Goal | Root command | Claude slash |
|------|----------------|--------------|
| Business analysis (no Phase3 by default) | `pnpm run business-analysis:run -- ...` | `/business-analysis` |
| Full workflow, strict PDF branch | `pnpm run workflow:run -- --mode turtle-strict ...` | `/turtle-analysis` |
| Annual report download | `pnpm run phase0:download -- ...` | `/download-annual-report` |
| Valuation-only (JSON + summary md) | `pnpm run valuation:run -- ...` | `/valuation` |
| Markdown to HTML | `pnpm run report-to-html:run -- ...` | `/report-to-html` |

- Skills: `.claude/skills/business-analysis/SKILL.md`, `turtle-strict/SKILL.md`, `quality-gates/SKILL.md`.
- `workflow:run --mode standard` keeps legacy behavior (Phase3 may run without `data_pack_report.md`).
- Quality: `pnpm run quality:all` runs regression + golden for **cn_a** and **hk** (`output/phase3_golden/<suite>/`). HK suite is snapshot regression; full HK depth is not yet at A-share parity.

## Documentation

- **Index**: `docs/README.md`（`architecture` / `guides` / `strategy`）
- **Workflows & CLI (Stage)**: `docs/guides/workflows.md`

## Environment Requirements

- Node.js >= 20
- pnpm >= 10