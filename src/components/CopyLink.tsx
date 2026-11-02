'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export function CopyLink({ url, label = 'Copy link', doneLabel = 'Link copied' }: { url: string; label?: string; doneLabel?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); } catch { window.prompt('Copy this', url); } }}>
      <Icon name="copy" size={16} />{done ? doneLabel : label}
    </button>
  );
}
