import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { fetchCategories } from "../src/lib/categories";
import {
  getCategoryBySlug,
  getCategoryProducts,
  getFeaturedCategories,
  getSubcategories,
} from "../src/features/categories/api";
import { makeCategory } from "./support/category-fixtures";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn() },
}));

/** Every call resolves to a small envelope so the mapping code runs for real. */
function respondWith(data: unknown, pagination?: unknown) {
  vi.mocked(api.get).mockResolvedValue({ data, pagination } as never);
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe("category list requests", () => {
  it("reads the whole active taxonomy from /categories", async () => {
    respondWith([makeCategory()]);
    await expect(fetchCategories()).resolves.toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/categories");
  });

  it("asks the backend for the featured subset rather than hardcoding one", async () => {
    respondWith([makeCategory()]);
    await getFeaturedCategories();
    expect(api.get).toHaveBeenCalledWith("/categories?featured=true");
  });
});

describe("category detail requests", () => {
  it("addresses a category by slug", async () => {
    respondWith(makeCategory());
    await getCategoryBySlug("electronics");
    expect(api.get).toHaveBeenCalledWith("/categories/electronics");
  });

  it("URL-encodes the param so it can never escape its path segment", async () => {
    respondWith(makeCategory());
    await getCategoryBySlug("home/../users");
    expect(api.get).toHaveBeenCalledWith("/categories/home%2F..%2Fusers");
  });

  it("reads subcategories from the category's own endpoint", async () => {
    respondWith([]);
    await getSubcategories("electronics");
    expect(api.get).toHaveBeenCalledWith("/categories/electronics/subcategories");
  });
});

describe("category product requests", () => {
  it("sends the category the page is showing", async () => {
    respondWith([], { page: 1, pageSize: 12, total: 0, totalPages: 1 });
    await getCategoryProducts({ category: "cameras", sort: "recommended", page: 1, pageSize: 12 });

    const path = vi.mocked(api.get).mock.calls[0]![0] as string;
    expect(path.startsWith("/products?")).toBe(true);
    expect(new URLSearchParams(path.split("?")[1]).get("category")).toBe("cameras");
  });

  it("sends the paise price bounds it was given", async () => {
    respondWith([]);
    await getCategoryProducts({
      category: "cameras",
      sort: "price_asc",
      minPrice: 50_000,
      maxPrice: 500_000,
      page: 2,
      pageSize: 12,
    });

    const params = new URLSearchParams(
      (vi.mocked(api.get).mock.calls[0]![0] as string).split("?")[1],
    );
    expect(params.get("minPrice")).toBe("50000");
    expect(params.get("maxPrice")).toBe("500000");
    expect(params.get("sort")).toBe("price_asc");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("12");
  });

  it("omits empty filters instead of sending blanks", async () => {
    respondWith([]);
    await getCategoryProducts({ category: "cameras", sort: "recommended", page: 1, pageSize: 12 });

    const params = new URLSearchParams(
      (vi.mocked(api.get).mock.calls[0]![0] as string).split("?")[1],
    );
    expect(params.has("search")).toBe(false);
    expect(params.has("mode")).toBe(false);
    expect(params.has("condition")).toBe(false);
    expect(params.has("minPrice")).toBe(false);
  });

  it("falls back to a one-page envelope when the API sends no pagination", async () => {
    respondWith([makeCategory()]);
    const result = await getCategoryProducts({
      category: "cameras",
      sort: "recommended",
      page: 3,
      pageSize: 12,
    });

    expect(result.items).toHaveLength(1);
    expect(result.pagination).toMatchObject({ page: 3, pageSize: 12, total: 1, totalPages: 1 });
  });

  it("passes the server's pagination envelope straight through", async () => {
    respondWith([makeCategory()], { page: 2, pageSize: 12, total: 30, totalPages: 3 });
    const result = await getCategoryProducts({
      category: "cameras",
      sort: "recommended",
      page: 2,
      pageSize: 12,
    });

    expect(result.pagination).toEqual({ page: 2, pageSize: 12, total: 30, totalPages: 3 });
  });
});
