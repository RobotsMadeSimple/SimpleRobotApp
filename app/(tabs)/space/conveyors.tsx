import { conveyorErrorText } from "@/src/components/space/conveyor/conveyorHooks";
import { appAlert } from "@/src/components/ui/AppAlert";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { accents, Button, colors, EmptyState, HintBanner, InfoTip, ListRow, PageHeader, Screen, SectionHeader, spacing, StatusPill } from "@/src/components/ui/kit";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { usePushOnce } from "@/src/hooks/usePushOnce";
import type { Conveyor } from "@/src/models/robotModels";
import { useConveyors, useConveyorStatus, useConveyorsSupported } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { MoveHorizontal, Plus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Space3DToggle, SpaceList3DLayout, useRememberedFlag } from "@/src/components/space/space3d";
import type { Cell3DOptions } from "@/src/components/ui/cell3d/bridge";

// The optional 3D view: the conveyors (belt, window, live parts) in the cell; nothing else drawn.
const VIEW3D_OPTIONS: Cell3DOptions = { points: false, locals: false, sets: false, toggles: ["points", "locals"], fit: "robot" };

function sourceText(c: Conveyor) {
  switch (c.source.kind) {
    case "aux":   return `Aux axis ${c.source.axis ?? "?"}`;
    case "timed": return `Timed · ${c.source.speedMmS} mm/s`;
    default:      return "Manual travel";
  }
}

function sensorText(c: Conveyor) {
  switch (c.sensor.kind) {
    case "auxPin": return `latch D${c.sensor.pin ?? "?"}`;
    case "io":     return `IO D${c.sensor.pin ?? "?"}`;
    case "stb":    return `STB in ${c.sensor.input ?? "?"}`;
    default:       return "no sensor";
  }
}

/** One conveyor row; reads its own live slice so a running belt re-renders only its row. */
function ConveyorRow({ conveyor, onOpen, onDelete, style }: {
  conveyor: Conveyor; onOpen: () => void; onDelete: () => void; style?: object;
}) {
  const live = useConveyorStatus(conveyor.id);
  const liveText = live
    ? `${live.travelMm.toFixed(0)} mm · ${live.speedMmS.toFixed(0)} mm/s · ${live.parts.length} queued · ${live.picked} picked`
    : `Window ${conveyor.window.startMm}–${conveyor.window.endMm} mm`;
  return (
    <ListRow
      title={conveyor.name}
      subtitle={`${sourceText(conveyor)} · ${sensorText(conveyor)}\n${liveText}`}
      subtitleLines={2}
      icon={<MoveHorizontal size={20} color={accents.orange} />}
      iconColor={accents.orangeSoft}
      onPress={onOpen}
      chevron
      style={style}
      right={
        <View style={s.right}>
          {live?.tracking ? <StatusPill label="Tracking" tone="success" dot />
            : live?.running ? <StatusPill label="Running" tone="accent" dot /> : null}
          <DeleteIconButton size={15} style={s.deleteBtn} onPress={onDelete} />
        </View>
      }
    />
  );
}

export default function ConveyorsPage() {
  const pushOnce = usePushOnce();
  const conveyors = useConveyors();
  const supported = useConveyorsSupported();
  const [show3d, setShow3d] = useRememberedFlag("space.conveyors.view3d", false);
  const twoCol = usePaneLayout() === "desktop" && !show3d;

  const open = (c: Conveyor) => pushOnce(`/space/conveyor-edit?id=${encodeURIComponent(c.id)}`);

  function confirmDelete(c: Conveyor) {
    appAlert("Delete Conveyor", `Delete "${c.name}"? Program steps that use it will stop working. This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => { robotClient.deleteConveyor(c.id).catch(e => appAlert("Couldn't delete", conveyorErrorText(e))); },
      },
    ]);
  }

  return (
    <View style={s.page}>
      <NotConnectedOverlay />
      <PageHeader title="Conveyors" subtitle="Belts the robot tracks moving parts on" right={<Space3DToggle on={show3d} onChange={setShow3d} />} />
      <SpaceList3DLayout show={show3d} persistKey="space-conveyors" options={VIEW3D_OPTIONS}>
      <Screen>
        <SectionHeader
          title="Conveyors"
          right={<InfoTip text="A conveyor knows how far its belt has moved and queues each part as it passes a sensor (or as a program adds it). A Conveyor Track step then follows one part through the pick window so the robot can pick it on the move." />}
        />

        {supported === false && (
          <HintBanner id="conveyors-unsupported" dismissible={false}>
            This controller doesn&apos;t have conveyor tracking yet. Update the controller to add conveyors.
          </HintBanner>
        )}

        {conveyors.length === 0 ? (
          <EmptyState
            icon={<MoveHorizontal size={40} color={colors.textFaint} />}
            title="No conveyors yet"
            subtitle="Add one, pick where its travel comes from, then calibrate it against a mark on the belt."
          />
        ) : (
          <View style={[s.list, twoCol && s.listTwoCol]}>
            {conveyors.map(c => (
              <ConveyorRow key={c.id} conveyor={c} onOpen={() => open(c)} onDelete={() => confirmDelete(c)} style={twoCol ? s.cell : undefined} />
            ))}
          </View>
        )}

        <Button
          variant="dashed"
          label="New Conveyor"
          icon={<Plus size={16} color={accents.orange} />}
          style={s.addCard}
          textStyle={s.addCardText}
          disabled={supported === false}
          onPress={() => pushOnce("/space/conveyor-edit")}
        />
      </Screen>
      </SpaceList3DLayout>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.sm + 2 },
  listTwoCol: { flexDirection: "row", flexWrap: "wrap" },
  cell: { flexBasis: "48%", flexGrow: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deleteBtn: { padding: spacing.xs },
  addCard: { borderColor: accents.orange },
  addCardText: { color: accents.orange },
});
