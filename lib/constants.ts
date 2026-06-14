import type { NavItem, Resource, CompetencyItem, CareerPhase } from "@/types";

/** 网站元数据 */
export const SITE = {
  name: "审计K部",
  tagline: "以专业守护信任，以成长定义未来",
  description: "审计K部——专注审计资源分享、实务工具下载与个人职业成长的独立站点。",
  url: "https://kaudit.cn",
} as const;

/** 导航链接 */
export const NAV_LINKS: NavItem[] = [
  { label: "首页", href: "/" },
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
  },
  {
    title: "学习笔记",
    description: "从课堂到实务——记录审计学习路上的思考与总结。",
    icon: "📝",
  },
  {
    title: "职业规划",
    description: "清晰的成长路径：短期扎根、中期深耕、长期突破。",
    icon: "🎯",
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
