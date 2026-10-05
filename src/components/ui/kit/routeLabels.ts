// Humanized names for route segments, used by PageHeader to build breadcrumb
// trails and back labels. Add an entry whenever a new route is created —
// unknown segments fall back to Title Case of the slug.

export const ROUTE_LABELS: Record<string, string> = {
  // Tabs
  robot:   "Robot",
  program: "Program",
  control: "Control",
  io:      "I/O",
  space:   "Space",

  // Robot
  "connected-robot": "Connected Robot",
  about:             "About",
  config:            "Configure",

  // Program
  builder:           "Program Builder",
  "cnc-builder":     "CNC Builder",
  "monitor-program": "Monitor",
  "phone-programs":  "Local Programs",
  "robot-programs":  "Programs",
  routines:          "Routines",
  vision:            "Vision",
  "vision-editor":   "Vision Editor",
  "inspection":      "Inspection",

  // Control
  jog: "Jog & Teach",

  // I/O
  auxiliary:         "Aux Axis",
  cameras:           "Cameras",
  configure:         "Configure",
  "configure-relay": "Configure Relay",
  nanos:             "Nano IO",
  relay:             "Relay",
  stb:               "STB Servos",

  // Space
  grids:        "Grids",
  "grid-edit":  "Edit Grid",
  stacks:       "Stacks",
  "stack-edit": "Edit Stack",
  locals:       "Locals",
  points:       "Points",
  tools:        "Tools",
};

/** Label for a route segment: the map entry, or Title Case of the slug. */
export function labelForSegment(segment: string): string {
  const known = ROUTE_LABELS[segment];
  if (known) return known;
  return segment
    .split("-")
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
