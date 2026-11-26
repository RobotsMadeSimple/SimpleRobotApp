import type { StyleProp, ViewStyle } from "react-native";

import type { Cell3DOptions, Cell3DPreview, Cell3DSet, Cell3DTarget, Cell3DTheme, Cell3DViewName } from "./bridge";

export type Cell3DViewProps = {
  style?: StyleProp<ViewStyle>;
  /** Background / overlay theme (the app is light). */
  theme?: Cell3DTheme;
  /** Initial toggles (and which overlay controls show); remembered changes win when `persistKey` is set. */
  options?: Cell3DOptions;
  defaultView?: Cell3DViewName;
  /** Remember toggles + view under this key (AsyncStorage), e.g. "jog". */
  persistKey?: string;
  /** Grids / stacks / marks to draw (the Space tab). */
  sets?: Cell3DSet[];
  /** The item to emphasise, by stable id. */
  highlight?: Cell3DTarget | null;
  /** Pan to the highlighted item when it changes and is off screen. */
  focusHighlight?: boolean;
  /** The item being edited, drawn from its unsaved values. */
  preview?: Cell3DPreview | null;
  /** A tap on a marker (null = on empty space). */
  onPick?: (target: Cell3DTarget | null) => void;
};
