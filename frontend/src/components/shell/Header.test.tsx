import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import { SessionProvider } from "./Session";
import { Header } from "./Header";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh, push: vi.fn() }) }));

describe("Header", () => {
  beforeEach(() => {
    refresh.mockClear();
    document.cookie = "locale=; max-age=0; path=/";
  });

  it("switches language with a compact toggle and remembers the choice", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ error: "unauthenticated" }, { status: 401 })));
    renderWithIntl(
      <SessionProvider>
        <Header />
      </SessionProvider>,
    );
    const user = userEvent.setup();

    const en = screen.getByRole("button", { name: "English" });
    expect(en).toHaveAttribute("aria-pressed", "true");
    expect(en).toHaveTextContent("EN");
    await user.click(screen.getByRole("button", { name: "Bahasa Indonesia" }));

    expect(document.cookie).toContain("locale=id");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows each role only its own menu", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ role: "psychologist", name: "Ayu", email: "a@x.test" })));
    renderWithIntl(
      <SessionProvider>
        <Header />
      </SessionProvider>,
    );
    expect(await screen.findByRole("link", { name: "My schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Calendar" })).not.toBeInTheDocument();
  });

  it("uses the Attentive logo as the link home", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ error: "unauthenticated" }, { status: 401 })));
    renderWithIntl(
      <SessionProvider>
        <Header />
      </SessionProvider>,
    );
    const home = screen.getByRole("link", { name: "Attentive" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector("img")?.getAttribute("src")).toContain("attentive-logo");
  });
});
