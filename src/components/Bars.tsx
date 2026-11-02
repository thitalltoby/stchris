/** Horizontal bar list. Values are always printed so colour is never the only carrier of meaning. */
export function Bars({ rows, unit = '' }: { rows: { label: string; value: number; note?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-steel text-sm">No data in this range.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] md:grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={r.label}>{r.label}</span>
          <span className="h-3.5 bg-paper-2 block" aria-hidden="true"><span className="block h-full bg-ember" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="mono tabular-nums text-right min-w-10">{r.value.toLocaleString('en-GB')}{unit}{r.note ? <span className="text-steel"> {r.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
