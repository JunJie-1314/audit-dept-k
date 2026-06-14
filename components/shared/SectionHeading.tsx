import { cn } from "@/lib/utils";

/**
 * 通用章节标题组件
 * @param title - 主标题
 * @param subtitle - 副标题（可选）
 */
export default function SectionHeading({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-10 text-center", className)}>
      <h2 className="text-2xl font-bold text-primary sm:text-3xl">{title}</h2>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-2xl text-text-muted">{subtitle}</p>
      )}
    </div>
  );
}
