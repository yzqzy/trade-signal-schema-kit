import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** GitHub 项目页等子路径部署：设 NEXT_BASE_PATH=/repo-name（无前导以外的多余斜杠） */
function normalizeBasePath(raw) {
  const t = (raw ?? "").trim();
  if (!t || t === "/") return undefined;
  const withSlash = t.startsWith("/") ? t : `/${t}`;
  return withSlash.replace(/\/+$/u, "") || undefined;
}

const basePath = normalizeBasePath(process.env.NEXT_BASE_PATH);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
