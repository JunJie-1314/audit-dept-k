import Link from "next/link";
import { SITE, NAV_LINKS } from "@/lib/constants";

/**
 * 页脚组件
 * 包含导航链接、版权信息、社交媒体链接
 */
export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Left: site name + copyright */}
          <div className="text-center sm:text-left">
            <p className="text-sm font-medium text-primary">{SITE.name}</p>
            <p className="mt-1 text-xs text-text-muted">
              © {new Date().getFullYear()} {SITE.name}. {SITE.tagline}
            </p>
          </div>

          {/* Center: nav links */}
          <div className="flex flex-wrap justify-center gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-text-muted no-underline transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: build info */}
          <p className="text-center text-xs text-text-muted sm:text-right">
            由 Next.js 构建 · 部署于 Vercel
          </p>
        </div>
      </div>
    </footer>
  );
}
