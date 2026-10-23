import React, { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

/**
 * Tracks the expression field the user is currently editing, so a shared panel (the wide-mode
 * variable/function/property helper) can insert a token into it. `insert` splices at the field's
 * caret — the field passes a stable wrapper that always reaches its latest state.
 */
export type ActiveField = { key: string; insert: (token: string) => void };

type Registry = {
  active: ActiveField | null;
  activate: (f: ActiveField) => void;
  deactivate: (key: string) => void;
};

const Ctx = createContext<Registry | null>(null);

export const useActiveFieldRegistry = () => useContext(Ctx);

export function ActiveFieldProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveField | null>(null);
  const activate   = useCallback((f: ActiveField) => setActive(f), []);
  const deactivate = useCallback((key: string) => setActive(a => (a && a.key === key ? null : a)), []);
  const value = useMemo(() => ({ active, activate, deactivate }), [active, activate, deactivate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
