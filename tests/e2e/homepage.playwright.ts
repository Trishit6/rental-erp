import { expect, test } from "@playwright/test";

const emptySuccess = JSON.stringify({ success: true, data: [] });

test("homepage loads marketplace data through the proxy and the hero advances", async ({ page }) => {
  const apiResponses: { path: string; status: number }[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) {
      apiResponses.push({ path: `${url.pathname}${url.search}`, status: response.status() });
    }
  });

  // Make the carousel deck deterministic while still exercising the real CMS
  // request. With no live admin banners the storefront must use its built-in deck.
  await page.route(
    (url) => url.pathname === "/api/cms/banners" && url.searchParams.get("placement") === "HERO",
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: emptySuccess }),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const carousel = page.getByRole("region", { name: "Revaro highlights" });
  await expect(carousel).toBeVisible();
  await expect(carousel.getByRole("group", { name: "1 of 4" })).toBeVisible();

  const expectedPaths = [
    "/api/stats",
    "/api/categories",
    "/api/products?sort=recommended&pageSize=8",
    "/api/products?type=RENT&sort=most_viewed&pageSize=4",
    "/api/products?type=SALE&sort=newest&pageSize=4",
    "/api/search/trending",
    "/api/cms/banners?placement=HERO",
  ];
  await expect
    .poll(() => apiResponses.map((response) => response.path))
    .toEqual(expect.arrayContaining(expectedPaths));
  await expect
    .poll(() =>
      expectedPaths.map((path) => apiResponses.find((response) => response.path === path)?.status ?? 0),
    )
    .toEqual(expectedPaths.map(() => 200));

  // Avoid pausing the carousel with a pointer over the hero while waiting for its
  // six-second timer. Check the actual slide group exposed by the rendered DOM.
  await page.mouse.move(0, 0);
  await expect(carousel.getByRole("group", { name: "2 of 4" })).toBeVisible({ timeout: 9_000 });
});
