import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { BlogPost } from "@/types";

/**
 * 博客文章卡片组件
 * 展示标题、日期、描述、分类标签、阅读时间
 */
export default function BlogCard({
  post,
  className,
}: {
  post: Omit<BlogPost, "content">;
  className?: string;
}) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        "group block rounded-xl border border-gray-200 bg-surface p-5 no-underline shadow-sm transition-all hover:-translate-y-1 hover:shadow-md",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span>·</span>
        <span>{post.readingTime} 分钟阅读</span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-text group-hover:text-primary">
        {post.title}
      </h3>
      <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-text-muted">
        {post.description}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {post.category}
        </span>
        {post.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-muted"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
