import Link from "next/link";
import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";
import { FEATURES } from "@/lib/constants";

/**
 * 首页三大特色卡片区域
 * 响应式网格：移动端单列、平板双列、桌面三列
 * 每个卡片使用数据中指定的 href
 */
export default function FeatureCards() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="审计K部 · 核心板块"
          subtitle="三个方向，一条主线——从知识积累到职业成长"
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group rounded-xl border border-gray-200 bg-surface p-6 no-underline shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div className="mb-3 text-3xl">{feature.icon}</div>
              <h3 className="mb-2 text-lg font-semibold text-text group-hover:text-primary">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-text-muted">
                {feature.description}
              </p>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
