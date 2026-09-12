import { describe, expect, it } from "vitest";
import type { MatchRecord } from "../../storage/schema";
import { participationPauseMatchIds } from "./participationPause";

const matches = ["past", "current", "next", "last"].map((id, order): MatchRecord => ({
  id,
  tournamentId: "tournament",
  order,
  plannedDurationMs: 720_000,
  playersOnField: 3,
  minimumStintMs: 60_000,
  alertLeadMs: 10_000,
  eligiblePlayerIds: [],
  status: order === 0 ? "completed" : order === 1 ? "running" : "scheduled",
  createdAtWallMs: 1,
  updatedAtWallMs: 1,
}));

describe("participation pause scope", () => {
  it("selects only the current match", () => {
    expect(participationPauseMatchIds(matches, matches[1]!, "current")).toEqual([
      "current",
    ]);
  });

  it("selects the current and next playable match", () => {
    expect(participationPauseMatchIds(matches, matches[1]!, "through-next")).toEqual([
      "current",
      "next",
    ]);
  });

  it("selects every remaining playable match for the rest of the day", () => {
    expect(participationPauseMatchIds(matches, matches[1]!, "rest-day")).toEqual([
      "current",
      "next",
      "last",
    ]);
  });
});
