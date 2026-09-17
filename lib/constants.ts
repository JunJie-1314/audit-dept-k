import type { NavItem, Resource, CompetencyItem, CareerPhase, EvidenceItem, EvidenceLayer, AgentWorkflowStep } from "@/types";

/** 网站元数据 */
export const SITE = {
  name: "审计K部",
  tagline: "以专业守护信任，以成长定义未来",
  description: "温州大学财管专业大三学生——IPO审计方向的数据驱动型专业人才。个人职业成长记录、审计知识体系与实务工具分享。",
  url: "https://kaudit.cn",
} as const;

/** 导航链接 */
export const NAV_LINKS: NavItem[] = [
  { label: "首页", href: "/" },
  { label: "IPO进化", href: "/ipo" },
  { label: "周报看板", href: "/dashboard/weekly.html" },
  { label: "关于", href: "/about" },
  { label: "博客", href: "/blog" },
  { label: "资源", href: "/resources" },
];

/** 首页特色卡片 */
export const FEATURES = [
  {
    title: "审计资源",
    description: "精选审计底稿模板、实务工具、法规整理，持续更新中。",
    icon: "📋",
    href: "/resources",
  },
  {
    title: "学习笔记",
    description: "从课堂到实务——记录审计学习路上的思考与总结。",
    icon: "📝",
    href: "/blog",
  },
  {
    title: "IPO进化",
    description: "完整证据链索引——每一句陈述都有物证支撑。",
    icon: "📄",
    href: "/ipo",
  },
] as const;

/** 关于页 - K 的含义 */
export const K_MEANINGS = [
  { letter: "K", word: "Knowledge", label: "知识", desc: "审计是知识的职业，每一份审计意见都建立在扎实的专业知识之上。" },
  { letter: "K", word: "Key", label: "钥匙", desc: "审计师是资本市场的守门人，信任是打开经济繁荣的钥匙。" },
  { letter: "K", word: "Knight", label: "骑士", desc: "如同骑士守护正义，审计师守护财务信息的真实与公允。" },
] as const;

/** 能力雷达图数据 */
export const COMPETENCIES: CompetencyItem[] = [
  { label: "财务会计基础", score: 7 },
  { label: "审计理论与实务", score: 6 },
  { label: "数据分析能力", score: 5 },
  { label: "沟通与协作", score: 7 },
  { label: "职业道德", score: 8 },
  { label: "数字化工具应用", score: 6 },
];

/** 职业规划阶段 */
export const CAREER_PHASES: CareerPhase[] = [
  {
    title: "短期目标",
    period: "大学阶段",
    goals: ["扎实学好财务会计、审计学核心课程", "通过初级会计职称考试", "参与审计相关实习，积累实务经验", "掌握 Excel、Python 数据分析基础"],
  },
  {
    title: "中期目标",
    period: "入职 1-3 年",
    goals: ["进入会计师事务所，完成审计员到高级审计员的晋升", "考取 CPA 证书", "熟练运用审计软件与数字化工具", "建立审计方法论个人知识体系"],
  },
  {
    title: "长期目标",
    period: "5-10 年",
    goals: ["成为审计项目经理，独立带队完成审计项目", "深耕特定行业（如制造业或金融业）", "持续关注审计数字化转型趋势", "回馈行业——分享经验、培养新人"],
  },
];

/** 资源列表 */
export const RESOURCES: Resource[] = [
  {
    id: "working-paper-template",
    title: "审计工作底稿模板",
    description: "通用审计工作底稿 Excel 模板，含试算平衡表、审定表、明细表等常用 sheet。",
    fileType: "xlsx",
    fileSize: "45 KB",
    fileName: "audit-working-paper-template.xlsx",
  },
  {
    id: "procedure-checklist",
    title: "审计程序检查清单",
    description: "常见审计程序清单 PDF，覆盖货币资金、应收应付、存货、收入等主要科目。",
    fileType: "pdf",
    fileSize: "120 KB",
    fileName: "audit-procedure-checklist.pdf",
  },
  {
    id: "career-plan-template",
    title: "审计职业规划模板",
    description: "面向审计专业学生的职业规划 Word 模板，含自我评估、目标拆解、行动计划。",
    fileType: "docx",
    fileSize: "35 KB",
    fileName: "career-plan-template.docx",
  },
];

/** 社交媒体链接 */
export const SOCIAL_LINKS = [
  { label: "GitHub", href: "https://github.com", icon: "🔗" },
  { label: "邮箱", href: "mailto:contact@auditk.cn", icon: "📧" },
] as const;

