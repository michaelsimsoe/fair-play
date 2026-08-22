export function isStandalone(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosNavigator.standalone === true
  );
}

export function isIosSafari(): boolean {
  const userAgent = navigator.userAgent;
  return /iP(ad|hone|od)/.test(userAgent) && /Safari/.test(userAgent);
}
