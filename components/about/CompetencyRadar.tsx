import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";
import { COMPETENCIES } from "@/lib/constants";

/**
 * SVG 能力雷达图
 * 手写 6 轴雷达图，零第三方依赖
 * 标签水平放置，底部显示图例
 */
export default function CompetencyRadar() {
  const cx = 180;
  const cy = 170;
  const radius = 110;
  const axes = COMPETENCIES.length;
  const angleStep = (2 * Math.PI) / axes;

  /** 计算多边形顶点坐标 */
  function getPoint(index: number, r: number): { x: number; y: number } {
    const angle = angleStep * index - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  function pointToString(index: number, r: number): string {
    const p = getPoint(index, r);
    return `${p.x},${p.y}`;
  }

  // 背景网格
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const gridPolygons = gridLevels.map(
    (lvl) => COMPETENCIES.map((_, i) => pointToString(i, radius * lvl)).join(" "),
  );

  // 数据多边形
  const dataPoints = COMPETENCIES.map((c, i) => pointToString(i, (c.score / 10) * radius)).join(" ");

  // 标签位置——放在卡片外圈，统一水平放置
  const labels = COMPETENCIES.map((c, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const labelR = radius + 42;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);
    // 根据角度决定文字对齐方式
    const cosA = Math.cos(angle);
    let anchor: "start" | "middle" | "end" = "middle";
    if (cosA > 0.2) anchor = "start";
    else if (cosA < -0.2) anchor = "end";

    return { label: c.label, score: c.score, x: lx, y: ly, anchor };
  });

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="能力自评"
          subtitle="诚实面对现状，才看清成长方向。以下为自我评估的当前能力水平（满分 10 分）"
        />

        <div className="flex flex-col items-center">
          <svg viewBox="0 0 360 380" className="w-full max-w-md">
            {/* 背景网格 */}
            {gridPolygons.map((pts, i) => (
              <polygon
                key={i}
                points={pts}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth={i === 3 ? "1.5" : "0.75"}
                strokeDasharray={i < 3 ? "4 3" : undefined}
              />
            ))}

            {/* 轴射线 */}
            {COMPETENCIES.map((_, i) => {
              const p = getPoint(i, radius);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={p.x}
                  y2={p.y}
                  stroke="#e5e7eb"
                  strokeWidth="0.75"
                />
              );
            })}

            {/* 数据多边形 */}
            <polygon
              points={dataPoints}
              fill="rgba(212,168,83,0.25)"
              stroke="#D4A853"
              strokeWidth="2"
            />

            {/* 数据点 + 分数 */}
            {COMPETENCIES.map((c, i) => {
              const p = getPoint(i, (c.score / 10) * radius);
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="4" fill="#107C41" />
                  <text
                    x={p.x}
                    y={p.y - 10}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="bold"
                    fill="#107C41"
                  >
                    {c.score}
                  </text>
                </g>
              );
            })}

            {/* 标签——水平对齐 */}
            {labels.map((l) => (
              <text
                key={l.label}
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                dominantBaseline="middle"
                fontSize="13"
                fill="#4b5563"
              >
                {l.label}
              </text>
            ))}
          </svg>

          {/* 底部图例 */}
          <div className="mt-4 rounded-lg bg-white px-6 py-3 text-center text-sm text-text-muted">
            绿色圆点上方数字为当前自评得分（满分 10 分），越靠近外圈能力越强
          </div>
        </div>
      </Container>
    </section>
  );
}
