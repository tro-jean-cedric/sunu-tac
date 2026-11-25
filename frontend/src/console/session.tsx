import { createContext, useContext } from 'react';

import type { Me } from '../shared/types';

export interface Session {
  me: Me;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionContext');
  return s;
}

/** Human-readable scope of an HR user: "Groupe" or the list of entities. */
export function scopeOf(me: Me): { label: string; entities: string[]; group: boolean } {
  if (me.roles.some((r) => r.role === 'HR_ADMIN')) return { label: 'Groupe', entities: [], group: true };
  const entities = me.roles
    .filter((r) => r.role === 'HR_ENTITY')
    .map((r) => r.company_name ?? `Entité ${r.company_id}`);
  const label =
    entities.length === 0 ? 'Aucun périmètre' : entities.length === 1 ? entities[0] : `${entities.length} entités`;
  return { label, entities, group: false };
}
