import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";

/** 成长里程碑数据 */
const MILESTONES = [
  { year: "大一", title: "入门探索", desc: "学习会计学基础、经济学原理，确立审计职业方向。" },
  { year: "大二", title: "夯实基础", desc: "系统学习中财、审计学、税法，参加职业规划大赛。" },
  { year: "大三", title: "实战积累", desc: "考取初级会计职称，寻找审计实习机会，初步接触实务。" },
  { year: "大四", title: "职业启航", desc: "进入会计师事务所，备考 CPA，开启审计职业生涯。" },
  { year: "入职 3 年", title: "独当一面", desc: "取得 CPA 证书，晋升高级审计员，独立负责科目。" },
  { year: "入职 5 年", title: "带队冲锋", desc: "晋升项目经理，独立带队完成审计项目，深耕行业。" },
];

/**
 * 成长里程碑时间线
 * CSS 垂直线性时间轴
 */
export default function MilestoneTimeline() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="成长路线"
          subtitle="从校园到职场——每一步都是向上生长的足迹"
        />

        <div className="relative mx-auto max-w-lg">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 h-full w-[2px] bg-primary/25 sm:left-1/2 sm:-translate-x-px" />

          <div className="space-y-8">
            {MILESTONES.map((m, i) => (
              <div
                key={m.year}
                className={`relative flex items-start gap-6 ${
                  i % 2 === 0 ? "sm:flex-row" : "sm:flex-row-reverse"
                }`}
              >
                {/* Dot */}
                <div className="absolute left-[13px] size-3.5 rounded-full border-[3px] border-accent bg-white shadow-sm sm:left-1/2 sm:-translate-x-1/2" />

                {/* Content card */}
                <div
                  className={`ml-10 w-full rounded-lg border border-gray-200 bg-bg p-4 sm:ml-0 sm:w-[calc(50%-1.5rem)] ${
                    i % 2 === 0 ? "sm:mr-auto" : "sm:ml-auto"
                  }`}
                >
                  <span className="text-xs font-semibold text-accent">{m.year}</span>
                  <h4 className="mt-1 font-semibold text-text">{m.title}</h4>
                  <p className="mt-1 text-sm text-text-muted">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
