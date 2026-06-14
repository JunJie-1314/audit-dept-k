import type { MDXComponents } from "mdx/types";

/**
 * MDX 自定义组件映射
 * 为博客文章提供一致的排版样式
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children, ...props }) => (
      <h1 className="mb-4 mt-10 text-2xl font-bold text-primary sm:text-3xl" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="mb-3 mt-8 text-xl font-semibold text-primary sm:text-2xl" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="mb-2 mt-6 text-lg font-semibold text-text" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p className="mb-4 leading-relaxed text-text" {...props}>
        {children}
      </p>
    ),
    a: ({ children, href, ...props }) => (
      <a
        href={href}
        className="text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary"
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
        {...props}
      >
        {children}
      </a>
    ),
    ul: ({ children, ...props }) => (
      <ul className="mb-4 list-disc space-y-1 pl-6" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="mb-4 list-decimal space-y-1 pl-6" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="leading-relaxed text-text" {...props}>
        {children}
      </li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="mb-4 border-l-4 border-accent bg-accent/5 px-4 py-2 italic text-text-muted"
        {...props}
      >
        {children}
      </blockquote>
    ),
    pre: ({ children, ...props }) => (
      <pre
        className="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"
        {...props}
      >
        {children}
      </pre>
    ),
    code: ({ children, ...props }) => (
      <code
        className="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono text-primary-dark"
        {...props}
      >
        {children}
      </code>
    ),
    table: ({ children, ...props }) => (
      <div className="mb-4 overflow-x-auto">
        <table className="w-full border-collapse border border-gray-200 text-sm" {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th className="border border-gray-200 bg-gray-50 px-4 py-2 text-left font-semibold" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="border border-gray-200 px-4 py-2" {...props}>
        {children}
      </td>
    ),
    hr: (props) => <hr className="my-8 border-gray-200" {...props} />,
    ...components,
  };
}
