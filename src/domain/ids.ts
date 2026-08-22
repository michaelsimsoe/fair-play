declare const brand: unique symbol;

export type Id<Kind extends string> = string & { readonly [brand]: Kind };

export type TournamentId = Id<"TournamentId">;
export type PlayerId = Id<"PlayerId">;
export type MatchId = Id<"MatchId">;
export type MatchEventId = Id<"MatchEventId">;

export const tournamentId = (value: string): TournamentId => value as TournamentId;
export const playerId = (value: string): PlayerId => value as PlayerId;
export const matchId = (value: string): MatchId => value as MatchId;
export const matchEventId = (value: string): MatchEventId => value as MatchEventId;
