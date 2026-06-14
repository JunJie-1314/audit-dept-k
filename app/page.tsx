import Hero from "@/components/home/Hero";
import MissionStatement from "@/components/home/MissionStatement";
import FeatureCards from "@/components/home/FeatureCards";

/**
 * 首页
 * 组合 Hero、使命宣言、特色卡片三个区块
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <MissionStatement />
      <FeatureCards />
    </>
  );
}
