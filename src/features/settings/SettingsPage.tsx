import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import { Button, Card, Field, PageHeader } from "../../components/ui";
import { shareOrDownloadJson } from "../../platform/fileShare";
import { isIosSafari, isStandalone } from "../../platform/installMode";
import { requestStoragePersistence } from "../../platform/storagePersistence";
import {
  exportBackup,
  importBackup,
  importSeed,
  ImportValidationError,
} from "../../storage/backup";
import type { TournamentRecord } from "../../storage/schema";
import { useAsyncData } from "../shared/hooks";
import { formString } from "../shared/forms";

export function SettingsPage({ tournamentId }: { tournamentId?: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const [settings, bundle] = await Promise.all([
      repository.getSettings(),
      tournamentId
        ? repository.getTournamentBundle(tournamentId)
        : Promise.resolve(undefined),
    ]);
    return { settings, bundle };
  }, [repository, tournamentId]);
  const fileInput = useRef<HTMLInputElement>(null);
  const importMode = useRef<"copy" | "restore">("copy");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const [clearText, setClearText] = useState("");

  if (state.status === "loading") {
    return <main className="centered-page">Laster innstillinger …</main>;
  }
  if (state.status === "error") throw state.error;
  const { settings, bundle } = state.data;

  const saveAppSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorking(true);
    try {
      const fieldMode = formString(data, "fieldMode");
      if (fieldMode !== "system" && fieldMode !== "light" && fieldMode !== "dark") {
        throw new Error("Ugyldig visningsmodus.");
      }
      await repository.saveSettings({
        ...settings,
        soundEnabled: data.get("soundEnabled") === "on",
        vibrationEnabled: data.get("vibrationEnabled") === "on",
        visualFlashEnabled: data.get("visualFlashEnabled") === "on",
        fieldMode,
      });
      document.documentElement.dataset.theme = fieldMode === "system" ? "" : fieldMode;
      setMessage("Innstillingene er lagret.");
      state.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lagringen feilet.");
    } finally {
      setWorking(false);
    }
  };

  const saveTournament = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bundle) return;
    const data = new FormData(event.currentTarget);
    setWorking(true);
    try {
      const fairnessScope = formString(data, "fairnessScope");
      if (fairnessScope !== "tournament" && fairnessScope !== "match") {
        throw new Error("Ugyldig rettferdighetsomfang.");
      }
      const coachLabel = formString(data, "coachLabel").trim();
      const updatedTournament: TournamentRecord = {
        ...bundle.tournament,
        name: formString(data, "name").trim(),
        date: formString(data, "date"),
        teamName: formString(data, "teamName").trim(),
        defaultMatchDurationMs: Number(data.get("durationMinutes") ?? 12) * 60_000,
        defaultPlayersOnField: Number(data.get("playersOnField") ?? 3),
        defaultMinimumStintMs: Number(data.get("minimumStint") ?? 60) * 1000,
        defaultAlertLeadMs: Number(data.get("alertLead") ?? 10) * 1000,
        fairnessScope,
        ...(coachLabel ? { coachLabel } : {}),
      };
      if (!coachLabel) delete updatedTournament.coachLabel;
      await repository.updateTournament(updatedTournament);
      setMessage("Spilldagen er oppdatert.");
      state.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lagringen feilet.");
    } finally {
      setWorking(false);
    }
  };

  const exportData = async () => {
    setWorking(true);
    try {
      const json = await exportBackup(repository.getDatabase());
      const result = await shareOrDownloadJson(
        json,
        `fairplay-sikkerhetskopi-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setMessage(
        result === "cancelled" ? "Deling ble avbrutt." : "Sikkerhetskopien er klar.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eksporten feilet.");
    } finally {
      setWorking(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setWorking(true);
    setError(undefined);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { format?: unknown };
      if (parsed.format === "fairplay-sideline-seed") {
        if (importMode.current === "restore") {
          throw new Error(
            "Full gjenoppretting krever en FairPlay-sikkerhetskopi, ikke en eksempelfil.",
          );
        }
        await importSeed(text, repository.getDatabase());
      } else {
        await importBackup(text, importMode.current, repository.getDatabase());
      }
      setMessage(
        importMode.current === "restore"
          ? "Alle data ble gjenopprettet fra sikkerhetskopien."
          : "Dataene ble importert som en ny kopi.",
      );
      if (importMode.current === "restore") {
        navigate({ name: "home" }, true);
      }
    } catch (caught) {
      setError(
        caught instanceof ImportValidationError
          ? `${caught.message} ${caught.issues.slice(0, 3).join(" · ")}`
          : caught instanceof Error
            ? caught.message
            : "Importen feilet.",
      );
    } finally {
      setWorking(false);
    }
  };

  const clearAll = async () => {
    if (clearText !== "SLETT") return;
    setWorking(true);
    try {
      await repository.clearAll();
      navigate({ name: "home" }, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Slettingen feilet.");
      setWorking(false);
    }
  };

  const archiveTournament = async () => {
    if (!bundle) return;
    setWorking(true);
    try {
      await repository.archiveTournament(bundle.tournament.id);
      navigate({ name: "home" }, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Arkiveringen feilet.");
      setWorking(false);
    }
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow={bundle ? bundle.tournament.teamName : "FairPlay"}
        title="Innstillinger og data"
        subtitle="Alt lagres lokalt på denne enheten."
        onBack={() =>
          navigate(
            bundle
              ? { name: "tournament", tournamentId: bundle.tournament.id }
              : { name: "home" },
          )
        }
      />

      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      <Card>
        <h2>Varsler og visning</h2>
        <form className="form-grid" onSubmit={(event) => void saveAppSettings(event)}>
          <label className="toggle-row">
            <span>
              <strong>Lydvarsel</strong>
              <small>En lokal tone når et bytte er klart.</small>
            </span>
            <input
              name="soundEnabled"
              type="checkbox"
              defaultChecked={settings.soundEnabled}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Vibrasjon når støttet</strong>
              <small>iPhone støtter vanligvis ikke nettvibrasjon.</small>
            </span>
            <input
              name="vibrationEnabled"
              type="checkbox"
              defaultChecked={settings.vibrationEnabled}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Tydelig visuelt varsel</strong>
              <small>Farge og tekst brukes sammen.</small>
            </span>
            <input
              name="visualFlashEnabled"
              type="checkbox"
              defaultChecked={settings.visualFlashEnabled}
            />
          </label>
          <Field label="Visning">
            <select name="fieldMode" defaultValue={settings.fieldMode}>
              <option value="system">Følg telefonen</option>
              <option value="light">Lys feltmodus</option>
              <option value="dark">Mørk modus</option>
            </select>
          </Field>
          <Button type="submit" variant="primary" disabled={working}>
            Lagre innstillinger
          </Button>
        </form>
      </Card>

      {bundle && (
        <Card>
          <h2>Standarder for spilldagen</h2>
          <form className="form-grid" onSubmit={(event) => void saveTournament(event)}>
            <Field label="Navn">
              <input name="name" required defaultValue={bundle.tournament.name} />
            </Field>
            <Field label="Lag">
              <input
                name="teamName"
                required
                defaultValue={bundle.tournament.teamName}
              />
            </Field>
            <div className="form-grid form-grid--two">
              <Field label="Dato">
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={bundle.tournament.date}
                />
              </Field>
              <Field label="Trener (valgfritt)">
                <input name="coachLabel" defaultValue={bundle.tournament.coachLabel} />
              </Field>
            </div>
            <div className="form-grid form-grid--two">
              <Field label="Kamplengde (min)">
                <input
                  name="durationMinutes"
                  type="number"
                  min="1"
                  required
                  defaultValue={bundle.tournament.defaultMatchDurationMs / 60_000}
                />
              </Field>
              <Field label="Spillere på banen">
                <input
                  name="playersOnField"
                  type="number"
                  min="1"
                  required
                  defaultValue={bundle.tournament.defaultPlayersOnField}
                />
              </Field>
              <Field label="Minste periode (sek)">
                <input
                  name="minimumStint"
                  type="number"
                  min="0"
                  defaultValue={bundle.tournament.defaultMinimumStintMs / 1000}
                />
              </Field>
              <Field label="Varsel før bytte (sek)">
                <input
                  name="alertLead"
                  type="number"
                  min="0"
                  defaultValue={bundle.tournament.defaultAlertLeadMs / 1000}
                />
              </Field>
            </div>
            <Field label="Rettferdighet beregnes for">
              <select
                name="fairnessScope"
                defaultValue={bundle.tournament.fairnessScope}
              >
                <option value="tournament">Hele spilldagen</option>
                <option value="match">Hver kamp for seg</option>
              </select>
            </Field>
            <Button type="submit" variant="primary" disabled={working}>
              Lagre standarder
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h2>Sikkerhetskopi</h2>
        <p className="muted">
          Nettleserlagring kan slettes av deg eller operativsystemet. Eksporter en
          JSON-fil etter spilldagen.
        </p>
        <div className="button-row">
          <Button disabled={working} onClick={() => void exportData()}>
            Eksporter sikkerhetskopi
          </Button>
          <Button
            disabled={working}
            onClick={() => {
              importMode.current = "copy";
              fileInput.current?.click();
            }}
          >
            Importer som kopi
          </Button>
          <Button
            variant="danger"
            disabled={working}
            onClick={() => {
              if (
                window.confirm(
                  "Gjenoppretting erstatter alle lokale FairPlay-data. Fortsette?",
                )
              ) {
                importMode.current = "restore";
                fileInput.current?.click();
              }
            }}
          >
            Gjenopprett alt
          </Button>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importFile(event)}
          />
          <Button
            disabled={working}
            onClick={() =>
              void requestStoragePersistence().then((status) =>
                setMessage(
                  status === "granted" || status === "already-persistent"
                    ? "Nettleseren har gitt varig lagring."
                    : "Varig lagring kunne ikke garanteres. Bruk sikkerhetskopi.",
                ),
              )
            }
          >
            Be om varig lagring
          </Button>
        </div>
      </Card>

      <Card>
        <h2>Installer på iPhone</h2>
        {isStandalone() ? (
          <p>FairPlay kjører som en installert Hjem-skjerm-app.</p>
        ) : isIosSafari() ? (
          <ol>
            <li>Åpne Del-menyen i Safari.</li>
            <li>Velg «Legg til på Hjem-skjermen».</li>
            <li>Åpne FairPlay fra det nye ikonet.</li>
          </ol>
        ) : (
          <p className="muted">
            Åpne siden i Safari på iPhone, trykk Del og velg «Legg til på
            Hjem-skjermen».
          </p>
        )}
        <p className="notice">
          Hold appen synlig under kampen. Nettleseren kan ikke garantere lyd eller
          varsler når telefonen er låst eller appen er i bakgrunnen.
        </p>
      </Card>

      {bundle && (
        <Card className="card--warning">
          <h2>Arkiver spilldagen</h2>
          <p>Skjuler spilldagen fra forsiden uten å slette historikken.</p>
          <Button
            variant="danger"
            disabled={working}
            onClick={() => void archiveTournament()}
          >
            Arkiver {bundle.tournament.name}
          </Button>
        </Card>
      )}

      <Card className="card--danger">
        <h2>Slett alle lokale data</h2>
        <p>
          Dette kan ikke angres. Skriv <strong>SLETT</strong> for å låse opp knappen.
        </p>
        <div className="add-row">
          <input
            aria-label="Bekreft sletting"
            value={clearText}
            onChange={(event) => setClearText(event.currentTarget.value)}
          />
          <Button
            variant="danger"
            disabled={working || clearText !== "SLETT"}
            onClick={() => void clearAll()}
          >
            Slett alt
          </Button>
        </div>
      </Card>
    </main>
  );
}
