import { useState, type FormEvent } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import { Button, Card, Field, PageHeader } from "../../components/ui";
import { requestStoragePersistence } from "../../platform/storagePersistence";
import { formString } from "../shared/forms";

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function CreateTournamentPage() {
  const { repository } = useServices();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const coachLabel = formString(data, "coachLabel").trim();
      const tournament = await repository.createTournament({
        name: formString(data, "name").trim(),
        date: formString(data, "date"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Oslo",
        teamName: formString(data, "teamName").trim(),
        ...(coachLabel ? { coachLabel } : {}),
        defaultMatchDurationMs: Number(data.get("durationMinutes") ?? 12) * 60_000,
        defaultPlayersOnField: Number(data.get("playersOnField") ?? 3),
        defaultMinimumStintMs: Number(data.get("minimumStint") ?? 60) * 1000,
        defaultAlertLeadMs: Number(data.get("alertLead") ?? 10) * 1000,
        fairnessScope: "tournament",
      });
      void requestStoragePersistence();
      navigate({ name: "roster", tournamentId: tournament.id });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Spilldagen kunne ikke lagres.",
      );
      setSaving(false);
    }
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow="Ny"
        title="Opprett spilldag"
        subtitle="Du kan endre alt senere."
        onBack={() => navigate({ name: "home" })}
      />
      <Card>
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <Field label="Navn på spilldagen">
            <input name="name" required defaultValue="Spilldag" autoComplete="off" />
          </Field>
          <Field label="Dato">
            <input name="date" type="date" required defaultValue={localDate()} />
          </Field>
          <Field label="Lag">
            <input
              name="teamName"
              required
              placeholder="For eksempel Krokelvdalen 2"
              autoComplete="organization"
            />
          </Field>
          <Field label="Trener (valgfritt)">
            <input name="coachLabel" autoComplete="name" />
          </Field>
          <div className="form-grid form-grid--two">
            <Field label="Kamplengde (minutter)">
              <input
                name="durationMinutes"
                type="number"
                min="1"
                max="180"
                required
                defaultValue="12"
              />
            </Field>
            <Field label="Spillere på banen">
              <input
                name="playersOnField"
                type="number"
                min="1"
                max="20"
                required
                defaultValue="3"
              />
            </Field>
            <Field label="Ønsket minste periode (sek)">
              <input
                name="minimumStint"
                type="number"
                min="0"
                max="600"
                defaultValue="60"
              />
            </Field>
            <Field label="Varsel før bytte (sek)">
              <input
                name="alertLead"
                type="number"
                min="0"
                max="120"
                defaultValue="10"
              />
            </Field>
          </div>
          {error && (
            <div className="notice" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" full disabled={saving}>
            {saving ? "Lagrer …" : "Fortsett til spillere"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
