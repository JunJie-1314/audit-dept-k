import Link from "next/link";
import Container from "@/components/shared/Container";

/**
 * 自定义 404 页面
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Container className="text-center">
        <h1 className="text-6xl font-extrabold text-primary/20">404</h1>
        <p className="mt-4 text-lg text-text-muted">页面不存在</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white no-underline transition-colors hover:bg-primary-light"
        >
          返回首页
        </Link>
      </Container>
    </div>
  );
}
