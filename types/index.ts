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
