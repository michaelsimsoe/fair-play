export type ShareResult = "shared" | "downloaded" | "cancelled";

export async function shareOrDownloadJson(
  json: string,
  filename: string,
): Promise<ShareResult> {
  const file = new File([json], filename, { type: "application/json" });
  const shareData: ShareData = {
    title: "FairPlay sikkerhetskopi",
    files: [file],
  };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      throw error;
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return "downloaded";
}
