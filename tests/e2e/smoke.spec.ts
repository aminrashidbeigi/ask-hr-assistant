import { expect, test } from "@playwright/test";

// Needs a migrated + ingested database and a model key (it talks to the real model).
test("asks a question and gets a cited answer with a sources panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ask HR", exact: true })).toBeVisible();

  await page.getByLabel("Your question").fill("How many vacation days do I get per year?");
  await page.getByRole("button", { name: /Send/ }).click();

  const answer = page.getByTestId("assistant-message").last();
  await expect(answer).toContainText("30", { timeout: 90_000 });

  // citations render as clickable [n] badges
  const citation = answer.getByTestId("citation").first();
  await expect(citation).toHaveText("[1]");

  // sources panel (desktop aside) lists the retrieved policy passages and highlights on click
  const sources = page.locator("aside").getByTestId("sources-list");
  await expect(sources).toBeVisible();
  await expect(sources.getByText("Vacation & Leave Policy").first()).toBeVisible();
  await citation.click();
  await expect(sources.locator("li").filter({ hasText: "[1]" }).first()).toHaveClass(/border-primary/);

  // footer discloses that this is an AI assistant
  await expect(page.getByText("AI assistant. Answers are based on Voltwerk policies")).toBeVisible();
});
