import type { ReactNode } from 'react';

export function AuthCard({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container-x py-12 md:py-20">
      <div className="mx-auto max-w-md">
        <div className="tiers w-16 mb-5" aria-hidden="true"><span /><span /><span /></div>
        <h1 className="!text-3xl">{title}</h1>
        {intro && <p className="mt-3 text-steel">{intro}</p>}
        <div className="panel rule-top panel-pad mt-6">{children}</div>
        {footer && <div className="mt-5 text-sm text-steel">{footer}</div>}
      </div>
    </div>
  );
}
