"use client";

import { useState } from "react";
import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";
import BlogList from "@/components/blog/BlogList";
import CategoryBadge from "@/components/blog/CategoryBadge";
import type { BlogPost } from "@/types";

/**
 * 博客列表客户端组件
 * 处理分类筛选交互
 */
export default function BlogPageClient({
  posts,
  categories,
}: {
  posts: Omit<BlogPost, "content">[];
  categories: string[];
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredPosts = activeCategory
    ? posts.filter((p) => p.category === activeCategory)
    : posts;

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="博客"
          subtitle="审计学习笔记与实践思考"
        />

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <CategoryBadge
              label="全部"
              active={activeCategory === null}
              onClick={() => setActiveCategory(null)}
            />
            {categories.map((cat) => (
              <CategoryBadge
                key={cat}
                label={cat}
                active={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
              />
            ))}
          </div>
        )}

        <BlogList posts={filteredPosts} />
      </Container>
    </section>
  );
}
