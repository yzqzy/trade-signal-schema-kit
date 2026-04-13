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

Logical stages (Turtle-aligned). `workflow:run` executes **sequentially**: 1A → 1B → optional 2A/2B → 3. Phase 0 in that path only when `--report-url` is used.

```
User Input (stock code [+ PDF or report URL])
         │
    ┌────▼────┐ Phase 0: Optional fetch/cache (CLI or workflow --report-url)
    └────┬────┘
         │
    ┌────▼──────────┐ Phase 1A: Structured data (MarketDataProvider; workflow uses HTTP)
    │ Phase 2A: PDF preprocessing (optional branch)
    └────┬──────────┴──────────┐
         │                    │
    ┌────▼────┐            ┌──▼────┐
    │ Phase 1B│            │Phase 2B│
    │External │            │PDF fine│
    │info     │            │extraction│
    └────┬────┘            └────┬──┘
         └──────────┬───────────┘
                ┌───▼────────┐
                │ Phase 3   │
                │Qualitative+Quantitative+Valuation
                └────┬──────┘
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

## Environment Requirements

- Node.js >= 20
- pnpm >= 10