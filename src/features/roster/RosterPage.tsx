import { useState, type FormEvent } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import { Button, Card, EmptyState, PageHeader } from "../../components/ui";
import type { PlayerRecord } from "../../storage/schema";
import { useAsyncData } from "../shared/hooks";
import { formString } from "../shared/forms";

export function RosterPage({ tournamentId }: { tournamentId: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const bundle = await repository.getTournamentBundle(tournamentId);
    if (!bundle) throw new Error("Spilldagen finnes ikke.");
    return bundle;
  }, [repository, tournamentId]);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [working, setWorking] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError(undefined);
    try {
      await action();
      state.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Handlingen feilet.");
    } finally {
      setWorking(false);
    }
  };

  const addPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = formString(data, "name");
    form.reset();
    const input = form.elements.namedItem("name");
    if (input instanceof HTMLInputElement) input.value = "";
    await run(async () => {
      await repository.addPlayer(tournamentId, name);
    });
  };

  const savePlayer = async (
    event: FormEvent<HTMLFormElement>,
    player: PlayerRecord,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      await repository.updatePlayer({
        ...player,
        name: formString(data, "name"),
      });
      setEditing(undefined);
    });
  };

  if (state.status === "loading") {
    return <main className="centered-page">Laster spillere …</main>;
  }
  if (state.status === "error") throw state.error;
  const bundle = state.data;

  const move = async (playerId: string, direction: -1 | 1) => {
    const ids = bundle.players.map((player) => player.id);
    const index = ids.indexOf(playerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await run(() => repository.reorderPlayers(tournamentId, ids));
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow={bundle.tournament.teamName}
        title="Spillere"
        subtitle="Rekkefølgen brukes som stabilt skille når spillerne står likt."
        onBack={() => navigate({ name: "tournament", tournamentId })}
      />

      <Card>
        <form className="add-row" onSubmit={(event) => void addPlayer(event)}>
          <label className="sr-only" htmlFor="new-player">
            Spillernavn
          </label>
          <input
            id="new-player"
            name="name"
            required
            disabled={working}
            autoComplete="off"
            placeholder="Spillernavn"
          />
          <Button type="submit" variant="primary" disabled={working}>
            Legg til
          </Button>
        </form>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </Card>

      {bundle.players.length === 0 ? (
        <EmptyState title="Ingen spillere">
          <p>Legg til minst like mange spillere som skal være på banen.</p>
        </EmptyState>
      ) : (
        <Card>
          <ul className="list roster-list">
            {bundle.players.map((player, index) => (
              <li className="roster-row" key={player.id}>
                {editing === player.id ? (
                  <form
                    className="add-row roster-row__edit"
                    onSubmit={(event) => void savePlayer(event, player)}
                  >
                    <input name="name" required defaultValue={player.name} autoFocus />
                    <Button type="submit" variant="primary">
                      Lagre
                    </Button>
                    <Button variant="quiet" onClick={() => setEditing(undefined)}>
                      Avbryt
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="roster-row__order">
                      <button
                        aria-label={`Flytt ${player.name} opp`}
                        disabled={working || index === 0}
                        onClick={() => void move(player.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Flytt ${player.name} ned`}
                        disabled={working || index === bundle.players.length - 1}
                        onClick={() => void move(player.id, 1)}
                      >
                        ↓
                      </button>
                    </div>
                    <div className="list-row__main">
                      <p className="list-row__title">{player.name}</p>
                      <p className="list-row__meta">
                        {player.active ? "Aktiv" : "Arkivert"}
                      </p>
                    </div>
                    <div className="roster-row__actions">
                      <Button variant="quiet" onClick={() => setEditing(player.id)}>
                        Rediger
                      </Button>
                      <Button
                        variant="quiet"
                        disabled={working}
                        onClick={() =>
                          void run(() =>
                            repository.updatePlayer({
                              ...player,
                              active: !player.active,
                              ...(player.active
                                ? { archivedAtWallMs: Date.now() }
                                : { archivedAtWallMs: undefined }),
                            }),
                          )
                        }
                      >
                        {player.active ? "Arkiver" : "Aktiver"}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={working}
                        onClick={() =>
                          void run(() => repository.removePlayer(player.id))
                        }
                      >
                        Fjern
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Button
        variant="primary"
        full
        disabled={
          bundle.players.filter((player) => player.active).length <
          bundle.tournament.defaultPlayersOnField
        }
        onClick={() => navigate({ name: "matches", tournamentId })}
      >
        Fortsett til kamper
      </Button>
    </main>
  );
}
