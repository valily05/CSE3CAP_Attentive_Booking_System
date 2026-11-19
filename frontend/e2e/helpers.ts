import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/** Reads the newest email to `to` from Mailpit and returns its first token link. */
export async function tokenLinkFor(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const msg = (await (await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
      const m = msg.Text.match(/https?:\/\/\S+token=[\w-]+/);
      if (m) return new URL(m[0]).pathname + new URL(m[0]).search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email with a link for ${to}`);
}
