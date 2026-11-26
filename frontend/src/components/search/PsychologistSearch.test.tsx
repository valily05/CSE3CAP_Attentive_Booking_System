import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import { PsychologistSearch } from "./PsychologistSearch";
import { CONDITIONS } from "@/lib/conditions";

const catalog = {
  locations: [
    { id: "bsd", name: "BSD (Tangerang)", active: true },
    { id: "jakarta", name: "Jakarta", active: true },
  ],
  services: [
    { id: "adult-60", name: "Adult counseling", lengthMinutes: 60, ageGroup: "adult", active: true },
    { id: "child-90", name: "Child & teen counseling", lengthMinutes: 90, ageGroup: "child_teen", active: true },
  ],
};

const week = (counts: number[]) => counts.map((count, i) => ({ date: `2026-03-0${3 + i}`, count }));
const ayu = {
  id: "p1", name: "Ayu Lestari", title: "M.Psi., Psikolog", specialty: "Relationships", bio: "", photoUrl: "",
  sessionTypes: ["video", "in_person"], locationIds: ["bsd"], serviceIds: ["adult-60"],
  nextOpen: "2026-03-03T02:00:00Z", // Tuesday 09:00 WIB
  week: week([1, 0, 0, 2, 4, 0, 3]),
};
const budi = { ...ayu, id: "p2", name: "Budi Santoso", nextOpen: "2026-03-05T02:00:00Z", week: week([0, 0, 1, 0, 0, 0, 0]) };
const citra = { ...ayu, id: "p3", name: "Citra Wijaya", nextOpen: null, week: week([0, 0, 0, 0, 0, 0, 0]) };

function api(results: (q: URLSearchParams) => unknown[]) {
  const queries: string[] = [];
  server.use(
    http.get("*/api/catalog", () => HttpResponse.json(catalog)),
    http.get("*/api/psychologists", ({ request }) => {
      const q = new URL(request.url).searchParams;
      queries.push(q.toString());
      return HttpResponse.json({ psychologists: results(q) });
    }),
  );
  return queries;
}

