import BlogCard from "@/components/blog/BlogCard";
import type { BlogPost } from "@/types";

/**
 * 博客文章列表
 * 2 列响应式网格布局
 */
export default function BlogList({
  posts,
}: {
  posts: Omit<BlogPost, "content">[];
}) {
  if (posts.length === 0) {
    return (
      <p className="py-20 text-center text-text-muted">
        还没有文章，敬请期待。
      </p>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {posts.map((post) => (
        <BlogCard key={post.slug} post={post} />
      ))}
    </div>
  );
}
