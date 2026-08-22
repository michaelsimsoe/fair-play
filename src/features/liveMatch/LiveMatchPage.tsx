import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { allowLiveExitOnce, navigate } from "../../app/router";
import { useServices } from "../../app/services";
import {
  MatchClock,
  recoverMatchClock,
  ThresholdCrossingTracker,
  type MatchClockState,
} from "../../clock";
import { formatDuration } from "../../components/format";
import { Button, StatusPill } from "../../components/ui";
import {
  planRecommendation,
  playerId,
  type PlayerId,
  type Recommendation,
} from "../../domain";
import { browserClockSource } from "../../platform/browserClockSource";
import { vibrateForChange } from "../../platform/vibration";
import { onPageHiding, onVisibilityReturn } from "../../platform/visibility";
import type {
  ActiveMatchJournalRecord,
  AppSettingsRecord,
  MatchEventRecord,
  MatchRecord,
} from "../../storage/schema";
import {
  calculateTournamentTotals,
  currentIntervalDuration,
  lastPlanningElapsed,
  loadMatchData,
  playerName,
  projectStoredMatch,
} from "../shared/data";
import { useAsyncData } from "../shared/hooks";

type LoadedLiveData = Awaited<ReturnType<typeof loadMatchData>> & {
  journal: ActiveMatchJournalRecord | undefined;
  priorTotals: Awaited<ReturnType<typeof calculateTournamentTotals>>;
  settings: AppSettingsRecord;
};

export function LiveMatchPage({ matchId }: { matchId: string }) {
  const { repository } = useServices();
  const state = useAsyncData<LoadedLiveData>(async () => {
    const data = await loadMatchData(repository, matchId);
    const [journal, priorTotals, settings] = await Promise.all([
      repository.getJournal(matchId),
      calculateTournamentTotals(repository, data.tournamentBundle, data.match.order),
      repository.getSettings(),
    ]);
    return { ...data, journal, priorTotals, settings };
  }, [repository, matchId]);

  if (state.status === "loading") {
    return <main className="centered-page">Gjenoppretter kamp …</main>;
  }
  if (state.status === "error") throw state.error;
  if (state.data.match.status === "completed") {
    allowLiveExitOnce();
    navigate({ name: "match-summary", matchId }, true);
    return null;
  }
  return <LiveMatchReady data={state.data} />;
}

function createInitialClock(data: LoadedLiveData): {
  clock: MatchClock;
  needsReview: boolean;
} {
  if (data.journal) {
    try {
      const journal = {
        clockStatus: data.journal.clockStatus,
        elapsedAtSnapshotMs: Math.floor(data.journal.elapsedAtSnapshotMs),
        snapshotWallMs: Math.floor(data.journal.snapshotWallMs),
        plannedDurationMs: Math.floor(data.journal.plannedDurationMs),
        ...(data.journal.lastResumeWallMs === undefined
          ? {}
          : { lastResumeWallMs: Math.floor(data.journal.lastResumeWallMs) }),
      };
      const recovered = recoverMatchClock(browserClockSource, journal, {
        implausibleGapMs: 60 * 60 * 1000,
      });
      return {
        ...recovered,
        needsReview:
          recovered.needsReview ||
          journal.elapsedAtSnapshotMs !== data.journal.elapsedAtSnapshotMs,
      };
    } catch {
      // A corrupt journal falls back to the audited event stream and requires review.
    }
  }
  const lastElapsed = Math.max(0, ...data.events.map((event) => event.elapsedMs));
  const status = data.match.status === "paused" ? "paused" : "running";
  const state: MatchClockState =
    status === "running"
      ? {
          status,
          accumulatedActiveMs: lastElapsed,
          plannedDurationMs: data.match.plannedDurationMs,
          resumedAtMonotonicMs: browserClockSource.monotonicNowMs(),
          resumedAtWallMs: browserClockSource.wallNowMs(),
        }
      : {
          status,
          accumulatedActiveMs: lastElapsed,
          plannedDurationMs: data.match.plannedDurationMs,
        };
  return { clock: new MatchClock(browserClockSource, state), needsReview: true };
}

