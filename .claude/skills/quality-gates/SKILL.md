---
name: quality-gates
description: "质量门禁：conformance → contract → regression → phase3-golden；regression/golden 支持 cn_a、hk、all 套件。"
---

# quality-gates 规范

## 执行顺序（与 `quality:all` 一致）

1. **conformance**：HTTP/MCP fixture 语义一致。
2. **contract**：`output/phase3_golden/cn_a/` 下市场包与估值 JSON 结构契约。
3. **regression**：对 golden 输入重跑 Phase3，规范化时间戳后与 `cn_a` / `hk` 基线比对哈希。
4. **phase3-golden**：按各套件 `run/golden_manifest.json` 校验产出文件 sha256 + 字节数。

## 套件

| 套件 | 路径前缀 |
|------|-----------|
| cn_a | `output/phase3_golden/cn_a/` |
| hk | `output/phase3_golden/hk/` |
| all | 依次运行 cn_a + hk |

## 常用命令

```bash
pnpm run quality:all
pnpm --filter @trade-signal/research-strategies run quality:regression -- --suite hk
pnpm --filter @trade-signal/research-strategies run quality:phase3-golden -- --suite cn_a
```

单 manifest 调试：

```bash
pnpm --filter @trade-signal/research-strategies run quality:phase3-golden -- \
  --manifest ./output/phase3_golden/hk/run/golden_manifest.json
```

## 更新 golden 后

- 同步更新对应 `run/golden_manifest.json` 与 `run/*` 基线文件，并跑 `pnpm run quality:all` 确认通过。
