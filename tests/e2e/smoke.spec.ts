import { expect, test } from "@playwright/test";

// Needs a migrated + ingested database and a model key (it talks to the real model).
test("asks a question and gets a cited answer with a sources panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ask HR", exact: true })).toBeVisible();

  await page.getByLabel("Your question").fill("How many vacation days do I get per year?");
  await page.getByRole("button", { name: "Send" }).click();

  const answer = page.getByTestId("assistant-message").last();
  await expect(answer).toContainText("30", { timeout: 90_000 });

  // citations render as clickable [n] badges
  const citation = answer.getByTestId("citation").first();
  await expect(citation).toHaveText("1");

  // source chips sit under the answer; a citation opens the sources sheet and highlights that passage
  await expect(answer.getByTestId("source-chips")).toBeVisible();
  await citation.click();
  const sources = page.getByRole("dialog").getByTestId("sources-list");
  await expect(sources).toBeVisible();
  await expect(sources.getByText("Vacation & Leave Policy").first()).toBeVisible();
  await expect(sources.locator("li").first()).toHaveClass(/border-primary/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // footer discloses that this is an AI assistant
  await expect(page.getByText("AI assistant. Answers are based on Voltwerk policies")).toBeVisible();
});