function LiveMatchReady({ data }: { data: LoadedLiveData }) {
  const { repository, audio, wakeLock } = useServices();
  const initialClock = useMemo(() => createInitialClock(data), [data]);
  const clockRef = useRef(initialClock.clock);
  const [match, setMatch] = useState(data.match);
  const [events, setEvents] = useState<MatchEventRecord[]>(data.events);
  const [elapsedMs, setElapsedMs] = useState(() => initialClock.clock.elapsedMs());
  const [planningElapsedMs, setPlanningElapsedMs] = useState(() =>
    lastPlanningElapsed(data.events),
  );
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [lastSavedAt, setLastSavedAt] = useState(
    data.journal?.savedAtWallMs ?? data.events.at(-1)?.recordedAtWallMs ?? 0,
  );
  const [error, setError] = useState<string>();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualOutgoing, setManualOutgoing] = useState<string>();
  const [manualIncoming, setManualIncoming] = useState<string>();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [availabilityAction, setAvailabilityAction] = useState<{
    playerId: string;
    incomingId: string;
  }>();
  const [wakeStatus, setWakeStatus] = useState(wakeLock.getStatus());
  const [recoveryReview, setRecoveryReview] = useState(initialClock.needsReview);
  const [recoverySeconds, setRecoverySeconds] = useState(() =>
    Math.floor(initialClock.clock.elapsedMs() / 1000),
  );
  const [settings] = useState(data.settings);
  const endAlerted = useRef(false);
  const trackerRef = useRef(new ThresholdCrossingTracker());
  const previousElapsedRef = useRef(elapsedMs);
  const actionInFlightRef = useRef(false);
  const { tournamentBundle: bundle, priorTotals } = data;

  const projection = useMemo(
    () => projectStoredMatch(match, events, elapsedMs),
    [match, events, elapsedMs],
  );
  const planningProjection = useMemo(
    () => projectStoredMatch(match, events, planningElapsedMs),
    [match, events, planningElapsedMs],
  );

  const recommendation = useMemo<Recommendation | undefined>(() => {
    const availableIds = bundle.players
      .filter((player) =>
        planningProjection.currentlyAvailableIds.includes(playerId(player.id)),
      )
      .map((player) => playerId(player.id));
    if (
      availableIds.length <= match.playersOnField ||
      planningProjection.currentLineupIds.length !== match.playersOnField
    ) {
      return undefined;
    }
    const balances = Object.fromEntries(
      availableIds.map((id) => [
        id,
        (planningProjection.fairnessBalanceMsByPlayer[id] ?? 0) +
          (bundle.tournament.fairnessScope === "tournament"
            ? (priorTotals[id]?.balanceMs ?? 0)
            : 0),
      ]),
    ) as Record<PlayerId, number>;
    const fieldStints = Object.fromEntries(
      availableIds.map((id) => [
        id,
        currentIntervalDuration(
          planningProjection.playingStintsByPlayer[id],
          planningElapsedMs,
        ),
      ]),
    ) as Record<PlayerId, number>;
    const benchStints = Object.fromEntries(
      availableIds.map((id) => [
        id,
        currentIntervalDuration(
          planningProjection.benchStintsByPlayer[id],
          planningElapsedMs,
        ),
      ]),
    ) as Record<PlayerId, number>;
    return planRecommendation({
      nowElapsedMs: planningElapsedMs,
      plannedEndElapsedMs: match.plannedDurationMs,
      fieldSlots: match.playersOnField,
      orderedAvailablePlayerIds: availableIds,
      currentLineupIds: planningProjection.currentLineupIds,
      balancesMsByPlayer: balances,
      currentFieldStintMsByPlayer: fieldStints,
      currentBenchStintMsByPlayer: benchStints,
      minimumPreferredStintMs: match.minimumStintMs,
      preferredChangeIntervalMs: Math.floor(
        match.plannedDurationMs / availableIds.length,
      ),
      actualMsByPlayer: planningProjection.actualMsByPlayer,
      idealMsByPlayer: planningProjection.idealMsByPlayer,
    });
  }, [
    bundle.players,
    bundle.tournament.fairnessScope,
    match,
    planningElapsedMs,
    planningProjection,
    priorTotals,
  ]);

  useEffect(() => wakeLock.subscribe(setWakeStatus), [wakeLock]);

  useEffect(() => {
    trackerRef.current = new ThresholdCrossingTracker();
    previousElapsedRef.current = clockRef.current.elapsedMs();
  }, [recommendation?.id]);

  useEffect(() => {
    const update = () => {
      const nextElapsed = clockRef.current.elapsedMs();
      const previousElapsed = previousElapsedRef.current;
      if (
        Math.floor(nextElapsed / 1000) !== Math.floor(previousElapsed / 1000) ||
        nextElapsed === match.plannedDurationMs
      ) {
        setElapsedMs(nextElapsed);
      }
      previousElapsedRef.current = nextElapsed;

      if (recommendation) {
        const crossing = trackerRef.current.observe(
          match.plannedDurationMs - previousElapsed,
          match.plannedDurationMs - nextElapsed,
          [
            {
              id: `${recommendation.id}:lead`,
              remainingMs:
                match.plannedDurationMs -
                Math.max(0, recommendation.dueAtElapsedMs - match.alertLeadMs),
            },
            {
              id: `${recommendation.id}:due`,
              remainingMs: match.plannedDurationMs - recommendation.dueAtElapsedMs,
            },
          ],
        );
        if (crossing.crossedIds.some((id) => id.endsWith(":due"))) {
          if (settings.soundEnabled) void audio.play("change");
          vibrateForChange(settings.vibrationEnabled);
        }
      }
      if (nextElapsed >= match.plannedDurationMs && !endAlerted.current) {
        endAlerted.current = true;
        if (settings.soundEnabled) void audio.play("end");
        vibrateForChange(settings.vibrationEnabled);
      }
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [
    audio,
    match.alertLeadMs,
    match.plannedDurationMs,
    recommendation,
    settings.soundEnabled,
    settings.vibrationEnabled,
  ]);

  const makeJournal = useCallback(
    (
      lineupIds: readonly string[],
      lastSequence: number,
      plannedDurationMs = match.plannedDurationMs,
    ): ActiveMatchJournalRecord => {
      const clockJournal = clockRef.current.journal();
      return {
        matchId: match.id,
        clockStatus: clockJournal.clockStatus,
        elapsedAtSnapshotMs: clockJournal.elapsedAtSnapshotMs,
        snapshotWallMs: clockJournal.snapshotWallMs,
        plannedDurationMs,
        currentLineupIds: [...lineupIds],
        lastEventSequence: lastSequence,
        savedAtWallMs: browserClockSource.wallNowMs(),
        ...(clockJournal.lastResumeWallMs === undefined
          ? {}
          : { lastResumeWallMs: clockJournal.lastResumeWallMs }),
      };
    },
    [match.id, match.plannedDurationMs],
  );

  const persistJournal = useCallback(async () => {
    if (match.status !== "running" && match.status !== "paused") return;
    const lastSequence = events.at(-1)?.sequence ?? 0;
    const currentElapsed = clockRef.current.elapsedMs();
    const currentProjection = projectStoredMatch(match, events, currentElapsed);
    const journal = makeJournal(currentProjection.currentLineupIds, lastSequence);
    await repository.saveJournal(journal);
    setLastSavedAt(journal.savedAtWallMs);
  }, [events, makeJournal, match, repository]);

  useEffect(() => {
    const heartbeat = window.setInterval(() => {
      void persistJournal().catch(() => setSaveState("failed"));
    }, 5_000);
    const removeHiding = onPageHiding(() => {
      void persistJournal().catch(() => setSaveState("failed"));
    });
    const removeReturn = onVisibilityReturn(() => {
      clockRef.current.reanchor();
      setElapsedMs(clockRef.current.elapsedMs());
      void wakeLock.request();
    });
    return () => {
      window.clearInterval(heartbeat);
      removeHiding();
      removeReturn();
    };
  }, [persistJournal, wakeLock]);

  const nextSequence = () => (events.at(-1)?.sequence ?? -1) + 1;

  const commit = async (
    newEvents: MatchEventRecord | readonly MatchEventRecord[],
    nextMatch: MatchRecord,
    lineupAfter: readonly string[],
    planningAt: number,
    keepJournal = true,
  ): Promise<boolean> => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    const eventList: MatchEventRecord[] =
      "type" in newEvents ? [newEvents] : [...newEvents];
    const lastSequence = eventList.at(-1)?.sequence ?? nextSequence();
    setSaveState("saving");
    setError(undefined);
    try {
      const journal = keepJournal
        ? makeJournal(lineupAfter, lastSequence, nextMatch.plannedDurationMs)
        : undefined;
      await repository.commitMatchAction(eventList, nextMatch, journal);
      setEvents((current) => [...current, ...eventList]);
      setMatch(nextMatch);
      setElapsedMs(planningAt);
      setPlanningElapsedMs(planningAt);
      setSaveState("saved");
      setLastSavedAt(browserClockSource.wallNowMs());
      return true;
    } catch (caught) {
      setSaveState("failed");
      setError(
        caught instanceof Error
          ? caught.message
          : "Lagring feilet. Handlingen ble ikke registrert.",
      );
      return false;
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const confirmRecommendation = async () => {
    const swap = recommendation?.swaps[0];
    if (!swap) return;
    const actionElapsed = clockRef.current.elapsedMs();
    const currentProjection = projectStoredMatch(match, events, actionElapsed);
    const outgoing = String(swap.outgoingPlayerId);
    const incoming = String(swap.incomingPlayerId);
    const lineupAfter = currentProjection.currentLineupIds.map((id) =>
      id === outgoing ? incoming : id,
    );
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: nextSequence(),
      type: "SUBSTITUTION_CONFIRMED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "suggested-confirmation",
      schemaVersion: 1,
      payload: {
        outgoingPlayerIds: [outgoing],
        incomingPlayerIds: [incoming],
        lineupBeforeIds: [...currentProjection.currentLineupIds],
        lineupAfterIds: lineupAfter,
        recommendationId: recommendation.id,
      },
    };
    await commit(event, match, lineupAfter, actionElapsed);
  };

  const confirmManual = async () => {
    if (!manualOutgoing || !manualIncoming) return;
    const actionElapsed = clockRef.current.elapsedMs();
    const currentProjection = projectStoredMatch(match, events, actionElapsed);
    const lineupAfter = currentProjection.currentLineupIds.map((id) =>
      id === manualOutgoing ? manualIncoming : id,
    );
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: nextSequence(),
      type: "SUBSTITUTION_CONFIRMED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "user",
      schemaVersion: 1,
      payload: {
        outgoingPlayerIds: [manualOutgoing],
        incomingPlayerIds: [manualIncoming],
        lineupBeforeIds: [...currentProjection.currentLineupIds],
        lineupAfterIds: lineupAfter,
      },
    };
    if (await commit(event, match, lineupAfter, actionElapsed)) {
      setManualOpen(false);
      setManualIncoming(undefined);
      setManualOutgoing(undefined);
    }
  };

  const toggleAvailability = async (id: string) => {
    const actionElapsed = clockRef.current.elapsedMs();
    const currentProjection = projectStoredMatch(match, events, actionElapsed);
    const domainId = playerId(id);
    const currentlyAvailable =
      currentProjection.currentlyAvailableIds.includes(domainId);
    if (currentlyAvailable && currentProjection.currentLineupIds.includes(domainId)) {
      const incoming = currentProjection.currentlyAvailableIds.find(
        (candidate) => !currentProjection.currentLineupIds.includes(candidate),
      );
      if (incoming) {
        setAvailabilityAction({ playerId: id, incomingId: incoming });
        return;
      }
    }
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: nextSequence(),
      type: "PLAYER_AVAILABILITY_CHANGED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "user",
      schemaVersion: 1,
      payload: {
        playerId: id,
        previousAvailable: currentlyAvailable,
        available: !currentlyAvailable,
      },
    };
    await commit(event, match, currentProjection.currentLineupIds, actionElapsed);
  };

  const confirmUnavailableReplacement = async () => {
    if (!availabilityAction) return;
    const actionElapsed = clockRef.current.elapsedMs();
    const currentProjection = projectStoredMatch(match, events, actionElapsed);
    const lineupAfter = currentProjection.currentLineupIds.map((id) =>
      id === availabilityAction.playerId ? availabilityAction.incomingId : id,
    );
    const sequence = nextSequence();
    const substitution: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence,
      type: "SUBSTITUTION_CONFIRMED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "user",
      schemaVersion: 1,
      payload: {
        outgoingPlayerIds: [availabilityAction.playerId],
        incomingPlayerIds: [availabilityAction.incomingId],
        lineupBeforeIds: [...currentProjection.currentLineupIds],
        lineupAfterIds: lineupAfter,
      },
    };
    const availability: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: sequence + 1,
      type: "PLAYER_AVAILABILITY_CHANGED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "user",
      schemaVersion: 1,
      payload: {
        playerId: availabilityAction.playerId,
        previousAvailable: true,
        available: false,
      },
    };
    if (await commit([substitution, availability], match, lineupAfter, actionElapsed)) {
      setAvailabilityAction(undefined);
    }
  };

  const pauseOrResume = async () => {
    if (actionInFlightRef.current) return;
    if (match.status === "running") {
      const actionElapsed = clockRef.current.pause();
      const currentProjection = projectStoredMatch(match, events, actionElapsed);
      const event: MatchEventRecord = {
        id: crypto.randomUUID(),
        matchId: match.id,
        sequence: nextSequence(),
        type: "MATCH_PAUSED",
        elapsedMs: actionElapsed,
        recordedAtWallMs: browserClockSource.wallNowMs(),
        source: "user",
        schemaVersion: 1,
        payload: {},
      };
      const succeeded = await commit(
        event,
        { ...match, status: "paused" },
        currentProjection.currentLineupIds,
        actionElapsed,
      );
      if (!succeeded) clockRef.current.resume();
    } else {
      const actionElapsed = clockRef.current.resume();
      const currentProjection = projectStoredMatch(match, events, actionElapsed);
      const event: MatchEventRecord = {
        id: crypto.randomUUID(),
        matchId: match.id,
        sequence: nextSequence(),
        type: "MATCH_RESUMED",
        elapsedMs: actionElapsed,
        recordedAtWallMs: browserClockSource.wallNowMs(),
        source: "user",
        schemaVersion: 1,
        payload: {},
      };
      const succeeded = await commit(
        event,
        { ...match, status: "running" },
        currentProjection.currentLineupIds,
        actionElapsed,
      );
      if (!succeeded) clockRef.current.pause();
      else void wakeLock.request();
    }
  };

  const addOvertime = async (milliseconds: number) => {
    const actionElapsed = clockRef.current.elapsedMs();
    const nextDuration = match.plannedDurationMs + milliseconds;
    const currentProjection = projectStoredMatch(match, events, actionElapsed);
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: nextSequence(),
      type: "MATCH_DURATION_CHANGED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "user",
      schemaVersion: 1,
      payload: {
        previousDurationMs: match.plannedDurationMs,
        newDurationMs: nextDuration,
      },
    };
    const succeeded = await commit(
      event,
      { ...match, plannedDurationMs: nextDuration },
      currentProjection.currentLineupIds,
      actionElapsed,
    );
    if (succeeded) {
      clockRef.current.extendTo(nextDuration);
      endAlerted.current = false;
      setToolsOpen(false);
    }
  };

  const endMatch = async () => {
    if (actionInFlightRef.current) return;
    const wasRunning = match.status === "running";
    const actionElapsed = wasRunning
      ? clockRef.current.pause()
      : clockRef.current.elapsedMs();
    const currentProjection = projectStoredMatch(match, events, actionElapsed);
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: nextSequence(),
      type: "MATCH_ENDED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "user",
      schemaVersion: 1,
      payload: {
        reason: actionElapsed >= match.plannedDurationMs ? "planned-end" : "user-ended",
      },
    };
    const succeeded = await commit(
      event,
      { ...match, status: "completed" },
      currentProjection.currentLineupIds,
      actionElapsed,
      false,
    );
    if (!succeeded) {
      if (wasRunning) clockRef.current.resume();
      return;
    }
    clockRef.current.end();
    await wakeLock.release();
    allowLiveExitOnce();
    navigate({ name: "match-summary", matchId: match.id }, true);
  };

  const undoLastAction = async () => {
    const voidedIds = new Set(
      events
        .filter((event) => event.type === "EVENT_VOIDED")
        .map((event) =>
          event.type === "EVENT_VOIDED" ? event.payload.targetEventId : "",
        ),
    );
    const history = events.filter(
      (event) =>
        !voidedIds.has(event.id) &&
        [
          "SUBSTITUTION_CONFIRMED",
          "PLAYER_AVAILABILITY_CHANGED",
          "LINEUP_SYNCHRONIZED",
        ].includes(event.type),
    );
    const target = history.at(-1);
    if (!target) {
      setError("Det finnes ingen byttehandling å angre.");
      return;
    }
    const targets = [target];
    const previous = history.at(-2);
    if (
      target.type === "PLAYER_AVAILABILITY_CHANGED" &&
      previous?.type === "SUBSTITUTION_CONFIRMED" &&
      previous.elapsedMs === target.elapsedMs
    ) {
      targets.unshift(previous);
    }
    const actionElapsed = clockRef.current.elapsedMs();
    const sequence = nextSequence();
    const corrections: MatchEventRecord[] = targets.map((event, index) => ({
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: sequence + index,
      type: "EVENT_VOIDED",
      elapsedMs: actionElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "user",
      schemaVersion: 1,
      payload: {
        targetEventId: event.id,
        reason: "Angret av trener",
      },
    }));
    const nextEvents = [...events, ...corrections];
    const correctedProjection = projectStoredMatch(match, nextEvents, actionElapsed);
    if (
      await commit(
        corrections,
        match,
        correctedProjection.currentLineupIds,
        actionElapsed,
      )
    ) {
      setToolsOpen(false);
    }
  };

  const applyRecovery = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const minimumElapsed = Math.max(0, ...events.map((item) => item.elapsedMs));
    const adjustedElapsed = Math.min(
      match.plannedDurationMs,
      Math.max(minimumElapsed, recoverySeconds * 1000),
    );
    const status = match.status === "paused" ? "paused" : "running";
    const clockState: MatchClockState =
      status === "running"
        ? {
            status,
            accumulatedActiveMs: adjustedElapsed,
            plannedDurationMs: match.plannedDurationMs,
            resumedAtMonotonicMs: browserClockSource.monotonicNowMs(),
            resumedAtWallMs: browserClockSource.wallNowMs(),
          }
        : {
            status,
            accumulatedActiveMs: adjustedElapsed,
            plannedDurationMs: match.plannedDurationMs,
          };
    clockRef.current = new MatchClock(browserClockSource, clockState);
    const recoveredProjection = projectStoredMatch(match, events, adjustedElapsed);
    const recoveryEvent: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: nextSequence(),
      type: "LINEUP_SYNCHRONIZED",
      elapsedMs: adjustedElapsed,
      recordedAtWallMs: browserClockSource.wallNowMs(),
      source: "recovery",
      schemaVersion: 1,
      payload: {
        lineupBeforeIds: [...recoveredProjection.currentLineupIds],
        lineupAfterIds: [...recoveredProjection.currentLineupIds],
        reason: "Kampklokke gjennomgått etter gjenoppretting",
      },
    };
    if (
      await commit(
        recoveryEvent,
        match,
        recoveredProjection.currentLineupIds,
        adjustedElapsed,
      )
    ) {
      setRecoveryReview(false);
      void wakeLock.request();
    }
  };

  const remainingMs = Math.max(0, match.plannedDurationMs - elapsedMs);
  const dueDelta = recommendation
    ? recommendation.dueAtElapsedMs - elapsedMs
    : undefined;
  const due = dueDelta !== undefined && dueDelta <= 0;
  const preparing =
    dueDelta !== undefined && dueDelta > 0 && dueDelta <= match.alertLeadMs;
  const firstSwap = recommendation?.swaps[0];
  const fieldPlayers = bundle.players.filter((player) =>
    projection.currentLineupIds.includes(playerId(player.id)),
  );
  const benchPlayers = bundle.players.filter(
    (player) =>
      projection.currentlyAvailableIds.includes(playerId(player.id)) &&
      !projection.currentLineupIds.includes(playerId(player.id)),
  );

  return (
    <main
      className={`live-page ${preparing ? "live-page--prepare" : ""} ${
        due ? "live-page--due" : ""
      }`}
    >
      <header className="live-header">
        <div>
          <strong>mot {match.opponent || "motstander"}</strong>
          <small>
            {match.pitch ? `Bane ${match.pitch}` : bundle.tournament.teamName}
          </small>
        </div>
        <div className="live-save" aria-live="polite">
          <StatusPill
            tone={
              saveState === "failed"
                ? "danger"
                : saveState === "saving"
                  ? "warning"
                  : "positive"
            }
          >
            {saveState === "saving"
              ? "Lagrer …"
              : saveState === "failed"
                ? "Lagring feilet"
                : "Lagret"}
          </StatusPill>
          <small>{new Date(lastSavedAt).toLocaleTimeString("nb-NO")}</small>
        </div>
      </header>

      <section className="live-hero" aria-labelledby="remaining-label">
        <div
          className="match-clock"
          aria-label={`${formatDuration(remainingMs)} igjen av kampen`}
        >
          {formatDuration(remainingMs)}
        </div>
        <p id="remaining-label">igjen av kampen</p>

        {elapsedMs >= match.plannedDurationMs ? (
          <div className="recommendation recommendation--ended" aria-live="assertive">
            <p className="recommendation__status">KAMPEN ER FERDIG</p>
            <h1>Avslutt eller legg til tid</h1>
          </div>
        ) : firstSwap && recommendation ? (
          <div
            className={`recommendation ${
              preparing ? "recommendation--prepare" : ""
            } ${due ? "recommendation--due" : ""}`}
            aria-live={due ? "assertive" : "off"}
          >
            <p className="recommendation__status">
              {due
                ? "BYTT NÅ"
                : preparing
                  ? `GJØR KLAR · ${formatDuration(Math.max(0, dueDelta ?? 0))}`
                  : `Neste bytte om ${formatDuration(Math.max(0, dueDelta ?? 0))}`}
            </p>
            {preparing && (
              <span className="sr-only" role="status">
                Gjør klar til bytte
              </span>
            )}
            <div className="swap-names">
              <strong>
                {playerName(bundle.players, firstSwap.incomingPlayerId)}{" "}
                <span>INN</span>
              </strong>
              <strong>
                {playerName(bundle.players, firstSwap.outgoingPlayerId)} <span>UT</span>
              </strong>
            </div>
            {due && (
              <p className="overdue">
                +{formatDuration(Math.abs(dueDelta ?? 0))} over tiden
              </p>
            )}
          </div>
        ) : (
          <div className="recommendation">
            <p className="recommendation__status">Ingen bytte nødvendig</p>
            <h2>Gjeldende lag kan spille videre</h2>
          </div>
        )}

        {recommendation && !recommendation.diagnostics.perfectTargetFeasible && (
          <p className="fairness-note">
            Helt lik spilletid er ikke mulig i resten av denne kampen. Planen minimerer
            forskjellen og tar avviket med videre.
          </p>
        )}

        {elapsedMs >= match.plannedDurationMs ? (
          <Button
            className="confirm-swap"
            variant="primary"
            full
            disabled={saveState === "saving"}
            onClick={() => void endMatch()}
          >
            AVSLUTT KAMP
          </Button>
        ) : (
          <Button
            className="confirm-swap"
            variant="primary"
            full
            disabled={!firstSwap || match.status === "paused" || saveState === "saving"}
            onClick={() => void confirmRecommendation()}
          >
            BYTTET ER GJORT
          </Button>
        )}
      </section>

      {error && (
        <div className="notice live-error" role="alert">
          {error}
        </div>
      )}

      <section className="live-lineups">
        <div>
          <h2>På banen</h2>
          <div className="player-grid">
            {fieldPlayers.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                state="field"
                actualMs={projection.actualMsByPlayer[playerId(player.id)] ?? 0}
                intervalMs={currentIntervalDuration(
                  projection.playingStintsByPlayer[playerId(player.id)],
                  elapsedMs,
                )}
              />
            ))}
          </div>
        </div>
        <div>
          <h2>Benk</h2>
          <div className="player-grid">
            {benchPlayers.length ? (
              benchPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  state="bench"
                  actualMs={projection.actualMsByPlayer[playerId(player.id)] ?? 0}
                  intervalMs={currentIntervalDuration(
                    projection.benchStintsByPlayer[playerId(player.id)],
                    elapsedMs,
                  )}
                />
              ))
            ) : (
              <p className="muted live-empty-bench">Ingen på benken</p>
            )}
          </div>
        </div>
      </section>

      <footer className="live-actions">
        <Button
          disabled={match.status === "paused" || saveState === "saving"}
          onClick={() => setManualOpen(true)}
        >
          Manuelt bytte
        </Button>
        <Button disabled={saveState === "saving"} onClick={() => void pauseOrResume()}>
          {match.status === "paused" ? "Fortsett" : "Pause"}
        </Button>
        <Button disabled={saveState === "saving"} onClick={() => setToolsOpen(true)}>
          Flere valg
        </Button>
      </footer>

      <div className="live-capabilities">
        <span>{settings.soundEnabled ? "Lyd på" : "Lyd av"}</span>
        <span>
          {wakeStatus === "active"
            ? "Skjermen holdes våken"
            : "Hold skjermen våken manuelt"}
        </span>
      </div>

      {manualOpen && (
        <ManualDialog
          fieldPlayers={fieldPlayers}
          benchPlayers={benchPlayers}
          outgoing={manualOutgoing}
          incoming={manualIncoming}
          elapsedMs={elapsedMs}
          onOutgoing={setManualOutgoing}
          onIncoming={setManualIncoming}
          onConfirm={() => void confirmManual()}
          onCancel={() => {
            setManualOpen(false);
            setManualOutgoing(undefined);
            setManualIncoming(undefined);
          }}
        />
      )}

      {toolsOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="more-actions-title"
          >
            <h2 id="more-actions-title">Kampvalg</h2>
            <div className="form-grid">
              <Button
                onClick={() => {
                  setPlanningElapsedMs(clockRef.current.elapsedMs());
                  setToolsOpen(false);
                }}
              >
                Beregn på nytt
              </Button>
              <Button onClick={() => void undoLastAction()}>
                Angre siste byttehandling
              </Button>
              <div>
                <h3>Tilgjengelighet</h3>
                <div className="availability-actions">
                  {bundle.players
                    .filter((player) => match.eligiblePlayerIds.includes(player.id))
                    .map((player) => (
                      <button
                        key={player.id}
                        aria-pressed={projection.currentlyAvailableIds.includes(
                          playerId(player.id),
                        )}
                        onClick={() => void toggleAvailability(player.id)}
                      >
                        <strong>{player.name}</strong>
                        <span>
                          {projection.currentlyAvailableIds.includes(
                            playerId(player.id),
                          )
                            ? "Tilgjengelig"
                            : "Ikke tilgjengelig"}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
              <Button onClick={() => void addOvertime(30_000)}>+30 sek</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (
                    elapsedMs >= match.plannedDurationMs ||
                    window.confirm(
                      `Avslutte kampen nå? Registrert kamptid: ${formatDuration(elapsedMs)}.`,
                    )
                  ) {
                    void endMatch();
                  }
                }}
              >
                Avslutt kamp nå
              </Button>
              <Button variant="quiet" onClick={() => setToolsOpen(false)}>
                Lukk
              </Button>
            </div>
          </section>
        </div>
      )}

      {availabilityAction && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="availability-title"
          >
            <h2 id="availability-title">Bytt før spilleren blir utilgjengelig</h2>
            <p>
              {playerName(bundle.players, availabilityAction.incomingId)} går inn for{" "}
              {playerName(bundle.players, availabilityAction.playerId)}.
            </p>
            <div className="dialog__actions">
              <Button
                variant="primary"
                onClick={() => void confirmUnavailableReplacement()}
              >
                Registrer bytte
              </Button>
              <Button variant="quiet" onClick={() => setAvailabilityAction(undefined)}>
                Avbryt
              </Button>
            </div>
          </section>
        </div>
      )}

      {recoveryReview && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-title"
          >
            <p className="eyebrow">En kamp var i gang</p>
            <h2 id="recovery-title">Gjennomgå kampklokka</h2>
            <p>
              Nettleseren kan ikke garantere tiden mens appen var lukket. Velg riktig
              aktiv kamptid før du fortsetter.
            </p>
            <form className="form-grid" onSubmit={(event) => void applyRecovery(event)}>
              <label className="field">
                <span className="field__label">Aktiv kamptid (sekunder)</span>
                <input
                  type="number"
                  min={Math.ceil(
                    Math.max(0, ...events.map((item) => item.elapsedMs)) / 1000,
                  )}
                  max={Math.floor(match.plannedDurationMs / 1000)}
                  value={recoverySeconds}
                  onChange={(event) =>
                    setRecoverySeconds(Number(event.currentTarget.value))
                  }
                />
              </label>
              <Button type="submit" variant="primary">
                FORTSETT KAMP
              </Button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function PlayerCard({
  player,
  state,
  actualMs,
  intervalMs,
}: {
  player: { id: string; name: string };
  state: "field" | "bench";
  actualMs: number;
  intervalMs: number;
}) {
  return (
    <article className={`live-player live-player--${state}`}>
      <span className="live-player__state">
        <span aria-hidden="true">{state === "field" ? "●" : "○"}</span>{" "}
        {state === "field" ? "På banen" : "Benk"}
      </span>
      <strong title={player.name}>{player.name}</strong>
      <span className="live-player__time">{formatDuration(actualMs)}</span>
      <small>
        {state === "field" ? "Periode" : "På benk"} {formatDuration(intervalMs)}
      </small>
    </article>
  );
}

function ManualDialog({
  fieldPlayers,
  benchPlayers,
  outgoing,
  incoming,
  elapsedMs,
  onOutgoing,
  onIncoming,
  onConfirm,
  onCancel,
}: {
  fieldPlayers: { id: string; name: string }[];
  benchPlayers: { id: string; name: string }[];
  outgoing: string | undefined;
  incoming: string | undefined;
  elapsedMs: number;
  onOutgoing: (id: string) => void;
  onIncoming: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-title"
      >
        <h2 id="manual-title">Manuelt bytte</h2>
        <h3>Hvem skal ut?</h3>
        <div className="choice-grid">
          {fieldPlayers.map((player) => (
            <button
              key={player.id}
              aria-pressed={outgoing === player.id}
              onClick={() => onOutgoing(player.id)}
            >
              {player.name}
            </button>
          ))}
        </div>
        <h3>Hvem skal inn?</h3>
        <div className="choice-grid">
          {benchPlayers.map((player) => (
            <button
              key={player.id}
              aria-pressed={incoming === player.id}
              onClick={() => onIncoming(player.id)}
            >
              {player.name}
            </button>
          ))}
        </div>
        {outgoing && incoming && (
          <div className="manual-summary">
            <strong>
              {benchPlayers.find((player) => player.id === incoming)?.name} inn
            </strong>
            <strong>
              {fieldPlayers.find((player) => player.id === outgoing)?.name} ut
            </strong>
            <span>Registreres på {formatDuration(elapsedMs)}</span>
          </div>
        )}
        <div className="dialog__actions">
          <Button
            variant="primary"
            disabled={!outgoing || !incoming}
            onClick={onConfirm}
          >
            REGISTRER BYTTE
          </Button>
          <Button variant="quiet" onClick={onCancel}>
            Avbryt
          </Button>
        </div>
      </section>
    </div>
  );
}
