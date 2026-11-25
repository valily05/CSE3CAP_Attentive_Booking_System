import { describe, it, expect } from "vitest";
import { CONDITIONS, matchesCondition } from "./conditions";

describe("condition specialty matching", () => {
  it("matches explicit specialties in either language without partial-word matches", () => {
    const anxiety=CONDITIONS.find(c=>c.slug==="anxiety")!;
    expect(matchesCondition({specialty:"Anxiety, relationships"}, anxiety)).toBe(true);
    expect(matchesCondition({specialty:"Gangguan kecemasan"}, anxiety)).toBe(true);
    expect(matchesCondition({specialty:"Relationships"}, anxiety)).toBe(false);
    expect(matchesCondition({specialty:"nonanxiety"}, anxiety)).toBe(false);
    expect(matchesCondition({specialty:""}, CONDITIONS[0])).toBe(false);
  });
});
