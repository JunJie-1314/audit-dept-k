import Link from "next/link";
import { HERO_NUMBERS, SITE } from "@/lib/constants";

/**
 * 首页 Hero 区域——个人品牌展示
 * 全屏高度渐变背景，核心主张 + 三个数字锚点 + 双CTA
 */
export default function Hero() {
  return (
    <section className="relative flex min-h-[85vh] items-center justify-center bg-gradient-to-br from-primary via-primary-light to-primary-dark text-white">
      {/* Decorative radial overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(212,168,83,0.15),transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
        {/* 核心主张 */}
        <p className="mb-2 text-sm font-medium tracking-widest text-accent uppercase">
          {SITE.name}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          从学校体系到职业体系的
          <br />
          <span className="text-accent">IPO 进化之路</span>
        </h1>
        <p className="mt-4 text-lg text-white/80 sm:text-xl">
          IPO 审计方向 · 数据驱动型专业人才
        </p>
        <p className="mt-2 text-sm text-white/60">
          温州大学财务管理专业 · 大三在读
        </p>

        {/* 三个数字锚点 */}
        <div className="mt-10 grid grid-cols-3 gap-4 max-w-xl mx-auto">
          {HERO_NUMBERS.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-4 backdrop-blur-sm transition-all hover:bg-white/10"
            >
              <div className="text-2xl font-extrabold text-accent sm:text-3xl">
                {item.value}
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {item.label}
              </div>
              <div className="mt-0.5 text-xs text-white/50">
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {/* CTA 按钮 */}
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/ipo"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-primary no-underline shadow-lg transition-all hover:bg-accent-light hover:shadow-xl"
          >
            查看完整证据链
          </Link>
          <Link
            href="/about"
            className="rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white no-underline backdrop-blur transition-all hover:bg-white/20"
          >
            了解我的 IPO 进化
          </Link>
        </div>
      </div>
    </section>
  );
}
