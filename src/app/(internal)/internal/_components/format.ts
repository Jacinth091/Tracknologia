export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

export function formatCount(value: number | null) {
  return value === null ? "N/A" : value.toLocaleString("en-PH");
}

export function formatPercent(value: number | null) {
  return value === null ? "N/A" : `${value}%`;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "N/A";
  if (seconds < 60) return "under 1 min";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
