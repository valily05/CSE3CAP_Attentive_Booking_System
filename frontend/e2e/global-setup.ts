// The e2e database is created and reseeded by e2e/prepare-db.sh before the
// API starts (see playwright.config.ts). Here we only empty the Mailpit inbox
// so tests see their own emails.
export default async function globalSetup() {
  await fetch("http://localhost:8025/api/v1/messages", { method: "DELETE" });
}
