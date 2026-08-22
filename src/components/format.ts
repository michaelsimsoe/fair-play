export function formatDuration(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, Math.round(milliseconds));
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSignedDuration(milliseconds: number): string {
  if (Math.abs(milliseconds) < 500) return "±0:00";
  const sign = milliseconds > 0 ? "+" : "−";
  const totalSeconds = Math.round(Math.abs(milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatMatchTime(localDateTime?: string): string {
  if (!localDateTime) return "Tid ikke satt";
  const time = localDateTime.match(/T(\d{2}:\d{2})/)?.[1];
  return time ?? localDateTime;
}

export function formatNorwegianDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}
