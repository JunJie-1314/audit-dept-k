import { Badge } from "@/components/ui/badge";
import type { AgentWorkflowStepData } from "@/lib/constants";

/**
 * Agent 协同工作流可视化
 * 按知识层/工具层/决策层分阶段展示 Agent 调用链路
 * 每一行：场景问题 → Agent 决策 → 落地产出
 */
export default function AgentWorkflow({
  phases,
}: {
  phases: { phase: string; steps: AgentWorkflowStepData[] }[];
}) {
  const phaseColors: Record<string, string> = {
    "知识层": "border-emerald-200 bg-emerald-50",
    "工具层": "border-blue-200 bg-blue-50",
    "决策层": "border-amber-200 bg-amber-50",
  };

  return (
    <section className="py-10 sm:py-14">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-text sm:text-3xl">
          🧠 Agent 协同工作流
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-text-muted">
          我不是在&quot;用 AI 工具&quot;——我是在用 AI 辅助审计判断与决策。
          每一步 Agent 调用，都有对应的决策和产出。
        </p>
      </div>

      <div className="space-y-8">
        {phases.map((phase) => (
          <div key={phase.phase}>
            <h3 className="mb-4 text-lg font-semibold text-primary">
              {phase.phase}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {phase.steps.map((step) => (
                <div
                  key={`${step.agent}-${step.question.slice(0, 10)}`}
                  className={`rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${
                    phaseColors[step.phase] || "border-gray-200 bg-white"
                  }`}
                >
                  {/* Agent 信息 */}
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xl">{step.icon}</span>
                    <code className="rounded bg-white/60 px-1.5 py-0.5 text-xs font-mono text-text-muted">
                      {step.agent}
                    </code>
                  </div>

                  {/* 问题 */}
                  <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wide">
                    🤔 面对的问题
                  </p>
                  <p className="mb-3 text-sm text-text">{step.question}</p>

                  {/* 洞察 */}
                  <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wide">
                    💡 关键洞察
                  </p>
                  <p className="mb-3 text-sm leading-relaxed text-text-muted">
                    {step.insight}
                  </p>

                  {/* 产出 */}
                  <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wide">
                    📦 落地产出
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">
                      {step.output}
                    </span>
                    {step.evidenceId && (
                      <Badge variant="outline" className="text-xs">
                        {step.evidenceId}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
