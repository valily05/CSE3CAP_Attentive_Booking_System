import { expect, test } from "@playwright/test";
import { signIn, tokenLinkFor } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a new client signs up, confirms the email and signs in", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name", { exact: true }).fill("Dewi Test");
  await page.getByLabel("Email", { exact: true }).fill("dewi@example.test");
  await page.getByLabel("Phone number", { exact: true }).fill("081234567891");
  await page.getByLabel("Password", { exact: true }).fill("correct horse!");
  await expect(page.getByRole("checkbox", { name: /check-in email/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /privacy policy/ }).check();
  await page.getByLabel(/Current Country of Residence/).selectOption("ID");
  await page.getByLabel(/City \/ Region of residence/).selectOption("Jakarta");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/We sent a link to dewi@example.test/)).toBeVisible();

  await page.goto(await tokenLinkFor("dewi@example.test"));
  await expect(page.getByText("Your email is confirmed. You can sign in now.")).toBeVisible();
  await signIn(page, "dewi@example.test", "correct horse!");
});

test("a client finds a psychologist, books, moves and cancels without WhatsApp @phone", async ({ page }) => {
  await signIn(page, "rina@example.test", "attentive-client");
  await page.goto("/");
  await page.getByRole("group", { name: "How to meet" }).getByRole("button", { name: "Online" }).click();
  await page.getByRole("link", { name: "See times for Ayu Lestari" }).click();

  await page.getByRole("radio", { name: /Adult counseling/ }).check({ force: true });
  await page.getByRole("radio", { name: "Video call" }).check({ force: true });
  await page.getByRole("button", { name: /^\d\d:\d\d$/ }).first().click();
  await page.getByRole("complementary", { name: "Your booking" }).getByRole("button", { name: "Confirm booking" }).click();

  const card = page.getByRole("region", { name: "You're booked" });
  await expect(card).toBeVisible();
  const code = (await card.getByText(/^ATT-/).textContent())!;

  await page.getByRole("link", { name: "Go to my bookings" }).click();
  const upcoming = page.getByRole("region", { name: "Upcoming" });
  const row = upcoming.getByRole("listitem").filter({ hasText: code });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Change time" }).click();
  await row.getByRole("button", { name: /^\d\d:\d\d$/ }).first().click();
  await expect(page.getByRole("status")).toContainText("Session moved to");

  await upcoming.getByRole("listitem").filter({ hasText: code }).getByRole("button", { name: "Cancel session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByRole("status")).toHaveText("Session cancelled.");
});

test("a client who types the admin address is blocked", async ({ page }) => {
  await signIn(page, "rina@example.test", "attentive-client");
  await page.goto("/admin");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Your account can't open this page.");
});

test("the whole site switches to Indonesian", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bahasa Indonesia" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Temukan seseorang yang benar-benar bisa diajak bicara.");
  await expect(page.locator("html")).toHaveAttribute("lang", "id-ID");
});
