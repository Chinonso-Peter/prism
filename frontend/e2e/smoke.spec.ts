import { expect, test } from "@playwright/test";
import { StrKey } from "@stellar/stellar-sdk";

test("search routes a transaction hash to its transaction page", async ({ page }) => {
  const hash = "a".repeat(64);
  await page.goto(`/search?q=${hash}`);
  await expect(page).toHaveURL(new RegExp(`/tx/${hash}$`));
});

test("XDR decoder decodes a valid ScVal", async ({ page }) => {
  await page.goto("/xdr");
  await page.locator("textarea").fill("AAAAAQ==");
  await page.getByRole("button", { name: "Decode" }).click();
  await expect(page.getByText("ScVal type")).toBeVisible();
  await expect(page.getByText("scvVoid")).toBeVisible();
});

test("contract page renders its overview and data panels", async ({ page }) => {
  const contractId = StrKey.encodeContract(Buffer.alloc(32, 1));
  await page.goto(`/contract/${contractId}`);
  await expect(page.getByRole("heading", { name: "Contract", exact: true })).toBeVisible();
  await expect(page.getByText("Couldn't load this contract")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Invocations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
});
