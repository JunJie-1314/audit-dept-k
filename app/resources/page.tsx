import type { Metadata } from "next";
import Container from "@/components/shared/Container";
import SectionHeading from "@/components/shared/SectionHeading";
import ResourceCard from "@/components/resources/ResourceCard";
import { RESOURCES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "资源",
  description: "审计工具、模板、检查清单——实用资源免费下载。",
};

/**
 * 资源下载页
 * 展示所有可下载的审计资源文件
 */
export default function ResourcesPage() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          title="资源下载"
          subtitle="精选审计实务工具与模板，持续更新中。欢迎下载使用，也欢迎反馈建议。"
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      </Container>
    </section>
  );
}
