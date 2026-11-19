import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, within } from "@testing-library/react";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import { Home } from "./Home";

describe("Home", () => {
  it("explains how booking works and reassures about privacy near the search", async () => {
    server.use(
      http.get("*/api/catalog", () => HttpResponse.json({ locations: [], services: [] })),
      http.get("*/api/psychologists", () => HttpResponse.json({ psychologists: [] })),
    );
    renderWithIntl(<Home />);

    const how = screen.getByRole("region", { name: "How booking works" });
    expect(within(how).getAllByRole("listitem")).toHaveLength(3);
    expect(within(how).getByText("Find your fit")).toBeInTheDocument();
    expect(screen.getByText(/What you talk about stays between you and your psychologist/)).toBeInTheDocument();
  });
});
