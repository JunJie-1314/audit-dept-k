import type { Metadata } from "next";
import OriginStory from "@/components/about/OriginStory";
import PersonalIntro from "@/components/about/PersonalIntro";
import CareerVision from "@/components/about/CareerVision";
import CompetencyRadar from "@/components/about/CompetencyRadar";
import MilestoneTimeline from "@/components/about/MilestoneTimeline";

export const metadata: Metadata = {
  title: "关于",
  description: "审计K部的故事——K 代表 Knowledge（知识）、Key（钥匙）、Knight（守护），以及站长的 IPO 进化之路。",
};

/**
 * 关于页面
 * K 命名故事 → 站长个人 IPO 进化 → 职业规划 → 能力雷达 → 成长时间线
 */
export default function AboutPage() {
  return (
    <>
      <OriginStory />
      <PersonalIntro />
      <CareerVision />
      <CompetencyRadar />
      <MilestoneTimeline />
    </>
  );
}
