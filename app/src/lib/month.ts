export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
