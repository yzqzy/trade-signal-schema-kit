# screener-web（已冻结）

本目录为早期实验用的 Next.js 壳层，**不是当前主链路**。

- **默认构建**：根目录 `pnpm run build` **不包含**本包（见仓库根 `package.json` 的 `build` 脚本 filter）。
- **推荐用法**：在 monorepo 根目录使用 `pnpm run screener:run`（`@trade-signal/research-strategies` CLI），产出 `screener_results.json` / `screener_report.md` 等。
- **依赖**：若仍要本地 `pnpm run web:dev`，需先 `pnpm run build` 生成 `packages/research-strategies/dist/...`；从 `@trade-signal/research-strategies` 包入口引用编译产物，可能与 Next/Turbopack 版本组合存在解析差异，**不保证长期可用**。
- **后续**：交互式 UI 若再开，建议单独规划 HTTP/MCP 边界，而非直接耦合本 monorepo 内部实现。
