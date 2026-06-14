import { describe, it, expect } from "vitest";
import {
  SITE,
  NAV_LINKS,
  FEATURES,
  K_MEANINGS,
  COMPETENCIES,
  CAREER_PHASES,
  RESOURCES,
} from "@/lib/constants";

describe("lib/constants", () => {
  it("SITE should have required fields", () => {
    expect(SITE.name).toBeTruthy();
    expect(SITE.tagline).toBeTruthy();
    expect(SITE.description).toBeTruthy();
    expect(SITE.url).toContain("kaudit.cn");
  });

  it("NAV_LINKS should have at least 3 items", () => {
    expect(NAV_LINKS.length).toBeGreaterThanOrEqual(3);
  });

  it("FEATURES should have exactly 3 items", () => {
    expect(FEATURES).toHaveLength(3);
  });

  it("K_MEANINGS should have exactly 3 items", () => {
    expect(K_MEANINGS).toHaveLength(3);
  });

  it("COMPETENCIES should have 6 axes", () => {
    expect(COMPETENCIES).toHaveLength(6);
    for (const c of COMPETENCIES) {
      expect(c.score).toBeGreaterThanOrEqual(1);
      expect(c.score).toBeLessThanOrEqual(10);
    }
  });

  it("CAREER_PHASES should have 3 phases", () => {
    expect(CAREER_PHASES).toHaveLength(3);
    for (const phase of CAREER_PHASES) {
      expect(phase.goals.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("RESOURCES should have at least 3 items", () => {
    expect(RESOURCES.length).toBeGreaterThanOrEqual(3);
  });
});
