import type { Resource } from "@/types";

/** 文件类型对应的图标和颜色 */
const FILE_META: Record<Resource["fileType"], { icon: string; color: string }> = {
  pdf: { icon: "📄", color: "text-red-500" },
  xlsx: { icon: "📊", color: "text-green-600" },
  docx: { icon: "📝", color: "text-blue-600" },
};

/**
 * 资源下载卡片
 * 展示文件类型图标、标题、描述、大小和下载按钮
 */
export default function ResourceCard({ resource }: { resource: Resource }) {
  const meta = FILE_META[resource.fileType];

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-surface p-5 shadow-sm">
      <div className="mb-3 text-3xl">{meta.icon}</div>
      <h3 className="mb-1 text-lg font-semibold text-text">{resource.title}</h3>
      <p className="mb-3 flex-1 text-sm leading-relaxed text-text-muted">
        {resource.description}
      </p>
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-xs text-text-muted">
          {resource.fileType.toUpperCase()} · {resource.fileSize}
        </span>
        <a
          href={`/resources/${resource.fileName}`}
          download
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white no-underline transition-colors hover:bg-primary-light"
        >
          下载
        </a>
      </div>
    </div>
  );
}
