import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a psychologist sees their own schedule and working hours", async ({ page }) => {
  await signIn(page, "ayu@attentive.test", "attentive-staff");
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("heading", { name: "My schedule" })).toBeVisible();
  await page.getByRole("link", { name: "Working hours" }).click();
  await expect(page.getByRole("button", { name: "Save hours" })).toBeVisible();
});

test("an admin manages bookings from one calendar and sees the numbers", async ({ page }) => {
  await signIn(page, "admin@attentive.test", "attentive-staff");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("region", { name: /Ayu Lestari/ })).toBeVisible(); // opens on a psychologist's week
  await page.getByRole("button", { name: "Day", exact: true }).click(); // everyone side by side
  await page.getByRole("button", { name: "Previous day" }).click(); // yesterday: seeded sessions exist
  const booking = page.getByRole("button", { name: /^\d\d:\d\d, .+, (Attended|Missed|Upcoming|Needs marking)$/ }).first();
  await booking.click();
  await expect(page.getByRole("region", { name: /^ATT-/ })).toBeVisible();

  await page.getByRole("link", { name: "Reports" }).click();
  await page.getByLabel("Starting").fill(new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  await expect(page.getByText("No-show rate").first()).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Online" })).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History of changes" })).toBeVisible();
});
