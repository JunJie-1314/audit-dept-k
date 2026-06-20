import Link from "next/link";
import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";
import { HERO_NUMBERS } from "@/lib/constants";

/**
 * 个人 IPO 进化简介
 * 放在关于页 K 含义之后，介绍站长本人的成长故事
 */
export default function PersonalIntro() {
  return (
    <section className="bg-bg py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="站长的 IPO 进化"
          subtitle="K 不仅是 Knowledge、Key、Knight——K 也是我个人的代号"
        />

        <div className="mx-auto max-w-3xl">
          {/* 个人简介 */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
            <p className="text-sm leading-relaxed text-text-muted">
              我，温州大学财务管理专业 2024 级本科生。大一综测排名{" "}
              <strong className="text-text">1/107</strong>
              ，获校一等奖学金。同年进入长江证券财务管理部实习，第一次近距离接触
              IPO 数据准备流程——那一刻我看到了审计师作为资本市场
              &ldquo;守门人&rdquo;的专业价值，也看到了手工核对 3000
              条银行流水的效率困境。
            </p>

            <div className="my-6 border-t border-gray-100" />

            <p className="text-sm leading-relaxed text-text-muted">
              三段实习、三次认知升级、三件硬货——这是我从学校体系到职业体系的
              <strong className="text-primary">IPO 进化之路</strong>。
            </p>

            {/* 三个数字 */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              {HERO_NUMBERS.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-gray-100 bg-bg px-4 py-3 text-center"
                >
                  <div className="text-xl font-extrabold text-primary">
                    {item.value}
                  </div>
                  <div className="mt-1 text-xs font-medium text-text">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/ipo"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white no-underline shadow transition-all hover:bg-primary-light"
              >
                查看完整证据链
              </Link>
              <Link
                href="/blog"
                className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-text no-underline shadow-sm transition-all hover:bg-gray-50"
              >
                阅读学习笔记
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
