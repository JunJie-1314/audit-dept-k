import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";
import type { BlogPost } from "@/types";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/**
 * 获取所有博客文章，按日期降序排列
 * @returns 文章列表（不含 MDX 编译内容，仅元数据）
 */
export function getAllPosts(): Omit<BlogPost, "content">[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const filenames = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));

  const posts = filenames.map((filename) => {
    const slug = filename.replace(/\.mdx$/, "");
    const filePath = path.join(BLOG_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(raw);

    return {
      slug,
      title: data.title ?? slug,
      date: data.date ?? new Date().toISOString(),
      description: data.description ?? "",
      category: data.category ?? "未分类",
      tags: data.tags ?? [],
      readingTime: Math.ceil(readingTime(raw).minutes) || 1,
    };
  });

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/**
 * 根据 slug 获取单篇文章完整数据（含 raw content 用于 MDX 渲染）
 * @param slug - 文章 slug（不含扩展名）
 * @returns 文章完整数据，或 null
 */
export function getPostBySlug(
  slug: string,
): (Omit<BlogPost, "content"> & { rawContent: string }) | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? new Date().toISOString(),
    description: data.description ?? "",
    category: data.category ?? "未分类",
    tags: data.tags ?? [],
    readingTime: Math.ceil(readingTime(raw).minutes) || 1,
    rawContent: content,
  };
}

/**
 * 获取所有分类列表
 * @returns 去重的分类名称数组
 */
export function getCategories(): string[] {
  const posts = getAllPosts();
  const cats = new Set(posts.map((p) => p.category));
  return Array.from(cats);
}
