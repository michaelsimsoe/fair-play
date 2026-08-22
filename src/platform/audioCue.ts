export type AudioStatus = "unavailable" | "suspended" | "ready";

type AudioContextConstructor = typeof AudioContext;

export class AudioCue {
  private context: AudioContext | undefined;

  getStatus(): AudioStatus {
    if (!this.getConstructor()) return "unavailable";
    return this.context?.state === "running" ? "ready" : "suspended";
  }

  async initialize(): Promise<AudioStatus> {
    const AudioContextClass = this.getConstructor();
    if (!AudioContextClass) return "unavailable";

    this.context ??= new AudioContextClass();
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    return this.getStatus();
  }

  async play(kind: "change" | "end" = "change"): Promise<boolean> {
    if ((await this.initialize()) !== "ready" || !this.context) return false;

    const now = this.context.currentTime;
    const frequencies = kind === "end" ? [523, 659, 784] : [740, 988];
    frequencies.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const startsAt = now + index * 0.16;
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(0.18, startsAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.13);
      oscillator.connect(gain).connect(this.context!.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + 0.14);
    });
    return true;
  }

  private getConstructor(): AudioContextConstructor | undefined {
    const safariWindow = window as typeof window & {
      webkitAudioContext?: AudioContextConstructor;
    };
    return window.AudioContext ?? safariWindow.webkitAudioContext;
  }
}
