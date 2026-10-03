import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import PostNav from "@/components/shared/PostNav";
import Container from "@/components/shared/Container";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

/** 预生成所有文章页面 */
export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

/** 动态生成页面元数据 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "文章不存在" };

  return {
    title: post.title,
    description: post.description,
  };
}

/**
 * 博客文章详情页
 * 展示文章标题、元信息、分类标签和正文
 * 正文以纯文本方式渲染（静态导出模式下 MDX 编译受限，使用预格式化的 HTML 片段）
 *
 * 注意：纯静态导出（output: "export"）不支持 @next/mdx 的远程 MDX 编译。
 * 作为替代方案，正文使用 gray-matter 提取的纯文本内容，保持简洁可读。
 * 如需完整 MDX 渲染，请移除 output: "export" 并使用 SSR。
 */
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <article className="py-16 sm:py-20">
      <Container>
        <div className="mx-auto max-w-2xl">
          {/* Back link */}
          <Link
            href="/blog"
            className="mb-6 inline-flex items-center text-sm text-text-muted no-underline transition-colors hover:text-primary"
          >
            ← 返回博客列表
          </Link>

          {/* Header */}
          <header className="mb-8">
            <div className="mb-3 flex items-center gap-3 text-sm text-text-muted">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span>·</span>
              <span>{post.readingTime} 分钟阅读</span>
            </div>
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">
              {post.title}
            </h1>
          </header>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            {post.rawContent.split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={i} />;

              // Simple heading detection
              if (trimmed.startsWith("## ")) {
                return (
                  <h2 key={i} className="mb-3 mt-8 text-xl font-semibold text-primary">
                    {trimmed.replace(/^##\s+/, "")}
                  </h2>
                );
              }
              if (trimmed.startsWith("### ")) {
                return (
                  <h3 key={i} className="mb-2 mt-6 text-lg font-semibold text-text">
                    {trimmed.replace(/^###\s+/, "")}
                  </h3>
                );
              }

              // Bold and italic
              let content: React.ReactNode = trimmed
                .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                .replace(/\*(.+?)\*/g, "<em>$1</em>")
                .replace(/`(.+?)`/g, "<code>$1</code>");

              return (
                <p key={i} className="mb-3 leading-relaxed text-text">
                  <span dangerouslySetInnerHTML={{ __html: content as string }} />
                </p>
              );
            })}
          </div>

          {/* Footer tags */}
          <footer className="mt-10 border-t border-gray-200 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {post.category}
              </span>
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </footer>

          {/* Prev / next post navigation */}
          <PostNav slug={post.slug} />
        </div>
      </Container>
    </article>
  );
}
