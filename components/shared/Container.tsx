import { cn } from "@/lib/utils";

/**
 * 最大宽度容器组件
 * 水平居中，设置最大宽度 6xl (72rem)，带水平内边距
 */
export default function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-6xl px-4", className)}>
      {children}
    </div>
  );
}
