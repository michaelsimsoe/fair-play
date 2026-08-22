import { useState, type FormEvent } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import { formatDuration, formatMatchTime } from "../../components/format";
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  StatusPill,
} from "../../components/ui";
import type { MatchRecord } from "../../storage/schema";
import { useAsyncData } from "../shared/hooks";
import { formString } from "../shared/forms";

const statusText = {
  scheduled: "Planlagt",
  ready: "Klar",
  running: "Pågår",
  paused: "Pause",
  completed: "Ferdig",
  abandoned: "Avbrutt",
} as const;

export function MatchesPage({ tournamentId }: { tournamentId: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const bundle = await repository.getTournamentBundle(tournamentId);
    if (!bundle) throw new Error("Spilldagen finnes ikke.");
    return bundle;
  }, [repository, tournamentId]);
  const [editing, setEditing] = useState<MatchRecord | "new">();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError(undefined);
    try {
      await action();
      setEditing(undefined);
      state.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Handlingen feilet.");
    } finally {
      setWorking(false);
    }
  };

  if (state.status === "loading") {
    return <main className="centered-page">Laster kamper …</main>;
  }
  if (state.status === "error") throw state.error;
  const bundle = state.data;

  const move = async (matchId: string, direction: -1 | 1) => {
    const ids = bundle.matches.map((match) => match.id);
    const index = ids.indexOf(matchId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await run(() => repository.reorderMatches(tournamentId, ids));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const scheduledStartLocal = formString(data, "scheduledStartLocal");
    const opponent = formString(data, "opponent").trim();
    const pitch = formString(data, "pitch").trim();
    const notes = formString(data, "notes").trim();
    const values = {
      ...(scheduledStartLocal ? { scheduledStartLocal } : {}),
      ...(opponent ? { opponent } : {}),
      ...(pitch ? { pitch } : {}),
      ...(notes ? { notes } : {}),
      plannedDurationMs: Number(data.get("durationMinutes")) * 60_000,
      playersOnField: Number(data.get("playersOnField")),
    };
    if (editing === "new") {
      await run(async () => {
        await repository.addMatch(bundle.tournament, values);
      });
    } else if (editing) {
      const updated: MatchRecord = {
        ...editing,
        plannedDurationMs: values.plannedDurationMs,
        playersOnField: values.playersOnField,
      };
      if (scheduledStartLocal) updated.scheduledStartLocal = scheduledStartLocal;
      else delete updated.scheduledStartLocal;
      if (opponent) updated.opponent = opponent;
      else delete updated.opponent;
      if (pitch) updated.pitch = pitch;
      else delete updated.pitch;
      if (notes) updated.notes = notes;
      else delete updated.notes;
      await run(() => repository.updateMatch(updated));
    }
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow={bundle.tournament.teamName}
        title="Kamper"
        subtitle="Planlegg eller legg til kamper underveis."
        onBack={() => navigate({ name: "tournament", tournamentId })}
        action={
          <Button variant="primary" onClick={() => setEditing("new")}>
            Ny kamp
          </Button>
        }
      />

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {bundle.matches.length === 0 ? (
        <EmptyState
          title="Ingen kamper"
          action={<Button onClick={() => setEditing("new")}>Legg til kamp</Button>}
        >
          <p>Legg inn første motstander og tidspunkt.</p>
        </EmptyState>
      ) : (
        <div className="list">
          {bundle.matches.map((match, index) => (
            <Card key={match.id}>
              <div className="match-row">
                <button
                  className="match-row__open"
                  onClick={() =>
                    navigate(
                      match.status === "completed"
                        ? { name: "match-summary", matchId: match.id }
                        : match.status === "running" || match.status === "paused"
                          ? { name: "live", matchId: match.id }
                          : { name: "pre-match", matchId: match.id },
                    )
                  }
                >
                  <span>
                    <small>
                      {formatMatchTime(match.scheduledStartLocal)}
                      {match.pitch ? ` · Bane ${match.pitch}` : ""}
                    </small>
                    <strong>mot {match.opponent || "motstander ikke satt"}</strong>
                    <small>
                      {formatDuration(match.plannedDurationMs)} · {match.playersOnField}{" "}
                      på banen
                    </small>
                  </span>
                  <StatusPill
                    tone={
                      match.status === "running"
                        ? "positive"
                        : match.status === "paused"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {statusText[match.status]}
                  </StatusPill>
                </button>
                {(match.status === "scheduled" || match.status === "ready") && (
                  <div className="button-row match-row__actions">
                    <Button
                      variant="quiet"
                      disabled={working || index === 0}
                      aria-label={`Flytt kampen mot ${match.opponent || "motstander"} opp`}
                      onClick={() => void move(match.id, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="quiet"
                      disabled={working || index === bundle.matches.length - 1}
                      aria-label={`Flytt kampen mot ${match.opponent || "motstander"} ned`}
                      onClick={() => void move(match.id, 1)}
                    >
                      ↓
                    </Button>
                    <Button variant="quiet" onClick={() => setEditing(match)}>
                      Rediger
                    </Button>
                    <Button
                      variant="quiet"
                      disabled={working}
                      onClick={() =>
                        void run(async () => {
                          await repository.duplicateMatch(match.id);
                        })
                      }
                    >
                      Dupliser
                    </Button>
                    <Button
                      variant="danger"
                      disabled={working}
                      onClick={() =>
                        void run(() => repository.deleteUnstartedMatch(match.id))
                      }
                    >
                      Slett
                    </Button>
                  </div>
                )}
                {(match.status === "completed" || match.status === "abandoned") && (
                  <div className="button-row match-row__actions">
                    <Button
                      variant="danger"
                      disabled={working}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Nullstille kampen? Hele hendelsesloggen og spilletiden for denne kampen slettes.",
                          )
                        ) {
                          void run(() => repository.resetMatch(match.id));
                        }
                      }}
                    >
                      Nullstill kamp
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-form-title"
          >
            <h2 id="match-form-title">
              {editing === "new" ? "Ny kamp" : "Rediger kamp"}
            </h2>
            <form className="form-grid" onSubmit={(event) => void save(event)}>
              <Field label="Tidspunkt">
                <input
                  name="scheduledStartLocal"
                  type="datetime-local"
                  defaultValue={editing === "new" ? "" : editing.scheduledStartLocal}
                />
              </Field>
              <Field label="Motstander">
                <input
                  name="opponent"
                  autoComplete="off"
                  defaultValue={editing === "new" ? "" : editing.opponent}
                />
              </Field>
              <Field label="Bane">
                <input
                  name="pitch"
                  inputMode="numeric"
                  defaultValue={editing === "new" ? "" : editing.pitch}
                />
              </Field>
              <div className="form-grid form-grid--two">
                <Field label="Kamplengde (min)">
                  <input
                    name="durationMinutes"
                    type="number"
                    min="1"
                    required
                    defaultValue={
                      (editing === "new"
                        ? bundle.tournament.defaultMatchDurationMs
                        : editing.plannedDurationMs) / 60_000
                    }
                  />
                </Field>
                <Field label="Spillere på banen">
                  <input
                    name="playersOnField"
                    type="number"
                    min="1"
                    required
                    defaultValue={
                      editing === "new"
                        ? bundle.tournament.defaultPlayersOnField
                        : editing.playersOnField
                    }
                  />
                </Field>
              </div>
              <Field label="Notater">
                <textarea
                  name="notes"
                  defaultValue={editing === "new" ? "" : editing.notes}
                />
              </Field>
              <div className="dialog__actions">
                <Button type="submit" variant="primary" disabled={working}>
                  {working ? "Lagrer …" : "Lagre kamp"}
                </Button>
                <Button variant="quiet" onClick={() => setEditing(undefined)}>
                  Avbryt
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
