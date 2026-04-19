import { existsSync } from "node:fs";
import path from "node:path";

/** `pnpm --filter` 运行脚本时 cwd 常为 packages/research-strategies */
export function isResearchStrategiesPackageCwd(): boolean {
  return path.basename(process.cwd()) === "research-strategies";
}

function resolveFromRepoRoot(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath;
  return path.resolve(process.cwd(), "../../", relativePath);
}

/** 输入文件：先试 cwd 相对路径，再在 monorepo 根下解析 */
export function resolveInputPath(userPath: string): string {
  if (path.isAbsolute(userPath)) return userPath;
  const direct = path.resolve(process.cwd(), userPath);
  if (existsSync(direct)) return direct;
  if (isResearchStrategiesPackageCwd()) {
    const fromRoot = resolveFromRepoRoot(userPath);
    if (existsSync(fromRoot)) return fromRoot;
  }
  return direct;
}

/** 输出目录：在 package cwd 时写到仓库根相对路径，避免落到 packages/ 下 */
export function resolveOutputPath(userPath: string): string {
  if (path.isAbsolute(userPath)) return userPath;
  if (isResearchStrategiesPackageCwd()) {
    return resolveFromRepoRoot(userPath);
  }
  return path.resolve(process.cwd(), userPath);
}
