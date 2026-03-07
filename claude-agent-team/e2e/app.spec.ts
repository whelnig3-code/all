/**
 * E2E Tests — Core application scenarios
 *
 * Like a test drive for a new car: we verify the dashboard loads,
 * buttons respond, and key features work end-to-end.
 *
 * Scenarios:
 * 1. Main page loads with correct title
 * 2. Sidebar navigation is visible
 * 3. Agent team panel displays agents
 * 4. New conversation can be created
 * 5. API docs endpoint returns OpenAPI spec
 * 6. Stats API returns valid structure
 */
import { test, expect } from "@playwright/test";

// ── Page Load ────────────────────────────────────────────────────────────────

test.describe("Main Page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/JM Agent Team/i);
  });

  test("displays sidebar with navigation", async ({ page }) => {
    await page.goto("/");

    // Sidebar should be visible
    const sidebar = page.locator('[data-testid="sidebar"]').or(
      page.locator("nav").first(),
    );
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
  });

  test("shows chat area", async ({ page }) => {
    await page.goto("/");

    // Chat area or main content should be visible
    const chatArea = page.locator('[data-testid="chat-area"]').or(
      page.locator("main").first(),
    );
    await expect(chatArea).toBeVisible({ timeout: 10_000 });
  });
});

// ── Agent Team Panel ─────────────────────────────────────────────────────────

test.describe("Agent Team Panel", () => {
  test("displays agent list", async ({ page }) => {
    await page.goto("/");

    // Look for agent-related text (planner, developer, reviewer)
    const agentText = page.getByText(/developer|planner|reviewer/i).first();
    await expect(agentText).toBeVisible({ timeout: 10_000 });
  });
});

// ── API Endpoints ────────────────────────────────────────────────────────────

test.describe("API Endpoints", () => {
  test("GET /api/docs returns OpenAPI spec", async ({ request }) => {
    const response = await request.get("/api/docs");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty("openapi");
    expect(json.openapi).toMatch(/^3\.\d+\.\d+$/);
    expect(json).toHaveProperty("info");
    expect(json).toHaveProperty("paths");
  });

  test("GET /api/stats returns token stats", async ({ request }) => {
    const response = await request.get("/api/stats");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty("agents");
    expect(json).toHaveProperty("totals");
    expect(json.totals).toHaveProperty("callCount");
    expect(json.totals).toHaveProperty("totalTokens");
    expect(json.totals).toHaveProperty("estimatedCost");
  });

  test("GET /api/conversations returns array", async ({ request }) => {
    const response = await request.get("/api/conversations");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
  });

  test("GET /api/projects returns array", async ({ request }) => {
    const response = await request.get("/api/projects");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
  });
});

// ── Conversation Flow ────────────────────────────────────────────────────────

test.describe("Conversation Flow", () => {
  test("can create a new conversation via API", async ({ request }) => {
    const response = await request.post("/api/conversations", {
      data: { title: "E2E Test Conversation" },
    });

    // Should succeed (200 or 201)
    expect([200, 201]).toContain(response.status());

    const json = await response.json();
    expect(json).toHaveProperty("id");
    expect(json.id).toBeTruthy();
  });
});

// ── Error Handling ───────────────────────────────────────────────────────────

test.describe("Error Handling", () => {
  test("returns 404 for non-existent conversation", async ({ request }) => {
    const response = await request.get(
      "/api/conversations/non-existent-id-12345",
    );
    expect(response.status()).toBe(404);
  });

  test("returns structured error for invalid input", async ({ request }) => {
    const response = await request.post("/api/conversations", {
      data: { title: "" }, // Empty title - may trigger validation
    });

    // Should either succeed with empty title or return 400
    const status = response.status();
    expect([200, 201, 400]).toContain(status);

    if (status === 400) {
      const json = await response.json();
      expect(json).toHaveProperty("error");
    }
  });
});
