import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

type Tree = { [k: string]: string | Tree };

function flatten(t: Tree, prefix = ""): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

// ICU arguments only: "{name}" or "{count, plural, ...}", not plural branch text.
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe("message catalogs", () => {
  const e = flatten(en as Tree);
  const i = flatten(id as Tree);

  it("English and Indonesian have exactly the same keys", () => {
    expect(Object.keys(i).sort()).toEqual(Object.keys(e).sort());
  });

  it("every translation uses the same placeholders as English", () => {
    for (const key of Object.keys(e)) {
      expect({ key, p: placeholders(i[key] ?? "") }).toEqual({ key, p: placeholders(e[key]) });
    }
  });

  it("every API error code has a message", () => {
    const codes = [
      "bad_request", "json_required", "unauthenticated", "bad_credentials", "email_not_verified", "forbidden",
      "account_locked", "change_window_closed", "slot_unavailable", "channel_required", "service_not_offered",
      "privacy_required", "name_required", "invalid_email", "invalid_phone", "weak_password", "in_past",
      "too_soon", "invalid_transition", "session_not_started", "invalid_range", "overlapping_hours",
      "location_required", "online_has_location", "email_taken", "not_found", "slot_taken", "not_changeable",
      "invalid_setting", "internal", "network",
    ];
    for (const c of codes) expect(e, c).toHaveProperty(`errors.${c}`);
  });
});
