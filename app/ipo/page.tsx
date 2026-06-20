import type { Metadata } from "next";
import Container from "@/components/shared/Container";
import AgentWorkflow from "@/components/ipo/AgentWorkflow";
import EvidenceLayerSection from "@/components/ipo/EvidenceLayerSection";
import {
  EVIDENCE_LAYERS,
  AGENT_WORKFLOW,
  HERO_NUMBERS,
} from "@/lib/constants";
import Link from "next/link";

export const metadata: Metadata = {
  title: "IPO进化",
  description:
    "完整证据链索引——每一句陈述都有物证支撑。从学校体系到职业体系的 IPO 进化之路。",
};

/**
 * IPO 进化 · 证据链总仓库
 *
 * 页面结构：
 * 1. 顶部横幅（三个数字锚点复用于一致性）
 * 2. Agent 协同工作流（开篇定调——AI 辅助决策与产出）
 * 3. A/B/C/D 四层证据索引
 * 4. 底部 CTA——查看生涯报告全文
 */
export default function IpoPage() {
  return (
    <>
      {/* 页面标题横幅 */}
      <section className="bg-gradient-to-br from-primary via-primary-light to-primary-dark py-16 text-white sm:py-20">
        <Container>
          <div className="text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-accent uppercase">
              证据链总仓库
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              IPO 进化 · 证据索引
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-white/70">
              以下全部陈述均有物证支撑，欢迎交叉验证。
              评委看到的每一句话，在这里都能找到源头。
            </p>

            {/* 三个数字锚点——与首页一致 */}
            <div className="mt-8 grid grid-cols-3 gap-4 max-w-xl mx-auto">
              {HERO_NUMBERS.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm"
                >
                  <div className="text-xl font-extrabold text-accent sm:text-2xl">
                    {item.value}
                  </div>
                  <div className="mt-0.5 text-sm text-white/70">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Agent 协同工作流 */}
      <Container>
        <AgentWorkflow phases={AGENT_WORKFLOW} />
      </Container>

      {/* 证据层索引 */}
      <div className="bg-white">
        <Container>
          <div className="mb-10 text-center pt-12">
            <h2 className="text-2xl font-bold text-text sm:text-3xl">
              📄 物证索引
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-text-muted">
              按 A·B·C·D 四层索引，每一层对应一个评审维度。
              点击编号展开证据详情。
            </p>
          </div>

          {EVIDENCE_LAYERS.map((layer) => (
            <EvidenceLayerSection key={layer.id} layer={layer} />
          ))}
        </Container>
      </div>

      {/* 底部 CTA */}
      <section className="bg-bg py-16 text-center">
        <Container>
          <h2 className="text-2xl font-bold text-text sm:text-3xl">
            需要更完整的叙事？
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-text-muted">
            证据索引是&quot;尽调资料&quot;——如果你想看完整的成长故事和职业规划，
            请阅读生涯发展报告全文。
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              href="/about"
              className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white no-underline shadow-lg transition-all hover:bg-primary-light"
            >
              查看完整生涯报告
            </Link>
            <Link
              href="/resources"
              className="rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-text no-underline shadow-sm transition-all hover:bg-gray-50"
            >
              浏览审计资源
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
