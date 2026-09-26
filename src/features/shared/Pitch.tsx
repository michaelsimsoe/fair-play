import type { CSSProperties } from "react";
import type { Formation, RoleAssignment, RoleSlot } from "../../domain";
import type { PlayerRecord } from "../../storage/schema";

type PitchVariant = "setup" | "live";

const PITCH_HEIGHT: Record<PitchVariant, number> = { setup: 136, live: 78 };
/** Vertical band (percent) for shirt centres; the live pitch leaves room for names below. */
const Y_BAND: Record<PitchVariant, readonly [number, number]> = {
  setup: [13, 87],
  live: [14, 77],
};

function PitchMarkings({ height }: { height: number }) {
  const inset = 4;
  const length = height - inset * 2;
  const penaltyDepth = length * 0.15;
  const goalAreaDepth = length * 0.055;
  const circle = Math.min(10, height * 0.1);
  const stripes = 8;
  const end = (top: boolean) => {
    const line = top ? inset : height - inset;
    const direction = top ? 1 : -1;
    const box = (width: number, depth: number) => (
      <rect
        x={50 - width / 2}
        y={top ? line : line - depth}
        width={width}
        height={depth}
      />
    );
    return (
      <g>
        {box(52, penaltyDepth)}
        {box(26, goalAreaDepth)}
        <circle
          className="pitch__spot"
          cx={50}
          cy={line + direction * penaltyDepth * 0.7}
          r={0.8}
        />
        <rect
          className="pitch__goal-frame"
          x={43}
          y={top ? line - 2.4 : line}
          width={14}
          height={2.4}
        />
      </g>
    );
  };
  return (
    <svg
      className="pitch__markings"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: stripes }, (_, index) => (
        <rect
          key={index}
          className={index % 2 ? "pitch__stripe pitch__stripe--dark" : "pitch__stripe"}
          x={0}
          y={(height / stripes) * index}
          width={100}
          height={height / stripes + 0.2}
        />
      ))}
      <g className="pitch__lines">
        <rect x={inset} y={inset} width={100 - inset * 2} height={length} />
        <line x1={inset} x2={100 - inset} y1={height / 2} y2={height / 2} />
        <circle cx={50} cy={height / 2} r={circle} />
        <circle className="pitch__spot" cx={50} cy={height / 2} r={0.8} />
        {end(true)}
        {end(false)}
      </g>
    </svg>
  );
}

/** Keeps shirts and names inside the touchlines whatever the template coordinates. */
const displayX = (x: number) => Math.min(88, Math.max(12, x));
const displayY = (y: number, variant: PitchVariant) => {
  const [top, bottom] = Y_BAND[variant];
  return top + ((Math.min(92, Math.max(15, y)) - 15) * (bottom - top)) / 77;
};

export function Pitch({
  formation,
  assignments,
  players,
  variant = "setup",
  selectedRoleSlotId,
  highlightedPlayerIds = [],
  incomingNameByPlayerId = {},
  onSlotPress,
  slotLabel = (roleSlot, name) => `${roleSlot.label}: ${name}`,
  label = "Posisjoner på banen",
}: {
  formation: Formation;
  assignments: readonly RoleAssignment[];
  players: readonly Pick<PlayerRecord, "id" | "name">[];
  variant?: PitchVariant;
  selectedRoleSlotId?: string | undefined;
  /** Children marked as next out get a quiet ring. */
  highlightedPlayerIds?: readonly string[];
  /** Name of the child coming in, keyed by the child going out. */
  incomingNameByPlayerId?: Readonly<Record<string, string>>;
  onSlotPress?: (roleSlotId: string) => void;
  slotLabel?: (
    roleSlot: RoleSlot,
    name: string,
    playerId: string | undefined,
  ) => string;
  label?: string;
}) {
  const height = PITCH_HEIGHT[variant];
  return (
    <div
      className={`pitch pitch--${variant}`}
      style={{ "--pitch-ratio": `100 / ${height}` } as CSSProperties}
      role="group"
      aria-label={label}
    >
      <PitchMarkings height={height} />
      {formation.slots.map((roleSlot) => {
        const assigned = assignments.find(
          (assignment) => assignment.roleSlotId === roleSlot.id,
        );
        const name = assigned
          ? (players.find((player) => player.id === assigned.playerId)?.name ??
            "Ukjent")
          : "Ledig";
        const incoming = assigned
          ? incomingNameByPlayerId[assigned.playerId]
          : undefined;
        const className = [
          "pitch__slot",
          roleSlot.family === "GK" ? "pitch__slot--keeper" : "",
          assigned ? "" : "pitch__slot--empty",
          selectedRoleSlotId === roleSlot.id ? "pitch__slot--selected" : "",
          assigned && highlightedPlayerIds.includes(assigned.playerId)
            ? "pitch__slot--next-out"
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        const style = {
          left: `${displayX(roleSlot.x)}%`,
          top: `${displayY(roleSlot.y, variant)}%`,
        };
        const content = (
          <>
            {incoming && (
              <span className="pitch__incoming" aria-hidden="true">
                {incoming} inn
              </span>
            )}
            <span className="pitch__shirt" aria-hidden="true">
              {roleSlot.shortLabel}
            </span>
            <span className="pitch__name" aria-hidden="true">
              {name}
            </span>
          </>
        );
        const ariaLabel = slotLabel(roleSlot, name, assigned?.playerId);
        return onSlotPress ? (
          <button
            key={roleSlot.id}
            type="button"
            className={className}
            style={style}
            aria-pressed={
              variant === "setup" ? selectedRoleSlotId === roleSlot.id : undefined
            }
            aria-label={ariaLabel}
            onClick={() => onSlotPress(roleSlot.id)}
          >
            {content}
          </button>
        ) : (
          <span
            key={roleSlot.id}
            className={className}
            style={style}
            role="img"
            aria-label={ariaLabel}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