// ──────────────────────────────────────
// IPO 进化 · 证据链数据
// ──────────────────────────────────────

/** 证据项 */
export interface EvidenceData {
  id: string;        // e.g. "A-1-01"
  label: string;     // e.g. "ACCA F阶段成绩单"
  desc: string;      // 说明
  status: "ready" | "pending"; // ready = 已上线可查看, pending = 待补充
}

/** 证据层 */
export interface EvidenceLayerData {
  id: string;        // "A" | "B" | "C" | "D"
  title: string;
  subtitle: string;
  items: EvidenceData[];
}

/** 证据索引总表 */
export const EVIDENCE_LAYERS: EvidenceLayerData[] = [
  {
    id: "A",
    title: "能力基础",
    subtitle: "学业成绩、专业资质、认知评估——我凭什么能做审计",
    items: [
      { id: "A-1-01", label: "ACCA F阶段成绩单", desc: "F1-F5 五门通过，证明国际会计准则基础", status: "ready" },
      { id: "A-1-02", label: "360度多维评估记录", desc: "自我/老师/实习/同学四方评价汇总", status: "ready" },
      { id: "A-1-03", label: "校一等奖学金 + GPA 3.48", desc: "大一综测排名 1/107，专业前 30%", status: "ready" },
      { id: "A-2-01", label: "CAS 知识体系图谱", desc: "200+ 知识点按中国会计准则编号索引，Obsidian 关系图谱", status: "ready" },
      { id: "A-2-02", label: "MBTI + 霍兰德测评报告", desc: "INTJ + ICE 型，与审计职业高度匹配", status: "ready" },
    ],
  },
  {
    id: "B",
    title: "实践证据",
    subtitle: "三段实习、技术产出、知识体系——我到底做了什么",
    items: [
      { id: "B-1-01", label: "三段实习因果链", desc: "长江证券（排除）→ 大信审计（聚焦）→ 长江保荐IPO（深入）", status: "ready" },
      { id: "B-2-01", label: "货币资金流水 Python 脚本", desc: "3000 条银行流水手工核对 2h → 脚本 10min，全量 1200 笔", status: "ready" },
      { id: "B-2-02", label: "技术栈迭代决策记录", desc: "Power BI → SQL+Python → AI 原生可视化，含专家府评审意见", status: "ready" },
      { id: "B-3-01", label: "Obsidian 知识库结构", desc: "200+ 知识点按 CAS 编号体系化，支持全文检索与反向链接", status: "ready" },
      { id: "B-3-02", label: "大信审计底稿工作记录", desc: "货币资金底稿编制、银行询证函发放、费用截止测试", status: "pending" },
    ],
  },
  {
    id: "C",
    title: "职业承诺",
    subtitle: "规划路径、备选方案、认知成长——我知道要去哪",
    items: [
      { id: "C-1-01", label: "大信审计实习证明", desc: "2026 年寒假，货币资金底稿获项目组认可并邀请假期返岗", status: "pending" },
      { id: "C-1-02", label: "长江证券实习证明", desc: "2025 年暑假，审核近 1500 份合同 + 80 余份报销单", status: "pending" },
      { id: "C-2-01", label: "职业规划三阶段路线图", desc: "能力夯实期 → 专业突破期 → 职业输出期，含备选路径", status: "ready" },
      { id: "C-2-02", label: "三次认知升级记录", desc: "对审计（查业务逻辑）、对技术（设计系统）、对职业（知道苦还选）", status: "ready" },
    ],
  },
  {
    id: "D",
    title: "外部验证",
    subtitle: "第三方评价、竞赛成果、行业背书——别人怎么看我",
    items: [
      { id: "D-0-01", label: "专家府三方评审决议", desc: "nigo + 陈版主 + 田川 对生涯发展报告的独立评审与交叉质询", status: "ready" },
      { id: "D-0-02", label: "挑战杯省赛金奖证书", desc: "2025 年浙江省挑战杯大学生课外学术科技作品竞赛", status: "pending" },
      { id: "D-0-03", label: "电商竞赛省一等奖证书", desc: "2025 年全国大学生电子商务竞赛", status: "pending" },
      { id: "D-0-04", label: "生涯发展报告全文", desc: "《从学校体系到职业体系的IPO进化之路》经专家府评审迭代", status: "ready" },
    ],
  },
];

