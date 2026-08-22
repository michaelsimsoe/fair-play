export type PersistenceStatus =
  "unsupported" | "already-persistent" | "granted" | "denied";

export async function requestStoragePersistence(): Promise<PersistenceStatus> {
  if (!navigator.storage?.persist || !navigator.storage.persisted) {
    return "unsupported";
  }
  if (await navigator.storage.persisted()) return "already-persistent";
  return (await navigator.storage.persist()) ? "granted" : "denied";
}
