import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

type PostMeta = { slug: string; title: string };

/**
 * 博客文章页「上一篇 / 下一篇」导航
 * 顺序依据 getAllPosts()(日期降序):上一篇 = 更新一篇,下一篇 = 更旧一篇;
 * 已是最新/最旧时对应侧不渲染,两侧皆无时不渲染整个导航。
 */
export default function PostNav({ slug }: { slug: string }) {
  const posts: PostMeta[] = getAllPosts();
  const index = posts.findIndex((post) => post.slug === slug);
  if (index === -1) return null;
  const prev = index > 0 ? posts[index - 1] : null;
  const next = index < posts.length - 1 ? posts[index + 1] : null;
  if (!prev && !next) return null;

  return (
    <nav className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
      {prev ? (
        <Link
          href={`/blog/${prev.slug}`}
          className="text-sm text-text-muted no-underline transition-colors hover:text-primary"
        >
          ← 上一篇:{prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`/blog/${next.slug}`}
          className="text-sm text-text-muted no-underline transition-colors hover:text-primary sm:text-right"
        >
          下一篇:{next.title} →
        </Link>
      ) : null}
    </nav>
  );
}
