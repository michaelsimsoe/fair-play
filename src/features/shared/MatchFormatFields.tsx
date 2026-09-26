import { useState } from "react";
import {
  MATCH_FORMATS,
  formationById,
  formationsFor,
  goalkeeperSlot,
  type GoalkeeperPolicy,
} from "../../domain";
import { Field } from "../../components/ui";
import { goalkeeperPolicyOptions } from "./formation";

type Inherit = Readonly<{ playersOnField: number; formationId?: string | undefined }>;

function initialFormationValue(
  playersOnField: number,
  formationId: string | null | undefined,
  inherit: Inherit | undefined,
): string {
  if (formationId === null) return "none";
  if (formationId === undefined) {
    return inherit && inherit.playersOnField === playersOnField
      ? ""
      : defaultFormationValue(playersOnField, undefined);
  }
  return formationById(formationId)?.playersOnField === playersOnField
    ? formationId
    : defaultFormationValue(playersOnField, inherit);
}

function defaultFormationValue(playersOnField: number, inherit: Inherit | undefined) {
  if (inherit && inherit.playersOnField === playersOnField) return "";
  return formationsFor(playersOnField)[0]?.id ?? "none";
}

/**
 * Picks the match format (3er–11er) first, then one of that format's formations.
 * Replaces a free "players on field" number so only realistic formats can be chosen.
 */
export function MatchFormatFields({
  playersOnField,
  formationId,
  policy,
  inherit,
}: {
  playersOnField: number;
  formationId: string | null | undefined;
  policy?: GoalkeeperPolicy;
  /** For a single match: the match day's format, which "" inherits. */
  inherit?: Inherit;
}) {
  const [format, setFormat] = useState(playersOnField);
  const [formationValue, setFormationValue] = useState(() =>
    initialFormationValue(playersOnField, formationId, inherit),
  );
  const formats: number[] = MATCH_FORMATS.includes(
    playersOnField as (typeof MATCH_FORMATS)[number],
  )
    ? [...MATCH_FORMATS]
    : [...MATCH_FORMATS, playersOnField].sort((left, right) => left - right);
  const formations = formationsFor(format);
  const canInherit = inherit !== undefined && inherit.playersOnField === format;
  const inheritedName = inherit?.formationId
    ? formationById(inherit.formationId)?.name
    : undefined;
  const selectedFormation =
    formationValue === ""
      ? formationById(inherit?.formationId)
      : formationById(formationValue === "none" ? undefined : formationValue);
  const hasKeeper = selectedFormation
    ? goalkeeperSlot(selectedFormation) !== undefined
    : false;

  return (
    <>
      <fieldset className="format-picker">
        <legend className="field__label">Kampformat</legend>
        <div className="format-picker__options">
          {formats.map((value) => (
            <label key={value} className="format-picker__option">
              <input
                type="radio"
                name="playersOnField"
                value={value}
                checked={format === value}
                onChange={() => {
                  setFormat(value);
                  setFormationValue(defaultFormationValue(value, inherit));
                }}
              />
              <span>
                {MATCH_FORMATS.includes(value as (typeof MATCH_FORMATS)[number])
                  ? `${value}er`
                  : `Eget: ${value}`}
              </span>
            </label>
          ))}
        </div>
        <span className="field__hint">{format} spillere på banen samtidig.</span>
      </fieldset>
      {formations.length > 0 ? (
        <Field
          label="Formasjon"
          hint="Med formasjon får barna faste plasser, og banen vises med navn."
        >
          <select
            name="formationId"
            value={formationValue}
            onChange={(event) => setFormationValue(event.currentTarget.value)}
          >
            {canInherit && (
              <option value="">
                Som spilldagen ({inheritedName ?? "bare spilletid"})
              </option>
            )}
            {formations.map((formation) => (
              <option key={formation.id} value={formation.id}>
                {formation.name}
              </option>
            ))}
            <option value="none">Bare spilletid (uten posisjoner)</option>
          </select>
        </Field>
      ) : (
        <input type="hidden" name="formationId" value={canInherit ? "" : "none"} />
      )}
      {policy !== undefined &&
        (hasKeeper && formations.length > 0 ? (
          <Field label="Keeper">
            <select name="goalkeeperPolicy" defaultValue={policy}>
              {goalkeeperPolicyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="goalkeeperPolicy" value={policy} />
        ))}
    </>
  );
}

export type MatchFormatChoice = Readonly<{
  playersOnField: number;
  /** undefined = follow the match day, null = no positions. */
  formationId: string | null | undefined;
}>;

export function parseMatchFormat(data: FormData): MatchFormatChoice {
  const playersOnField = Number(data.get("playersOnField"));
  if (!Number.isInteger(playersOnField) || playersOnField < 1) {
    throw new Error("Velg kampformat.");
  }
  const raw = data.get("formationId");
  const value = typeof raw === "string" ? raw : "";
  if (value === "") return { playersOnField, formationId: undefined };
  if (value === "none") return { playersOnField, formationId: null };
  const formation = formationById(value);
  if (!formation || formation.playersOnField !== playersOnField) {
    throw new Error("Formasjonen passer ikke med kampformatet.");
  }
  return { playersOnField, formationId: formation.id };
}

export function parseGoalkeeperPolicy(value: string): GoalkeeperPolicy {
  if (value === "fixed" || value === "rotating") return value;
  throw new Error("Ugyldig keeperregel.");
}