describe("PsychologistSearch", () => {
  it("pages five profiles at a time and resets to page one when filters or page size change",async()=>{
    Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:()=>{}});
    api(()=>Array.from({length:12},(_,i)=>({...ayu,id:String(i),name:`Psychologist ${String(i+1).padStart(2,"0")}`})));
    renderWithIntl(<PsychologistSearch/>);const user=userEvent.setup();await screen.findByRole("heading",{name:"Psychologist 01"});expect(screen.getAllByRole("heading",{level:3})).toHaveLength(5);
    await user.click(screen.getByRole("button",{name:"Next page"}));expect(screen.getByRole("heading",{name:"Psychologist 06"})).toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"Page 3"}));expect(screen.getAllByRole("heading",{level:3})).toHaveLength(2);expect(screen.getByRole("button",{name:"Next page"})).toBeDisabled();
    await user.type(screen.getByRole("searchbox"),"01");expect(screen.getAllByRole("heading",{level:3})).toHaveLength(1);
    await user.click(screen.getByRole("button",{name:"Clear name search"}));expect(screen.getByRole("button",{name:"Page 1"})).toHaveAttribute("aria-current","page");
    await user.selectOptions(screen.getByRole("combobox",{name:"Profiles per page"}),"10");expect(screen.getAllByRole("heading",{level:3})).toHaveLength(10);
    expect(screen.queryByText("Sign in to book")).not.toBeInTheDocument();
  });
  it("does not match an adult-only service when the audience is children and teens",async()=>{
    api(()=>[ayu]);renderWithIntl(<PsychologistSearch/>);const user=userEvent.setup();await screen.findByRole("heading",{name:"Ayu Lestari"});
    await user.click(screen.getByRole("button",{name:"Children & teens"}));
    await user.click(screen.getByText("All services",{selector:"summary span"}));await user.click(screen.getByRole("button",{name:"Adult counseling"}));
    expect(screen.queryByRole("heading",{name:"Ayu Lestari"})).not.toBeInTheDocument();
  });
  it("combines a case-insensitive name search with published areas and clears both",async()=>{
    api(()=>[ayu,{...budi,directoryMetadata:{areasOfExperience:["complex and childhood trauma"]}}]);renderWithIntl(<PsychologistSearch/>);const user=userEvent.setup();
    await screen.findByRole("heading",{name:"Ayu Lestari"});
    await user.type(screen.getByRole("searchbox",{name:"Search by name"}),"  BUDI  ");
    expect(screen.getByRole("heading",{name:"Budi Santoso"})).toBeInTheDocument();expect(screen.queryByRole("heading",{name:"Ayu Lestari"})).not.toBeInTheDocument();
    await user.click(screen.getByText("All areas of experience",{selector:"summary span"}));
    await user.click(screen.getByRole("button",{name:"Complex trauma"}));
    expect(screen.getByRole("heading",{name:"Budi Santoso"})).toBeInTheDocument();
    await user.click(screen.getByText("Complex trauma",{selector:"summary span"}));
    await user.click(screen.getByRole("button",{name:"ADHD"}));
    expect(screen.queryByRole("heading",{name:"Budi Santoso"})).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button",{name:"Clear filters"})[0]);expect(screen.getByRole("searchbox")).toHaveValue("");expect(screen.getByText("All areas of experience",{selector:"summary span"})).toBeInTheDocument();expect(screen.getAllByRole("heading",{level:3})).toHaveLength(2);
  });
  it("filters database profiles with the service menu and experience pills",async()=>{
    const imported={...ayu,id:"db-import",name:"Imported Psychologist",directoryMetadata:{experienceMinYears:11,experienceLabel:">10 years"}};
    api(()=>[ayu,imported]);renderWithIntl(<PsychologistSearch includeOfficial/>);const user=userEvent.setup();
    await screen.findByRole("heading",{name:"Imported Psychologist"});
    await user.click(screen.getByText("All services",{selector:"summary span"}));
    await user.click(screen.getByRole("button",{name:"Adult counseling"}));
    await user.click(screen.getByRole("button",{name:"10+ years"}));
    expect(screen.queryByRole("heading",{name:"Ayu Lestari"})).not.toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Imported Psychologist"})).toBeInTheDocument();
    expect(screen.queryByText(/Official profiles show/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link",{name:/View official profile/})).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button",{name:"Clear filters"})[0]);
    expect(await screen.findByRole("heading",{name:"Ayu Lestari"})).toBeInTheDocument();
  });
  it("only suggests explicit condition specialties and preserves the booking link", async () => {
    api(() => [ayu, {...budi, specialty:"ADHD, anxiety"}]);
    renderWithIntl(<PsychologistSearch condition={CONDITIONS[0]}/>);
    expect(await screen.findByRole("heading", {name:"Budi Santoso"})).toBeInTheDocument();
    expect(screen.queryByRole("heading", {name:"Ayu Lestari"})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name:"Budi Santoso"})).toHaveAttribute("href", "/psychologists/p2");
  });
  it("does not present unrelated clinicians as condition matches", async () => {
    api(() => [ayu]);
    renderWithIntl(<PsychologistSearch condition={CONDITIONS[0]}/>);
    expect(await screen.findByText(/No psychologists currently list a matching specialty/)).toBeInTheDocument();
    expect(screen.getByRole("link", {name:"Browse all psychologists"})).toHaveAttribute("href", "/");
    expect(screen.queryByRole("heading", {name:"Ayu Lestari"})).not.toBeInTheDocument();
  });
  it("hides schedules and next-open details from directory cards", async () => {
    api(()=>[ayu]);renderWithIntl(<PsychologistSearch/>);
    const row=(await screen.findByRole("heading",{name:"Ayu Lestari"})).closest("li")!;
    expect(within(row).queryByRole("table")).not.toBeInTheDocument();
    expect(within(row).queryByText(/Next open/)).not.toBeInTheDocument();
    expect(within(row).getByRole("link",{name:"Ayu Lestari"})).toHaveAttribute("href","/psychologists/p1");
  });

  it("filters with plain buttons and sends every choice to the API", async () => {
    const queries = api(() => [ayu]);
    renderWithIntl(<PsychologistSearch />);
    const user = userEvent.setup();

    const who = await screen.findByRole("group", { name: "Who is it for?" });
    await user.click(within(who).getByRole("button", { name: "Children & teens" }));
    await user.click(within(screen.getByRole("group", { name: "How to meet" })).getByRole("button", { name: "In person" }));
    await user.click(within(screen.getByRole("group", { name: "Where" })).getByRole("button", { name: "BSD (Tangerang)" }));

    await waitFor(() => expect(queries.at(-1)).toBe("ageGroup=child_teen&mode=in_person&location=bsd"));
    expect(within(who).getByRole("button", { name: "Children & teens" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers places from the catalog, and none for online sessions", async () => {
    api(() => [ayu]);
    renderWithIntl(<PsychologistSearch />);
    const user = userEvent.setup();

    expect(await within(await screen.findByRole("group", { name: "Where" })).findByRole("button", { name: "Jakarta" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "How to meet" })).getByRole("button", { name: "Online" }));
    expect(screen.queryByRole("group", { name: "Where" })).not.toBeInTheDocument();
  });

  it("lists the soonest available first", async () => {
    api(() => [citra, budi, ayu]);
    renderWithIntl(<PsychologistSearch />);
    await screen.findByRole("heading", { name: "Ayu Lestari" });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.replace(/→$/, ""))).toEqual(["Ayu Lestari", "Budi Santoso", "Citra Wijaya"]);
  });

  it("shows a kind message and a way out when nobody matches", async () => {
    const queries = api((q) => (q.get("ageGroup") ? [] : [ayu]));
    renderWithIntl(<PsychologistSearch />);
    const user = userEvent.setup();

    await user.click(within(await screen.findByRole("group", { name: "Who is it for?" })).getByRole("button", { name: "Children & teens" }));
    expect(await screen.findByText(/No one matches all of that right now/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(await screen.findByRole("heading", { name: "Ayu Lestari" })).toBeInTheDocument();
    expect(queries.at(-1)).toBe("");
  });

  it("reads naturally in Indonesian", async () => {
    api(() => [ayu]);
    renderWithIntl(<PsychologistSearch />, "id");
    expect(await screen.findByRole("group", { name: "Untuk siapa?" })).toBeInTheDocument();
    expect(await screen.findByRole("link",{name:"Ayu Lestari"})).toBeInTheDocument();
  });
});
