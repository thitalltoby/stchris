import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RequestStatus, QuotationStatus } from '@/generated/prisma/enums';
import { STATUS_LABELS, STATUS_TONE } from '@/lib/workflow';
import { QUOTATION_STATUS_LABELS } from '@/lib/quotation-labels';

export type Tone = 'neutral' | 'info' | 'warn' | 'good' | 'bad';

export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => <span className={`badge badge-${tone}`}>{children}</span>;

export const StatusBadge = ({ status }: { status: RequestStatus }) => <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;

const QTONE: Record<QuotationStatus, Tone> = {
  DRAFT: 'neutral', PENDING_APPROVAL: 'warn', APPROVED: 'info', ISSUED: 'info', VIEWED: 'info', ACCEPTED: 'good',
  DECLINED: 'bad', EXPIRED: 'neutral', WITHDRAWN: 'neutral', SUPERSEDED: 'neutral',
};
export const QuotationBadge = ({ status }: { status: QuotationStatus }) => <Badge tone={QTONE[status]}>{QUOTATION_STATUS_LABELS[status]}</Badge>;

export function Alert({ tone = 'info', children, role }: { tone?: 'error' | 'ok' | 'info' | 'warn'; children: ReactNode; role?: string }) {
  return <div className={`alert alert-${tone}`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>{children}</div>;
}

export function PageHeader({ title, eyebrow, actions, children }: { title: string; eyebrow?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="!text-[1.75rem] md:!text-[2.1rem]">{title}</h1>
        {children && <div className="mt-2 text-steel max-w-2xl">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="panel panel-pad text-center">
    <p className="font-display font-bold text-lg">{title}</p>
    {children && <div className="text-steel mt-1">{children}</div>}
  </div>
);

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="mono text-steel">Page {page} of {pages}</span>
      <span className="flex gap-2">
        {page > 1 ? <Link className="btn btn-outline btn-sm" href={hrefFor(page - 1)}>Previous</Link> : <span className="btn btn-outline btn-sm" aria-disabled="true">Previous</span>}
        {page < pages ? <Link className="btn btn-outline btn-sm" href={hrefFor(page + 1)}>Next</Link> : <span className="btn btn-outline btn-sm" aria-disabled="true">Next</span>}
      </span>
    </nav>
  );
}

export const Stat = ({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'bad' | 'warn' }) => (
  <div className={`panel panel-pad ${tone === 'bad' ? 'border-l-4 !border-l-ember' : tone === 'warn' ? 'border-l-4 !border-l-brand' : ''}`}>
    <p className="eyebrow">{label}</p>
    <p className="font-display font-extrabold text-3xl mt-1 tabular-nums">{value}</p>
    {note && <p className="text-sm text-steel mt-1">{note}</p>}
  </div>
);

export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}
