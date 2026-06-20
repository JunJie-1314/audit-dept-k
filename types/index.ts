/** 博客文章元数据 */
export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  description: string;
  category: string;
  tags: string[];
  readingTime: number; // minutes
  content: string; // raw MDX body (for rendering)
}

/** 导航链接 */
export interface NavItem {
  label: string;
  href: string;
}

/** 证据项 */
export interface EvidenceItem {
  id: string;
  label: string;
  desc: string;
  status: "ready" | "pending";
}

/** 证据层 */
export interface EvidenceLayer {
  id: string;
  title: string;
  subtitle: string;
  items: EvidenceItem[];
}

/** Agent 工作流步骤 */
export interface AgentWorkflowStep {
  agent: string;
  icon: string;
  phase: string;
  question: string;
  insight: string;
  output: string;
  evidenceId?: string;
}

/** 资源下载项 */
export interface Resource {
  id: string;
  title: string;
  description: string;
  fileType: "pdf" | "xlsx" | "docx";
  fileSize: string; // e.g. "1.2 MB"
  fileName: string;
}

/** 能力维度 */
export interface CompetencyItem {
  label: string;
  score: number; // 0-10
}

/** 职业规划阶段 */
export interface CareerPhase {
  title: string;
  period: string;
  goals: string[];
}
