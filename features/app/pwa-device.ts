export interface PwaDeviceSignals {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  coarseMobile: boolean;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
}

export function detectPwaDevice(signals: PwaDeviceSignals) {
  const ios =
    /iPad|iPhone|iPod/.test(signals.userAgent) ||
    (signals.platform === 'MacIntel' && signals.maxTouchPoints > 1);
  return {
    ios,
    mobile:
      ios || /Android|Mobile/i.test(signals.userAgent) || signals.coarseMobile,
    standalone: signals.displayModeStandalone || signals.navigatorStandalone,
  };
}
