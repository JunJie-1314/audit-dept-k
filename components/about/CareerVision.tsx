import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";
import { CAREER_PHASES } from "@/lib/constants";

/**
 * 职业规划展示区块
 * 短中长期三阶段目标，响应式三列布局
 */
export default function CareerVision() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="职业规划"
          subtitle="清晰的阶段性目标，让每一步都走得坚定"
        />

        <div className="grid gap-6 sm:grid-cols-3">
          {CAREER_PHASES.map((phase, i) => (
            <div
              key={phase.title}
              className="relative rounded-xl border border-gray-200 bg-bg p-6"
            >
              {/* Phase number badge */}
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary">
                {i + 1}
              </div>
              <h3 className="mb-1 text-lg font-semibold text-primary">
                {phase.title}
              </h3>
              <p className="mb-3 text-xs font-medium text-accent">
                {phase.period}
              </p>
              <ul className="space-y-2">
                {phase.goals.map((goal) => (
                  <li key={goal} className="flex items-start gap-2 text-sm text-text-muted">
                    <span className="mt-1 block size-1.5 shrink-0 rounded-full bg-accent" />
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
