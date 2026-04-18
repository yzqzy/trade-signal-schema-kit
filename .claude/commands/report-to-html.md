---
description: 将 Markdown 转为语义化 HTML（可选目录/旧版 pre 包装）
argument-hint: [--input-md] [--output-html] [--toc] [--legacy-pre]
---

在 **monorepo 根目录**执行（需已 `pnpm run build`）。

## Slash → CLI（脚本 / CI）

```bash
pnpm run report-to-html:run -- \
  --input-md "./output/workflow/600887/analysis_report.md" \
  [--output-html "./output/workflow/600887/analysis_report.custom.html"] \
  [--toc] [--legacy-pre]
```

未指定 `--output-html` 时，在与输入同目录生成同名 `.html`。默认语义化渲染；`--legacy-pre` 回退为整页 `<pre>`。

## Slash 对应

`/report-to-html` → 本 CLI。
