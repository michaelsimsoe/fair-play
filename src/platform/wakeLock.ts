export type WakeLockStatus =
  "unsupported" | "requesting" | "active" | "released" | "failed";

type StatusListener = (status: WakeLockStatus) => void;

export class WakeLockController {
  private sentinel: WakeLockSentinel | undefined;
  private status: WakeLockStatus = "wakeLock" in navigator ? "released" : "unsupported";
  private readonly listeners = new Set<StatusListener>();

  getStatus(): WakeLockStatus {
    return this.status;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  async request(): Promise<void> {
    if (!("wakeLock" in navigator)) {
      this.setStatus("unsupported");
      return;
    }

    if (this.sentinel && !this.sentinel.released) {
      this.setStatus("active");
      return;
    }

    this.setStatus("requesting");
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      this.setStatus("active");
      this.sentinel.addEventListener(
        "release",
        () => {
          this.sentinel = undefined;
          this.setStatus("released");
        },
        { once: true },
      );
    } catch {
      this.sentinel = undefined;
      this.setStatus("failed");
    }
  }

  async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = undefined;
    if (sentinel && !sentinel.released) {
      await sentinel.release();
    }
    if (this.status !== "unsupported") {
      this.setStatus("released");
    }
  }

  private setStatus(status: WakeLockStatus): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
