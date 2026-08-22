export function onVisibilityReturn(callback: () => void): () => void {
  const handleVisibility = () => {
    if (document.visibilityState === "visible") callback();
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}

export function onPageHiding(callback: () => void): () => void {
  const handleVisibility = () => {
    if (document.visibilityState === "hidden") callback();
  };
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", callback);
  return () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", callback);
  };
}
