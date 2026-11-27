import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen,waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import { SessionProvider } from "./Session";
import { Header } from "./Header";

const refresh = vi.fn();
const route=vi.hoisted(()=>({path:"/"}));
vi.mock("next/navigation", () => ({ usePathname: () => route.path, useRouter: () => ({ refresh, push: vi.fn() }) }));

describe("Header", () => {
 it("leaves the sign-in page to its dedicated account header",()=>{route.path="/signin";const {container}=renderWithIntl(<Header/>);expect(container).toBeEmptyDOMElement();route.path="/";});
  it("opens account details, closes with Escape, and signs out through the existing API", async () => {
    let requests=0;
    server.use(
      http.get("*/api/auth/me",()=>HttpResponse.json({role:"client",name:"Rina",email:"rina@example.test"})),
      http.post("*/api/auth/logout",()=>{requests++;return new HttpResponse(null,{status:204});}),
    );
    renderWithIntl(<SessionProvider><Header/></SessionProvider>);
    const user=userEvent.setup();const account=await screen.findByRole("button",{name:"Your account"});
    expect(screen.queryByRole("button",{name:"Sign out"})).not.toBeInTheDocument();
    await user.click(account);expect(account).toHaveAttribute("aria-expanded","true");
    expect(screen.getByText("rina@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Sign out"})).toHaveFocus();
    await user.keyboard("{Escape}");expect(account).toHaveAttribute("aria-expanded","false");expect(account).toHaveFocus();
    await user.click(account);await user.click(screen.getByRole("button",{name:"Sign out"}));
    expect(await screen.findByRole("link",{name:"Sign in"})).toBeInTheDocument();expect(requests).toBe(1);
  });
  beforeEach(() => {
    refresh.mockClear();route.path="/";
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

it("marks account and urgent notifications as read without removing them",async()=>{
 localStorage.setItem("attentive-urgent-notifications",JSON.stringify([{code:"ATT1234",token:"a".repeat(43),submittedAt:"2026-11-20T03:00:00Z",status:"PENDING",seen:false}]));
 let read=false;
 server.use(http.get("*/api/auth/me",()=>HttpResponse.json({role:"client",name:"Rina",email:"rina@example.test"})),http.get("*/api/me/notifications",()=>HttpResponse.json({items:[{id:"n1",kind:"welcome",read,createdAt:"2026-11-20T03:00:00Z"}]})),http.post("*/api/me/notifications/read-all",()=>{read=true;return new HttpResponse(null,{status:204})}));
 renderWithIntl(<SessionProvider><Header/></SessionProvider>);
 const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Notifications"}));
 const button=await screen.findByRole("button",{name:"Mark all as read"});
 await waitFor(()=>expect(screen.getByText("Welcome to Attentive.")).toBeInTheDocument());
 await user.click(button);await waitFor(()=>expect(button).toBeDisabled());
 expect(read).toBe(true);expect(screen.getByText("Welcome to Attentive.")).toBeInTheDocument();expect(screen.getByText("ATT1234")).toBeInTheDocument();expect(JSON.parse(localStorage.getItem("attentive-urgent-notifications")!)[0].seen).toBe(true);
 localStorage.removeItem("attentive-urgent-notifications");
});
