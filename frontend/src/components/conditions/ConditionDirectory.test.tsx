import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";
import { ConditionDirectory } from "./ConditionDirectory";

describe("ConditionDirectory", () => {
  it("searches aliases, links to guides, and recovers from an empty search", async () => {
    renderWithIntl(<ConditionDirectory/>);
    const user = userEvent.setup();
    const input = screen.getByRole("searchbox");
    await user.type(input, "attention deficit");
    expect(screen.getByRole("link", {name:/ADHD/})).toHaveAttribute("href", "/conditions/adhd");
    expect(screen.queryByRole("link", {name:/Bipolar/})).not.toBeInTheDocument();
    await user.clear(input); await user.type(input, "unknown condition");
    expect(screen.getByText(/No guides match/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name:"Clear filters"}));
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });
  it("filters by first letter and clears the letter when typing a new search", async () => {
    renderWithIntl(<ConditionDirectory/>); const user=userEvent.setup();
    await user.click(screen.getByRole("button", {name:/^D$/}));
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", {name:/Depression/})).toHaveAttribute("href", "/conditions/depression");
    await user.type(screen.getByRole("searchbox"), "ADHD");
    expect(screen.getByRole("link", {name:/ADHD/})).toBeInTheDocument();
  });
});
