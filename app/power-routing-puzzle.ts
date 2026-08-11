export const POWER_ROUTING_CAPACITY = 3;
export const POWER_ROUTING_DISPLAY_CELL_COUNT = 10;
export const POWER_ROUTING_DEVICE_CELL_COUNT = 6;
export const POWER_ROUTING_INTERACTION_ID = "interaction-012";

export type PowerRoutingDeviceId =
  | "workbenchCore"
  | "dataTerminal"
  | "coolingLoop"
  | "lighting"
  | "heater";

export type PowerRoutingState = Record<PowerRoutingDeviceId, boolean>;

export type PowerRoutingMenuTarget = PowerRoutingDeviceId | "apply";

export type PowerRoutingDevice = {
  id: PowerRoutingDeviceId;
  name: string;
  englishName: string;
  icon: string;
  power: number;
  required: boolean;
  functionLabel: string;
  description: string;
};

export const POWER_ROUTING_DEVICES: readonly PowerRoutingDevice[] = [
  {
    id: "workbenchCore",
    name: "工作臺主機",
    englishName: "WORKBENCH CORE",
    icon: "▣",
    power: 3,
    required: true,
    functionLabel: "工作臺核心控制處理器",
    description: "負責協調工具、診斷與資料系統。主機離線時，工作臺無法啟動。",
  },
  {
    id: "dataTerminal",
    name: "資料終端",
    englishName: "DATA TERMINAL",
    icon: "▤",
    power: 2,
    required: true,
    functionLabel: "診斷資料與操作介面",
    description: "載入維修資料並接收操作指令，是啟動工作臺的必要終端。",
  },
  {
    id: "lighting",
    name: "照明系統",
    englishName: "LIGHTING SYSTEM",
    icon: "☼",
    power: 2,
    required: false,
    functionLabel: "營地工作區域照明",
    description: "提供營地照明；目前有足夠月光，可暫時停止供電。",
  },
  {
    id: "heater",
    name: "加熱模組",
    englishName: "HEATER MODULE",
    icon: "♨",
    power: 2,
    required: false,
    functionLabel: "低溫環境加熱設備",
    description: "維持營地舒適溫度，目前並非工作臺啟動所需系統。",
  },
  {
    id: "coolingLoop",
    name: "冷卻循環",
    englishName: "COOLING LOOP",
    icon: "✣",
    power: 1,
    required: true,
    functionLabel: "核心散熱與熱量交換",
    description: "維持主機安全溫度。未啟動冷卻時，工作臺會中止開機。",
  },
] as const;

export const POWER_ROUTING_MENU_TARGETS: readonly PowerRoutingMenuTarget[] = [
  ...POWER_ROUTING_DEVICES.map((device) => device.id),
  "apply",
];

export function movePowerRoutingMenuTarget(
  current: PowerRoutingMenuTarget,
  direction: number,
): PowerRoutingMenuTarget {
  const currentIndex = POWER_ROUTING_MENU_TARGETS.indexOf(current);
  const nextIndex = Math.min(
    POWER_ROUTING_MENU_TARGETS.length - 1,
    Math.max(0, currentIndex + Math.sign(direction)),
  );
  return POWER_ROUTING_MENU_TARGETS[nextIndex] ?? current;
}

// 營地目前只有 3 UNIT，因此起始的 6 UNIT 負載必定過載。
// 即使配置正確，三個必要系統仍需要 6 UNIT，現階段無法完成謎題。
export const INITIAL_POWER_ROUTING_STATE: PowerRoutingState = {
  workbenchCore: false,
  dataTerminal: true,
  coolingLoop: false,
  lighting: true,
  heater: true,
};

export type PowerRoutingEvaluation = {
  capacity: number;
  load: number;
  overloaded: boolean;
  missingRequired: PowerRoutingDevice[];
  activeOptional: PowerRoutingDevice[];
  success: boolean;
  statusTitle: string;
  statusDetail: string;
};

export function createInitialPowerRoutingState(): PowerRoutingState {
  return { ...INITIAL_POWER_ROUTING_STATE };
}

export function togglePowerRoutingDevice(
  state: PowerRoutingState,
  deviceId: PowerRoutingDeviceId,
): PowerRoutingState {
  return { ...state, [deviceId]: !state[deviceId] };
}

export function evaluatePowerRouting(
  state: PowerRoutingState,
  availablePower = POWER_ROUTING_CAPACITY,
): PowerRoutingEvaluation {
  const capacity = Math.max(0, Math.floor(Number(availablePower) || 0));
  const load = POWER_ROUTING_DEVICES.reduce(
    (total, device) => total + (state[device.id] ? device.power : 0),
    0,
  );
  const missingRequired = POWER_ROUTING_DEVICES.filter(
    (device) => device.required && !state[device.id],
  );
  const activeOptional = POWER_ROUTING_DEVICES.filter(
    (device) => !device.required && state[device.id],
  );
  const overloaded = load > capacity;
  const success =
    !overloaded &&
    missingRequired.length === 0 &&
    activeOptional.length === 0;

  if (overloaded) {
    return {
      capacity,
      load,
      overloaded,
      missingRequired,
      activeOptional,
      success,
      statusTitle: "電力過載",
      statusDetail: `目前負載 ${load}/${capacity} UNIT，請關閉非必要系統。`,
    };
  }
  if (success) {
    return {
      capacity,
      load,
      overloaded,
      missingRequired,
      activeOptional,
      success,
      statusTitle: "供電穩定",
      statusDetail: "必要系統已完整供電，可以啟動工作臺。",
    };
  }

  const coolingMissing = missingRequired.some(
    (device) => device.id === "coolingLoop",
  );
  return {
    capacity,
    load,
    overloaded,
    missingRequired,
    activeOptional,
    success,
    statusTitle: coolingMissing ? "熱控警告" : "必要系統未就緒",
    statusDetail: coolingMissing
      ? "冷卻循環離線，工作臺啟動程序將被中止。"
      : missingRequired.length > 0
        ? `尚未供電：${missingRequired.map((device) => device.name).join("、")}。`
        : "目前配置無法啟動工作臺，請重新檢查設備用途。",
  };
}
