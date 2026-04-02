# RobotReact

The mobile and web control app for **Tibert** — an open-source, workbench-sized 4-axis robot arm built for pick and place, machine tending, and small business automation. Part of the [Robots Made Simple](https://github.com/RobotsMadeSimple) ecosystem.

---

## What It Does

RobotReact is an Expo/React Native app that connects to [RobotController](https://github.com/RobotsMadeSimple/RobotController) over WebSocket. It provides:

- **Auto-discovery** — finds the robot automatically on your local network via mDNS
- **Live status** — real-time robot state, position, and program status
- **Jogging** — manually move individual axes
- **Program editor** — create and manage automation programs
- **Point teaching** — save robot positions directly from the app
- **IO dashboard** — view inputs, toggle outputs, configure Arduino Nano pins
- **NeoPixel control** — set status light colors per device

---

## Requirements

- [Node.js 18+](https://nodejs.org/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Android device or emulator, or a web browser
- A running instance of [RobotController](https://github.com/RobotsMadeSimple/SimpleRobotController) on your network

---

## Getting Started

```bash
git clone https://github.com/RobotsMadeSimple/RobotReact.git
cd RobotReact
npm install
npx expo start
```

Press `a` to open on Android or `w` to open in a browser.

The app will automatically discover your robot on the local network. If discovery fails, you can enter the robot's IP address manually.

---

## Platform Support

| Platform | Status |
|---|---|
| Android | ✅ Tested |
| Web | ✅ Tested |
| Windows (Electron) | ✅ Supported |
| iOS | Untested |

---

## Running as a Desktop App (Windows)

RobotReact can run as a native Windows desktop app via Electron.

**Open in a window (development):**
```bash
npm run electron
```

**Build a distributable `.exe` installer:**
```bash
npm run electron:build
```

The installer is output to the `release/` folder.

---

## App Structure

```
app/
├── (tabs)/
│   ├── index.tsx         — Robot status and controls
│   ├── jog.tsx           — Manual axis jogging
│   ├── programs.tsx      — Program list and editor
│   └── io/
│       ├── index.tsx     — IO dashboard
│       └── configure.tsx — Nano pin configuration
```

---

## Connecting to the Robot

RobotReact connects to [RobotController](https://github.com/RobotsMadeSimple/RobotController) via WebSocket on port `9000`. Make sure:

1. RobotController is running on the same network
2. Port `9000` is accessible
3. Both devices are on the same subnet (for mDNS auto-discovery)

---

## Ecosystem

Robots Made Simple is a fully open-source automation ecosystem. RobotReact is the universal UI across all devices:

- **[RobotController](https://github.com/RobotsMadeSimple/RobotController)** — Core control platform and WebSocket server
- **[ArduinoNano](https://github.com/RobotsMadeSimple/ArduinoNano)** — Edge device firmware
- Workstations, tooling, and more — coming soon

---

## License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2026 RobotsMadeSimple
