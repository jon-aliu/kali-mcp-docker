import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Provider = "openai" | "anthropic" | "ollama";

interface ProviderState {
  provider: Provider;
  apiKey: string;
  setProvider: (p: Provider) => void;
  setApiKey: (k: string) => void;
}

export const useProviderStore = create<ProviderState>()(
  persist(
    (set) => ({
      provider: "openai",
      apiKey: "",
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey }),
    }),
    {
      name: "kali-mcp-provider", // localStorage key
    }
  )
);
