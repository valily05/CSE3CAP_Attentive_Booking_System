import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";
import type { Day } from "@/lib/types";
import { MonthPicker } from "./MonthPicker";

const slot = (iso: string) => ({ Start: iso, End: iso, Mode: "online" as const, LocationID: "" });
const days: Day[] = [
  { date: "2026-03-09", slots: [] },
  { date: "2026-03-10", slots: [slot("2026-03-10T02:00:00Z"), slot("2026-03-10T03:15:00Z"), slot("2026-03-10T07:00:00Z")] },
  { date: "2026-03-11", slots: [slot("2026-03-11T11:00:00Z")] },
];

function setup(onTime = vi.fn()) {
  renderWithIntl(
    <MonthPicker month="2026-03" days={days} today="2026-03-05" selected={null} onSelect={onTime} onMonth={() => {}} canGoBack={false} />,
  );
  return onTime;
}

describe("MonthPicker", () => {
  it("shows the month as a calendar grid with open times per day", () => {
    setup();
    const grid = screen.getByRole("grid", { name: "March 2026" });
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(within(grid).getByRole("button", { name: "Tuesday 10 March, 3 open times" })).toBeEnabled();
    expect(within(grid).getByRole("button", { name: "Monday 9 March, no open times" })).toBeDisabled();
    expect(within(grid).getByRole("button", { name: "Wednesday 4 March, not bookable" })).toBeDisabled();
  });

  it("starts on the first day with open times and groups its times by part of day", () => {
    setup();
    expect(screen.getByRole("button", { name: "Tuesday 10 March, 3 open times" })).toHaveAttribute("aria-pressed", "true");
    const times = screen.getByRole("region", { name: "Pick a time on Tuesday 10 March" });
    expect(within(within(times).getByRole("group", { name: "Morning" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["09:00", "10:15"]);
    expect(within(within(times).getByRole("group", { name: "Afternoon" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["14:00"]);
  });

  it("switches day and picks a time", async () => {
    const onTime = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Wednesday 11 March, 1 open time" }));
    await user.click(within(screen.getByRole("group", { name: "Evening" })).getByRole("button", { name: "18:00" }));
    expect(onTime).toHaveBeenCalledWith(expect.objectContaining({ Start: "2026-03-11T11:00:00Z" }));
  });

  it("does not offer going back before this month", () => {
    setup();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });
});
