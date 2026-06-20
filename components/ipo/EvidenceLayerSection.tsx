"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvidenceLayerData } from "@/lib/constants";

/**
 * 证据层区块组件
 * 每层一组可手动展开的证据卡片，状态标签区分 ready/pending
 */
export default function EvidenceLayerSection({
  layer,
}: {
  layer: EvidenceLayerData;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const layerColors: Record<string, string> = {
    A: "border-l-green-500",
    B: "border-l-blue-500",
    C: "border-l-amber-500",
    D: "border-l-purple-500",
  };

  const dotColors: Record<string, string> = {
    A: "bg-green-500",
    B: "bg-blue-500",
    C: "bg-amber-500",
    D: "bg-purple-500",
  };

  return (
    <section className="py-8 sm:py-10">
      <div
        className={cn(
          "rounded-xl border border-gray-200 bg-white p-6 shadow-sm border-l-4",
          layerColors[layer.id] || "border-l-gray-300",
        )}
      >
        {/* 层标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full text-sm font-bold text-white",
                dotColors[layer.id],
              )}
            >
              {layer.id}
            </span>
            <div>
              <h3 className="text-xl font-bold text-text">{layer.title}</h3>
              <p className="text-sm text-text-muted">{layer.subtitle}</p>
            </div>
          </div>
        </div>

        {/* 可展开证据列表 */}
        <div className="space-y-2">
          {layer.items.map((item) => {
            const isOpen = openId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-lg border border-gray-100 transition-colors"
              >
                {/* 标题行 */}
                <button
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-lg"
                >
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-text-muted shrink-0">
                    {item.id}
                  </code>
                  <span className="flex-1 text-sm font-medium text-text">
                    {item.label}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      item.status === "ready"
                        ? "border-green-300 bg-green-50 text-green-700 text-xs"
                        : "border-gray-200 bg-gray-50 text-gray-400 text-xs"
                    }
                  >
                    {item.status === "ready" ? "可查看" : "待补充"}
                  </Badge>
                  {isOpen ? (
                    <ChevronUpIcon className="size-4 text-text-muted shrink-0" />
                  ) : (
                    <ChevronDownIcon className="size-4 text-text-muted shrink-0" />
                  )}
                </button>

                {/* 展开内容 */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 ml-11">
                    <p className="mb-3 text-sm text-text-muted">{item.desc}</p>
                    {item.status === "ready" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                        📎 证据详情（建设中，敬请期待）
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-3 py-1.5 text-xs text-gray-400">
                        ⏳ 证据上线中，比赛前完成
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
