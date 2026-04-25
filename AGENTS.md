# AGENTS.md

Guidance for **Codex** (Codex.ai/code) in this repo. **Rules live in `docs/guides/`**; this file is navigation + boundaries only.

## Project snapshot

`trade-signal-research-kit` is a TypeScript research stack for **A-share and HK** stocks: data collection, optional annual PDF extraction, external evidence, strategy/valuation (Phase3), and **Markdown-first** site publishing.

- **TS / CLI**: deterministic pipelines only; **no** in-repo Anthropic/OpenAI HTTP/SDK for “auto narrative.”
- **Two final-artifact paths** (do not conflate): see **Final output boundaries** below.

## Entrypoint matrix

| Goal | Slash | Root CLI | Key outputs |
|------|--------|----------|-------------|
| Full workflow (strict) | `/workflow-analysis` | `pnpm run workflow:run -- --mode turtle-strict ...` | `analysis_report.md`, `valuation_computed.json`, `workflow_manifest.json`, **report-polish** (`report_view_model.json`, four topic `.md`) |
| PDF-first qualitative | `/business-analysis` | `pnpm run business-analysis:run -- ...` | evidence-pack, `business_analysis_manifest.json`; CLI `qualitative_*` may be drafts until Codex finalizes |
| Valuation only | `/valuation` | `pnpm run valuation:run -- ...` | `valuation_computed.json`, `valuation_summary.md` |
| Annual PDF | `/download-annual-report` | `pnpm run phase0:download -- ...` | local PDF |
| Reports site | — | `pnpm run reports-site:emit -- --run-dir …` then `pnpm run sync:reports-to-app` | `output/site/reports/**` → `apps/research-hub/public/reports` |

Quick slash examples: `/workflow-analysis 600887` · `/business-analysis 600887` · `/valuation 600887`. Strategy is a **parameter**: `/workflow-analysis 600887 --strategy value_v1` (not a separate entry name).

## Final output boundaries

1. **`/workflow-analysis`** — **Publish-shaped** artifacts: **report-polish** maps to V2 **TopicReport** set (four Markdown pages + `report_view_model.json`), consumed by **`reports-site:emit`**. It does **not** replace **`topic:business-six-dimension`** Codex write-back.
2. **`/business-analysis`** — **`topic:business-six-dimension`** final narrative in Codex: `business-analysis-finalize` writes **`qualitative_report.md`** / **`qualitative_d1_d6.md`** per shared criteria (not the same as report-polish pages).
3. **`analysis_report.md`** — Phase3 **rule/audit** report; not the site layout “final page set.”

## Canonical contracts (read these, do not duplicate here)

- [v2-domain-contract.md](docs/architecture/v2-domain-contract.md) — **V2** five objects, run state, profiles, evidence refs  
- [v2-flow-topology.md](docs/architecture/v2-flow-topology.md) — **V2** single main flowchart (Feature / Policy / Topic / Selection / Publisher)  
- [v2-plugin-model.md](docs/architecture/v2-plugin-model.md) — **V2** plugin IDs and contracts  
- [entrypoint-narrative-contract.md](docs/guides/entrypoint-narrative-contract.md) — entry matrix, CLI vs Codex semantics  
- [report-polish-narrative-contract.md](docs/guides/report-polish-narrative-contract.md) — report-polish evidence boundaries  
- [skill-shared-final-narrative-criteria.md](docs/guides/skill-shared-final-narrative-criteria.md) — six-dimension final narrative hard rules  
- [skill-shared-pdf-gate-semantics.md](docs/guides/skill-shared-pdf-gate-semantics.md) — `data_pack_report` / `gateVerdict` vs completion state  
- [skill-shared-skill-template.md](docs/guides/skill-shared-skill-template.md) — `.Codex/skills` five-section template  
- [workflows.md](docs/guides/workflows.md) — Stage/Phase, output v2, resume  
- [reports-site-publish.md](docs/guides/reports-site-publish.md) — site protocol (`content.md` v2)

## Minimal commands

First-time setup: `pnpm install`.

```bash
pnpm run build
pnpm run test:linkage
pnpm run workflow:run -- --code <CODE> --mode turtle-strict [--pdf …] [--output-dir …]
pnpm run business-analysis:run -- --code <CODE> [--strict] [--output-dir …]
pnpm run reports-site:emit -- --run-dir ./output/workflow/<code>/<runId>
pnpm run sync:reports-to-app
```

More: `pnpm run typecheck`, `pnpm run quality:all`; filter runs e.g. `pnpm --filter @trade-signal/research-runtime run run:workflow` — see [workflows.md](docs/guides/workflows.md).

## Quality and safety notes

- **`workflow:run --mode standard`**: legacy path; Phase3 may run **without** `data_pack_report.md`. **`turtle-strict`** requires the annual report pack when applicable — see `workflows.md`.
- **`quality:all`**: regression + golden **cn_a** and **hk**; HK is snapshot depth; parity with cn_a is not claimed.

## Package layout (short)

| Package | Role |
|---------|------|
| `schema-core` | Contracts & standard fields |
| `provider-http` | Primary data adapter (**HTTP-only** default per V2 docs) |
| `research-contracts` | V2 domain types & manifest schemas |
| `research-feature` | Feature layer: registry, HTTP channel helpers |
| `research-policy` | Policy layer: IDs & registry |
| `research-topic` | Topic layer: IDs & registry |
| `research-selection` | Selection layer: registry & selection manifest builder |
| `research-runtime` | Cross-layer orchestration, CLI, strategies, site emit |

## Skills (pointers)

- `.Codex/skills/workflow-strict/SKILL.md` — strict workflow + **report-polish** checks  
- `.Codex/skills/business-analysis-finalize/SKILL.md` — six-dimension write-back entry  
- `.Codex/skills/quality-gates/SKILL.md` — quality gate order  
- `.Codex/skills/repo-router` + `repo-status` / `repo-submit` — git hygiene  

## Docs index

- [docs/README.md](docs/README.md) — full doc map  
- [docs/guides/workflows.md](docs/guides/workflows.md) — **source of truth** for CLI args and run layout  

## Environment

- Node.js **>= 20**  
- pnpm **>= 10**
