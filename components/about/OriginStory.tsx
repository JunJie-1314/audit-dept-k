import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";
import { K_MEANINGS } from "@/lib/constants";

/**
 * K 命名故事区块
 * 三段式讲解 K 的三重含义
 */
export default function OriginStory() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="为什么叫「审计K部」？"
          subtitle="一个字母，三重含义——这是关于成长、守护与无限可能的故事"
        />

        <div className="grid gap-6 sm:grid-cols-3">
          {K_MEANINGS.map((item) => (
            <div
              key={item.word}
              className="rounded-xl border border-gray-200 bg-surface p-6 text-center"
            >
              <div className="mb-3 inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {item.letter}
              </div>
              <h3 className="mb-1 text-lg font-semibold text-primary">
                {item.word}
              </h3>
              <p className="mb-2 text-xs font-medium text-text-muted">
                {item.label}
              </p>
              <p className="text-sm leading-relaxed text-text-muted">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
