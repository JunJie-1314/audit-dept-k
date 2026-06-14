import { cn } from "@/lib/utils";

/**
 * 分类筛选标签
 * 点击切换激活/非激活状态
 */
export default function CategoryBadge({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-white"
          : "bg-gray-100 text-text-muted hover:bg-gray-200",
      )}
    >
      {label}
    </button>
  );
}