/** Agent 协同工作流步骤 */
export interface AgentWorkflowStepData {
  agent: string;       // Agent/skill 名称
  icon: string;        // emoji
  phase: string;       // "知识层" | "工具层" | "决策层"
  question: string;    // 调用时面对的问题
  insight: string;     // 结论摘要
  output: string;      // 产出
  evidenceId?: string; // 关联的物证编号
}

/** Agent 协同工作流——展示 AI 如何辅助决策与产出 */
export const AGENT_WORKFLOW: { phase: string; steps: AgentWorkflowStepData[] }[] = [
  {
    phase: "知识层 · 认知构建",
    steps: [
      {
        agent: "expert-council",
        icon: "🏯",
        phase: "知识层",
        question: "我的职业规划方向是否正确？CPA vs ACCA 优先级怎么排？",
        insight: "三位专家一致：CPA 是入场券（陈版主），技术打穿一个具体场景（nigo），进项目少说多干（田川）",
        output: "生涯报告获三方评审认证，迭代至 v2.0",
        evidenceId: "D-0-01",
      },
      {
        agent: "chen-yiwei-perspective",
        icon: "📋",
        phase: "知识层",
        question: "A股 IPO 审计的准则基础应该按什么体系来搭建？",
        insight: "以 CAS 编号为主线、问询案例为枝叶，形成自己的准则理解框架",
        output: "Obsidian 知识库按 CAS 1-37 号编号体系重构",
        evidenceId: "A-2-01",
      },
      {
        agent: "logic-equation-memory",
        icon: "🧮",
        phase: "知识层",
        question: "如何把枯燥的准则条文转化为长期记忆？",
        insight: "用逻辑等式心象术将准则判断流程压缩为 3-5 步判断链",
        output: "CAS 14 收入五步法、CAS 21 租赁识别等核心准则的逻辑等式",
        evidenceId: "A-2-01",
      },
    ],
  },
  {
    phase: "工具层 · 效率跃迁",
    steps: [
      {
        agent: "tu-jiabing-perspective",
        icon: "🔧",
        phase: "工具层",
        question: "Power BI 是不是审计数据可视化的正确答案？",
        insight: "审计交付物是 PDF 底稿和 Excel 附表，不是动态仪表盘。AI 原生可视化是趋势，别花太多时间在 DAX 上",
        output: "下调 Power BI 权重，转向 SQL+Python+AI 可视化组合",
        evidenceId: "B-2-02",
      },
      {
        agent: "tianchuan-perspective",
        icon: "🔍",
        phase: "工具层",
        question: "我怎么设计审计程序才不是'在填表'？",
        insight: "进项目先老老实实把业务搞清楚——目标→风险→程序→证据→结论五步闭环，不要跳过业务理解直接写程序",
        output: "货币资金底稿分析框架（先理解资金调度逻辑，再写脚本跑数据）",
        evidenceId: "B-3-02",
      },
      {
        agent: "pdf-to-markdown",
        icon: "📄",
        phase: "工具层",
        question: "如何把 PDF 版准则文件变成可搜索的结构化笔记？",
        insight: "用 MinerU API 批量提取，配合 obsidian-card-formatting 统一排版",
        output: "200+ 篇准则与实务笔记，支持全文检索和反向链接",
        evidenceId: "B-3-01",
      },
    ],
  },
  {
    phase: "决策层 · 路径规划",
    steps: [
      {
        agent: "fra-model",
        icon: "📊",
        phase: "决策层",
        question: "六看模型 / 八看模型 / 四维分析法应该如何整合到审计分析程序中？",
        insight: "三种财报分析框架可嵌入审计分析程序——异常波动识别 + 行业对标 + 财务比率趋势分析",
        output: "审计分析程序三层框架（宏观→行业→科目），应用于实习底稿",
      },
      {
        agent: "audit-basis-sense",
        icon: "🔬",
        phase: "决策层",
        question: "审计底稿的向量空间复杂度如何估算？有没有合并简化空间？",
        insight: "识别重复 sheet、统一公式逻辑、减少人工跨表勾稽是降低审计复杂度的关键",
        output: "底稿优化方法论，应用于后续实习中的底稿模板改进",
      },
    ],
  },
];

/** 首页三个数字锚点 */
export const HERO_NUMBERS = [
  { value: "200+", label: "CAS 知识节点", desc: "按准则编号体系化索引" },
  { value: "12×", label: "效率跃迁", desc: "手工 2h → 脚本 10min" },
  { value: "3 段", label: "实习因果链", desc: "排除 → 聚焦 → 深入 IPO" },
] as const;
