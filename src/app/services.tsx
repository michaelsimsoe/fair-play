import { createContext, useContext, type PropsWithChildren } from "react";
import { AudioCue } from "../platform/audioCue";
import { WakeLockController } from "../platform/wakeLock";
import { repository, type FairPlayRepository } from "../storage/repository";

export type AppServices = {
  repository: FairPlayRepository;
  audio: AudioCue;
  wakeLock: WakeLockController;
};

const defaultServices: AppServices = {
  repository,
  audio: new AudioCue(),
  wakeLock: new WakeLockController(),
};

const ServicesContext = createContext<AppServices>(defaultServices);

export function ServicesProvider({
  services = defaultServices,
  children,
}: PropsWithChildren<{ services?: AppServices }>) {
  return (
    <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
  );
}

export function useServices(): AppServices {
  return useContext(ServicesContext);
}
