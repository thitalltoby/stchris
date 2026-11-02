export interface FigureFact { id: string; label: string; value: string; verified: boolean; asOf?: string; home?: boolean; order?: number }

/** What a fact shows on the home page when staff have not chosen yet (the original three). */
export const LEGACY_HOME_IDS = ['history-since'];
export const MAX_HOME_FIGURES = 6;

export const isOnHome = (f: FigureFact) => f.home ?? LEGACY_HOME_IDS.includes(f.id);

/** Facts chosen for the home page, in the order staff set (then register order), capped. A fact with no value is never shown. */
export function selectHomeFigures<T extends FigureFact>(facts: T[]): T[] {
  return facts
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => isOnHome(f) && f.value.trim() !== '')
    .sort((a, b) => (a.f.order ?? 1000 + a.i) - (b.f.order ?? 1000 + b.i) || a.i - b.i)
    .slice(0, MAX_HOME_FIGURES)
    .map(({ f }) => f);
}
