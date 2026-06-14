import type { Metadata } from "next";
import { getAllPosts, getCategories } from "@/lib/blog";
import BlogPageClient from "./BlogPageClient";

export const metadata: Metadata = {
  title: "博客",
  description: "审计学习笔记、职业规划思考、行业观察——记录成长的每一步。",
};

/**
 * 博客列表页（服务端获取数据，客户端交互筛选）
 */
export default function BlogPage() {
  const posts = getAllPosts();
  const categories = getCategories();

  return <BlogPageClient posts={posts} categories={categories} />;
}
