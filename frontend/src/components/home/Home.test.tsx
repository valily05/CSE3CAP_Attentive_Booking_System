import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, within } from "@testing-library/react";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import { Home } from "./Home";
import userEvent from "@testing-library/user-event";

beforeEach(()=>{vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener(){},removeEventListener(){}}));});
afterEach(()=>{vi.unstubAllGlobals();});

describe("Home", () => {
  it("shows a non-interactive booking demonstration and preserves the real browsing actions", async () => {
    const person={id:"p1",name:"Ayu Lestari",title:"M.Psi., Psikolog",specialty:"Relationships",bio:"",photoUrl:"",sessionTypes:["video"],locationIds:[],serviceIds:[],nextOpen:"2026-03-03T02:00:00Z",week:[{date:"2026-03-03",count:3}]};
    server.use(
      http.get("*/api/catalog",()=>HttpResponse.json({locations:[],services:[]})),
      http.get("*/api/psychologists",()=>HttpResponse.json({psychologists:[person,{...person,id:"p2",name:"Budi Santoso",nextOpen:"2026-03-05T02:00:00Z"}]})),
    );
    renderWithIntl(<Home/>); const user=userEvent.setup();
    const preview=screen.getByRole("img",{name:/Animated booking demonstration/});
    expect(within(preview).getByText("Budi Santoso, M.Psi., Psikolog")).toBeInTheDocument();
    expect(await within(preview).findByText("Tuesday 3 March, 09:00 WIB")).toBeInTheDocument();
    expect(within(preview).getByText("Practice experience > 6 years")).toBeInTheDocument();
    expect(preview.querySelector('[aria-disabled="true"]')).toBeInTheDocument();
    expect(preview.querySelectorAll("a,button,input,select,[tabindex]")).toHaveLength(0);
    expect(screen.getByText("First session is")).toBeInTheDocument();
    expect(screen.getByText("Free",{exact:true})).toBeInTheDocument();
    expect(within(preview).getByText("09:00 WIB",{exact:true})).toBeInTheDocument();
    await user.click(screen.getByRole("link",{name:"Understand what you’re feeling"}));
    expect(screen.getByRole("searchbox",{name:"Explore topics for you"})).toBeInTheDocument();
    await user.click(screen.getByRole("link",{name:"Find your psychologist"}));
    expect(screen.getByRole("group",{name:"Who is it for?"})).toBeVisible();
  });
  it("explains how booking works and reassures about privacy near the search", async () => {
    server.use(
      http.get("*/api/catalog", () => HttpResponse.json({ locations: [], services: [] })),
      http.get("*/api/psychologists", () => HttpResponse.json({ psychologists: [] })),
    );
    renderWithIntl(<Home />);

    const how = screen.getByRole("region", { name: "How urgent booking works" });
    expect(within(how).getAllByRole("tab")).toHaveLength(4);
    expect(within(how).getByRole("heading",{name:"Only your name and email."})).toBeInTheDocument();
    const user=userEvent.setup();await user.click(within(how).getByRole("button",{name:"In person"}));await user.click(within(how).getByRole("tab",{name:/Save your QR pass/}));
    expect(within(how).getByRole("heading",{name:"Keep your booking pass close."})).toBeInTheDocument();
    expect(within(how).getByRole("link",{name:"Start urgent booking"})).toHaveAttribute("href","/urgent-scheduling");
    await user.click(within(how).getByRole("button",{name:"Online"}));
    await user.click(within(how).getByRole("tab",{name:/Send code via WhatsApp/}));
    expect(within(how).getByRole("heading",{name:"Send your code to Attentive."})).toBeInTheDocument();
    await user.click(within(how).getByRole("button",{name:"In person"}));
    await user.click(within(how).getByRole("tab",{name:/Check in with admin/}));
    expect(within(how).getByRole("heading",{name:"Let admin scan your QR code."})).toBeInTheDocument();
    expect(screen.getByText(/What you talk about stays between you and your psychologist/)).toBeInTheDocument();
  });
});
