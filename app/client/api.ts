import { getClientConfig } from "../config/client";
import {
  ACCESS_CODE_PREFIX,
  ModelProvider,
  ServiceProvider,
} from "../constant";
import {
  ChatMessageTool,
  ModelType,
  useAccessStore,
  useChatStore,
} from "../store";
import { ChatGPTApi, DalleRequestPayload } from "./platforms/openai";
import { GeminiProApi } from "./platforms/google";
import { ClaudeApi } from "./platforms/anthropic";
import { DeepSeekApi } from "./platforms/deepseek";
import { XAIApi } from "./platforms/xai";
import { OpenRouterApi } from "./platforms/openrouter";

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export const Models = ["gpt-3.5-turbo", "gpt-4"] as const;
export type ChatModel = ModelType;

export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface MultimodalContentForAlibaba {
  text?: string;
  image?: string;
}

export interface RequestMessage {
  role: MessageRole;
  content: string | MultimodalContent[];
}

export interface LLMConfig {
  model: string;
  providerName?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  size?: DalleRequestPayload["size"];
  quality?: DalleRequestPayload["quality"];
  style?: DalleRequestPayload["style"];
}

export interface ChatOptions {
  messages: RequestMessage[];
  config: LLMConfig;

  onUpdate?: (message: string, chunk: string) => void;
  onFinish: (message: string, responseRes: Response) => void;
  onError?: (err: Error) => void;
  onController?: (controller: AbortController) => void;
  onBeforeTool?: (tool: ChatMessageTool) => void;
  onAfterTool?: (tool: ChatMessageTool) => void;
}

export interface LLMModel {
  name: string;
  displayName?: string;
  available: boolean;
  provider: LLMModelProvider;
  sorted: number;
}

export interface LLMModelProvider {
  id: string;
  providerName: string;
  providerType: string;
  sorted: number;
}

export abstract class LLMApi {
  abstract chat(options: ChatOptions): Promise<void>;
  abstract models(): Promise<LLMModel[]>;
}

export class ClientApi {
  public llm: LLMApi;

  constructor(provider: ModelProvider = ModelProvider.GPT) {
    switch (provider) {
      case ModelProvider.GeminiPro:
        this.llm = new GeminiProApi();
        break;
      case ModelProvider.Claude:
        this.llm = new ClaudeApi();
        break;
      case ModelProvider.DeepSeek:
        this.llm = new DeepSeekApi();
        break;
      case ModelProvider.XAI:
        this.llm = new XAIApi();
        break;
      case ModelProvider.OpenRouter:
        this.llm = new OpenRouterApi();
        break;
      default:
        this.llm = new ChatGPTApi();
    }
  }

  config() {}

  prompts() {}

  masks() {}
}

export function getBearerToken(
  apiKey: string,
  noBearer: boolean = false,
): string {
  return validString(apiKey)
    ? `${noBearer ? "" : "Bearer "}${apiKey.trim()}`
    : "";
}

export function validString(x: string): boolean {
  return x?.length > 0;
}

export function getHeaders(ignoreHeaders: boolean = false) {
  const accessStore = useAccessStore.getState();
  const chatStore = useChatStore.getState();
  let headers: Record<string, string> = {};
  if (!ignoreHeaders) {
    headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  const clientConfig = getClientConfig();

  function getConfig() {
    const modelConfig = chatStore.currentSession().mask.modelConfig;
    const isGoogle = modelConfig.providerName === ServiceProvider.Google;
    const isAnthropic = modelConfig.providerName === ServiceProvider.Anthropic;
    const isDeepSeek = modelConfig.providerName === ServiceProvider.DeepSeek;
    const isXAI = modelConfig.providerName === ServiceProvider.XAI;
    const isEnabledAccessControl = accessStore.enabledAccessControl();
    const apiKey = isGoogle
      ? accessStore.googleApiKey
      : isAnthropic
      ? accessStore.anthropicApiKey
      : isXAI
      ? accessStore.xaiApiKey
      : isDeepSeek
      ? accessStore.deepseekApiKey
      : accessStore.openaiApiKey;
    return {
      isGoogle,
      isAnthropic,
      isDeepSeek,
      isXAI,
      apiKey,
      isEnabledAccessControl,
    };
  }

  function getAuthHeader(): string {
    return isAnthropic
      ? "x-api-key"
      : isGoogle
      ? "x-goog-api-key"
      : "Authorization";
  }

  const {
    isGoogle,
    isAnthropic,
    isDeepSeek,
    isXAI,
    apiKey,
    isEnabledAccessControl,
  } = getConfig();

  const authHeader = getAuthHeader();

  const bearerToken = getBearerToken(
    apiKey,
    isAnthropic || isGoogle,
  );

  if (bearerToken) {
    headers[authHeader] = bearerToken;
  } else if (isEnabledAccessControl && validString(accessStore.accessCode)) {
    headers["Authorization"] = getBearerToken(
      ACCESS_CODE_PREFIX + accessStore.accessCode,
    );
  }

  return headers;
}

export function getClientApi(provider: ServiceProvider): ClientApi {
  switch (provider) {
    case ServiceProvider.Google:
      return new ClientApi(ModelProvider.GeminiPro);
    case ServiceProvider.Anthropic:
      return new ClientApi(ModelProvider.Claude);
    case ServiceProvider.DeepSeek:
      return new ClientApi(ModelProvider.DeepSeek);
    case ServiceProvider.XAI:
      return new ClientApi(ModelProvider.XAI);
    case ServiceProvider.OpenRouter:
      return new ClientApi(ModelProvider.OpenRouter);
    default:
      return new ClientApi(ModelProvider.GPT);
  }
}
