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

```
User Input (stock code + annual report PDF)
         │
    ┌────▼────┐ Phase 0: Annual report fetch & cache
    └────┬────┘
         │
    ┌────▼──────────┐ Phase 1A: Structured data collection (HTTP/MCP)
    │ Phase 2A: PDF preprocessing (chapter locating/slicing)
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
   output/{code}_analysis_report.md + .html
```

## Environment Requirements

- Node.js >= 20
- pnpm >= 10