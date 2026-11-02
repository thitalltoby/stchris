import 'server-only';
import { db, type Tx } from './db';

export interface Actor {
  id?: string | null;
  label: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, label: 'System' };

export async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId?: string | null,
  meta?: Record<string, unknown>,
  ip?: string | null,
  tx?: Tx,
) {
  const client = tx ?? db;
  await client.auditEvent.create({
    data: {
      actorId: actor.id ?? null,
      actorLabel: actor.label,
      action,
      entityType,
      entityId: entityId ?? null,
      meta: (meta ?? undefined) as any,
      ip: ip ?? null,
    },
  });
}
