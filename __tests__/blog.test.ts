import { describe, it, expect } from "vitest";
import { getAllPosts, getPostBySlug, getCategories } from "@/lib/blog";

describe("lib/blog", () => {
  describe("getAllPosts", () => {
    it("should return an array of posts", () => {
      const posts = getAllPosts();
      expect(Array.isArray(posts)).toBe(true);
    });

    it("should return posts with required fields", () => {
      const posts = getAllPosts();
      for (const post of posts) {
        expect(post).toHaveProperty("slug");
        expect(post).toHaveProperty("title");
        expect(post).toHaveProperty("date");
        expect(post).toHaveProperty("description");
        expect(post).toHaveProperty("category");
        expect(post).toHaveProperty("tags");
        expect(post).toHaveProperty("readingTime");
      }
    });

    it("should return at least 6 posts", () => {
      const posts = getAllPosts();
      expect(posts.length).toBeGreaterThanOrEqual(6);
    });

    it("should sort posts by date descending", () => {
      const posts = getAllPosts();
      for (let i = 0; i < posts.length - 1; i++) {
        expect(new Date(posts[i].date).getTime()).toBeGreaterThanOrEqual(
          new Date(posts[i + 1].date).getTime(),
        );
      }
    });
  });

  describe("getPostBySlug", () => {
    it("should return a post by valid slug", () => {
      const post = getPostBySlug("why-audit");
      expect(post).not.toBeNull();
      expect(post?.title).toBeTruthy();
      expect(post?.rawContent).toBeTruthy();
    });

    it("should return null for invalid slug", () => {
      const post = getPostBySlug("nonexistent-post");
      expect(post).toBeNull();
    });
  });

  describe("getCategories", () => {
    it("should return an array of categories", () => {
      const cats = getCategories();
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.length).toBeGreaterThan(0);
    });
  });
});
