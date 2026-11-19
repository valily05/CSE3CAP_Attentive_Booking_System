import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import { PsychologistSearch } from "./PsychologistSearch";

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
  it("shows each psychologist with their open times for the next seven days", async () => {
    api(() => [ayu]);
    renderWithIntl(<PsychologistSearch />);

    const row = (await screen.findByRole("heading", { name: "Ayu Lestari" })).closest("li")!;
    const grid = within(row).getByRole("table", { name: "Open times for Ayu Lestari in the next 7 days" });
    expect(within(grid).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Tue 3", "Wed 4", "Thu 5", "Fri 6", "Sat 7", "Sun 8", "Mon 9"]);
    expect(within(grid).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "–", "–", "2", "4", "–", "3"]);
    expect(within(row).getByText("Next open Tuesday 3 March, 09:00 WIB")).toBeInTheDocument();
    expect(within(row).getByText("Meets in BSD (Tangerang)")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "See times for Ayu Lestari" })).toHaveAttribute("href", "/psychologists/p1");
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
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Ayu Lestari", "Budi Santoso", "Citra Wijaya"]);
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
    expect(await screen.findByText("Waktu kosong berikutnya Selasa, 3 Maret, 09.00 WIB")).toBeInTheDocument();
  });
});
