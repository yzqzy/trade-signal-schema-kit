import Image from "next/image";
import Link from "next/link";
import { SiGithub } from "@icons-pack/react-simple-icons";

import logo from "../public/logo.svg";

import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * 顶栏视觉对齐原先 Nextra `Navbar`：白底、细边框、灰阶导航悬停、右侧 GitHub 图标。
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto flex h-16 max-w-360 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/reports"
          className="flex items-center text-gray-900 no-underline transition-opacity hover:opacity-80 dark:text-gray-100 dark:hover:opacity-80"
        >
          <Image
            src={logo}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 sm:h-6 sm:w-6"
            priority
          />
          <span className="ml-2 font-bold text-base sm:text-lg">
            Trade Signal
          </span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-4" aria-label="主导航">
          <Link
            href="/reports"
            className="text-sm font-medium text-gray-600 no-underline transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            研报中心
          </Link>
          <Link
            href="/rankings"
            className="text-sm font-medium text-gray-600 no-underline transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            策略榜单
          </Link>
          <a
            href="https://github.com/yzqzy"
            className="inline-flex items-center justify-center p-1.5 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 仓库（新窗口打开）"
          >
            <SiGithub className="h-5 w-5" aria-hidden />
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
