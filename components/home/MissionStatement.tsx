/**
 * 首页使命宣言区块
 * 居中引用风格文字，突出个人成长叙事
 */
export default function MissionStatement() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <blockquote className="text-lg italic leading-relaxed text-text-muted sm:text-xl">
          &ldquo;致力于成为数字化时代兼具专业判断力与技术洞察力的审计人才——
          从学校体系的被动接收，到职业体系的主动进化。
          在持续学习中积累，在实践分享中成长。&rdquo;
        </blockquote>
        <p className="mt-4 text-sm text-text-muted">
          —— 温州大学财务管理专业 · 2024 级 · IPO 审计方向
        </p>
      </div>
    </section>
  );
}
