import { describe, expect, it } from "vitest";
import type { MatchRecord, TournamentRecord } from "../../storage/schema";
import {
  effectiveSubstitutionInterval,
  parseSubstitutionInterval,
} from "./substitutionRhythm";

const tournament = {
  defaultSubstitutionIntervalMs: 120_000,
} as TournamentRecord;
const match = {} as MatchRecord;

describe("substitution rhythm", () => {
  it("inherits the match-day rhythm", () => {
    expect(effectiveSubstitutionInterval(match, tournament)).toBe(120_000);
  });

  it("allows adaptive and fixed per-match overrides", () => {
    expect(
      effectiveSubstitutionInterval(
        { ...match, substitutionIntervalMs: null },
        tournament,
      ),
    ).toBeUndefined();
    expect(
      effectiveSubstitutionInterval(
        { ...match, substitutionIntervalMs: 180_000 },
        tournament,
      ),
    ).toBe(180_000);
  });

  it("parses fixed options safely", () => {
    expect(parseSubstitutionInterval("120000")).toBe(120_000);
    expect(parseSubstitutionInterval("")).toBeUndefined();
    expect(() => parseSubstitutionInterval("nope")).toThrow(/bytterytme/);
  });
});
