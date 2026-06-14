import Link from "next/link";
import { SITE } from "@/lib/constants";

/**
 * 首页 Hero 区域
 * 全屏高度渐变背景，大标题 + 副标题 + CTA 按钮
 */
export default function Hero() {
  return (
    <section className="relative flex min-h-[85vh] items-center justify-center bg-gradient-to-br from-primary via-primary-light to-primary-dark text-white">
      {/* Decorative overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(212,168,83,0.15),transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
          {SITE.name}
        </h1>
        <p className="mt-4 text-lg text-white/80 sm:text-xl">
          {SITE.tagline}
        </p>
        <p className="mt-2 text-sm text-white/60">
          审计资源分享 · 个人职业成长记录
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/about"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-primary no-underline shadow-lg transition-all hover:bg-accent-light hover:shadow-xl"
          >
            了解更多
          </Link>
          <Link
            href="/resources"
            className="rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white no-underline backdrop-blur transition-all hover:bg-white/20"
          >
            资源下载
          </Link>
        </div>
      </div>
    </section>
  );
}
