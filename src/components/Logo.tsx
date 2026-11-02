/* eslint-disable @next/next/no-img-element */
/** The supplied St. Chris Global logo (transparent PNG). `emblem` shows the mark alone. */
export function Logo({ reversed = false, emblem = false, height = 40, className = '' }: { reversed?: boolean; emblem?: boolean; height?: number; className?: string }) {
  const src = emblem ? '/brand/emblem.png' : reversed ? '/brand/logo-reversed.png' : '/brand/logo.png';
  const ratio = emblem ? 456 / 540 : 1330 / 562;
  return (
    <img src={src} alt="St. Chris Global Limited" width={Math.round(height * ratio)} height={height} className={className} style={{ height, width: 'auto' }} />
  );
}
