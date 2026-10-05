import { useMemo } from "react";
import {
  ExpressionFunction,
  ExpressionPluginSymbols,
  ExpressionProperty,
  ExpressionSymbols,
} from "@/src/models/robotModels";
import { InstalledPlugin, usePluginContributions } from "../usePluginContributions";
import { useExpressionEnv } from "./ExpressionEnv";

/**
 * GetExpressionSymbols lists plugin functions (`scale.tare`) and properties
 * (`scale.weight`) alongside the built-in ones. The assist shows them grouped under
 * their plugin's name instead: the `plugins` array when the controller sends it,
 * otherwise each entry's `pluginId`, otherwise its `<id>.` prefix matched against the
 * installed plugins from GetPluginContributions.
 */
export type SplitSymbols = {
  functions: ExpressionFunction[];
  properties: ExpressionProperty[];
  plugins: ExpressionPluginSymbols[];
};

export function splitPluginSymbols(
  symbols: ExpressionSymbols | null | undefined,
  installed: Map<string, InstalledPlugin>,
): SplitSymbols {
  if (!symbols) return { functions: [], properties: [], plugins: [] };

  if (symbols.plugins) {
    const ids = new Set(symbols.plugins.map(p => p.id));
    const names = new Set(symbols.plugins.flatMap(p => [...p.functions, ...p.properties].map(x => x.name)));
    const isPlugin = (x: { name: string; pluginId?: string }) =>
      names.has(x.name) || (!!x.pluginId && ids.has(x.pluginId));
    return {
      functions:  symbols.functions.filter(f => !isPlugin(f)),
      properties: symbols.properties.filter(p => !isPlugin(p)),
      plugins:    symbols.plugins.filter(p => p.functions.length + p.properties.length > 0),
    };
  }

  // No grouping from the controller: build it.
  const ids = new Set(installed.keys());
  [...symbols.functions, ...symbols.properties].forEach(x => { if (x.pluginId) ids.add(x.pluginId); });
  const owner = (x: { name: string; pluginId?: string }): string | undefined => {
    if (x.pluginId) return x.pluginId;
    const dot = x.name.indexOf(".");
    if (dot <= 0) return undefined;
    const root = x.name.slice(0, dot);
    return installed.has(root) ? root : undefined;
  };

  const groups = new Map<string, ExpressionPluginSymbols>();
  const group = (id: string) => {
    let g = groups.get(id);
    if (!g) {
      const p = installed.get(id);
      g = { id, name: p?.name ?? id, running: p?.running ?? true, functions: [], properties: [] };
      groups.set(id, g);
    }
    return g;
  };
  const functions: ExpressionFunction[] = [];
  const properties: ExpressionProperty[] = [];
  for (const f of symbols.functions) {
    const id = owner(f);
    if (id && ids.has(id)) group(id).functions.push(f); else functions.push(f);
  }
  for (const p of symbols.properties) {
    const id = owner(p);
    if (id && ids.has(id)) group(id).properties.push(p); else properties.push(p);
  }
  return { functions, properties, plugins: [...groups.values()] };
}

/** The current expression symbols, split into built-ins and per-plugin groups. */
export function useSplitSymbols(): SplitSymbols {
  const env = useExpressionEnv();
  const { plugins } = usePluginContributions();
  const symbols = env?.symbols;
  return useMemo(() => splitPluginSymbols(symbols, plugins), [symbols, plugins]);
}

/** Section title for a plugin group. */
export function pluginGroupTitle(g: ExpressionPluginSymbols): string {
  return `${g.name} · plugin${g.running ? "" : " (not running)"}`;
}
