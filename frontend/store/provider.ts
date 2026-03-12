import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Provider = "openai" | "anthropic" | "ollama" | "google";

export interface ModelInfo {
  id: string;
  label: string;
  description?: string;
  /** Approximate context window in tokens */
  context?: number;
}

export interface ProviderConfig {
  id: Provider;
  label: string;
  logo?: string;
  needsKey: boolean;
  keyPlaceholder?: string;
  keyPrefix?: string;
  baseUrlEditable?: boolean;
  models: ModelInfo[];
  note?: string;
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    keyPlaceholder: "sk-proj-...",
    keyPrefix: "sk-",
    models: [
      { id: "gpt-4o",        label: "GPT-4o",           description: "Most capable",      context: 128000 },
      { id: "gpt-4o-mini",   label: "GPT-4o mini",      description: "Fast & affordable", context: 128000 },
      { id: "o1",            label: "o1",                description: "Advanced reasoning",context: 200000 },
      { id: "o1-mini",       label: "o1-mini",           description: "Fast reasoning",    context: 128000 },
      { id: "o3-mini",       label: "o3-mini",           description: "Latest o3",         context: 200000 },
      { id: "gpt-4-turbo",   label: "GPT-4 Turbo",      description: "Previous gen",      context: 128000 },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo",    description: "Legacy, cheapest",  context: 16385  },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    needsKey: true,
    keyPlaceholder: "sk-ant-api03-...",
    keyPrefix: "sk-ant-",
    models: [
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", description: "Best balance",      context: 200000 },
      { id: "claude-3-5-haiku-20241022",  label: "Claude 3.5 Haiku",  description: "Fastest",           context: 200000 },
      { id: "claude-3-opus-20240229",     label: "Claude 3 Opus",     description: "Most intelligent",  context: 200000 },
      { id: "claude-3-sonnet-20240229",   label: "Claude 3 Sonnet",   description: "Previous gen",      context: 200000 },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    needsKey: true,
    keyPlaceholder: "AIza...",
    keyPrefix: "AIza",
    models: [
      { id: "gemini-2.0-flash",   label: "Gemini 2.0 Flash",   description: "Fastest Gemini",    context: 1000000 },
      { id: "gemini-1.5-pro",     label: "Gemini 1.5 Pro",     description: "Most capable",      context: 2000000 },
      { id: "gemini-1.5-flash",   label: "Gemini 1.5 Flash",   description: "Fast & efficient",  context: 1000000 },
      { id: "gemini-1.0-pro",     label: "Gemini 1.0 Pro",     description: "Legacy",            context: 30720   },
    ],
    note: "Requires Google AI Studio API key. Gemini support is in beta.",
  },
  {
    id: "ollama",
    label: "Ollama (Local)",
    needsKey: false,
    baseUrlEditable: true,
    models: [
      { id: "llama3",        label: "Llama 3",          description: "Meta Llama 3 8B"    },
      { id: "llama3:70b",    label: "Llama 3 70B",      description: "Meta Llama 3 70B"   },
      { id: "mistral",       label: "Mistral 7B",       description: "Mistral AI"         },
      { id: "mixtral",       label: "Mixtral 8×7B",     description: "Mixture of experts" },
      { id: "gemma:2b",      label: "Gemma 2B",         description: "Google Gemma"       },
      { id: "gemma:7b",      label: "Gemma 7B",         description: "Google Gemma"       },
      { id: "codellama",     label: "Code Llama",       description: "Meta Code Llama"    },
      { id: "deepseek-r1",   label: "DeepSeek R1",      description: "Reasoning model"    },
      { id: "phi3",          label: "Phi-3",            description: "Microsoft Phi-3"    },
      { id: "qwen2.5-coder", label: "Qwen 2.5 Coder",  description: "Alibaba coding"     },
    ],
    note: "Runs locally inside Docker — no API key required. Pull a model first.",
  },
];

interface ProviderState {
  provider: Provider;
  /** Per-provider model selection */
  models: Record<Provider, string>;
  /** Per-provider API keys */
  apiKeys: Record<Provider, string>;
  ollamaBaseUrl: string;
  /** Custom Ollama model name (for models not in the list) */
  ollamaCustomModel: string;

  setProvider: (p: Provider) => void;
  setModel: (p: Provider, model: string) => void;
  setApiKey: (p: Provider, key: string) => void;
  setOllamaBaseUrl: (url: string) => void;
  setOllamaCustomModel: (model: string) => void;

  /** Returns the currently active model id */
  activeModel: () => string;
  /** Returns the currently active API key */
  activeKey: () => string;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-20241022",
  google: "gemini-2.0-flash",
  ollama: "llama3",
};

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      provider: "openai",
      models: { ...DEFAULT_MODELS },
      apiKeys: { openai: "", anthropic: "", google: "", ollama: "" },
      ollamaBaseUrl: "http://ollama:11434",
      ollamaCustomModel: "",

      setProvider: (provider) => set({ provider }),

      setModel: (p, model) =>
        set((s) => ({ models: { ...s.models, [p]: model } })),

      setApiKey: (p, key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [p]: key } })),

      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),

      setOllamaCustomModel: (model) => set({ ollamaCustomModel: model }),

      activeModel: () => {
        const { provider, models, ollamaCustomModel } = get();
        if (provider === "ollama" && ollamaCustomModel) return ollamaCustomModel;
        return models[provider] ?? DEFAULT_MODELS[provider];
      },

      activeKey: () => {
        const { provider, apiKeys } = get();
        return apiKeys[provider] ?? "";
      },
    }),
    {
      name: "kali-mcp-provider",
    }
  )
);

