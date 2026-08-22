import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioCue } from "./audioCue";
import { shareOrDownloadJson } from "./fileShare";
import { requestStoragePersistence } from "./storagePersistence";
import { vibrateForChange } from "./vibration";
import { WakeLockController } from "./wakeLock";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("progressive platform adapters", () => {
  it("keeps wake lock and audio optional when unsupported", async () => {
    const wakeLock = new WakeLockController();
    await expect(wakeLock.request()).resolves.toBeUndefined();
    expect(wakeLock.getStatus()).toBe("unsupported");

    const audio = new AudioCue();
    expect(audio.getStatus()).toBe("unavailable");
    await expect(audio.play()).resolves.toBe(false);
  });

  it("only vibrates after capability detection and user preference", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    expect(vibrateForChange(false)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(vibrateForChange(true)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([160, 80, 160]);
  });

  it("falls back to a local JSON download when file sharing is unavailable", async () => {
    const createObjectURL = vi.fn(() => "blob:backup");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await expect(shareOrDownloadJson('{"safe":true}', "fairplay.json")).resolves.toBe(
      "downloaded",
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it("treats unavailable persistent storage as non-fatal", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: undefined,
    });
    await expect(requestStoragePersistence()).resolves.toBe("unsupported");
  });
});
