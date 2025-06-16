import { ResponsesAPI, ApiPath } from "@/app/constant";
import { ChatOptions, RequestMessage, getHeaders, LLMApi, MessageRole } from "../api";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  usePluginStore,
  ChatMessageTool,
} from "@/app/store";
import { cacheImageToBase64Image, streamWithThink } from "@/app/utils/chat";
import { fetch } from "@/app/utils/stream";

export type MultiBlockContent = {
  type: "input_text" | "input_image" | "output_image";
  text?: string;
  image_url?: string;
  call_id?: string;
  output?: string;
};

export type FunctionCallContent = {
    type: "function_call" | "function_call_output";
    call_id: string;
    name?: string;
    arguments?: string;
    output?: string;
}

export type IOMessage = FunctionCallContent | {
  role: MessageRole;
  content: string | MultiBlockContent[];
};

export interface ChatRequest {
  model: string;
  input: IOMessage[];
  temperature?: number;
  top_p?: number;
  tool_choice: string;
  metadata?: object;
  stream?: boolean;
  reasoning?: {
    effort: string;
    summary: string;
  }
}

export interface ChatResponse {
  output: IOMessage[];
  incomplete_details: {
    reason: string;
  } | null;
  model: string;
  reasoning: {
    effort: string | null;
    summary: string | null;
  }
}

export type ChatStreamResponse = {
  type: string;
  sequence_number: number;
  delta?: string;
};

async function preProcessImageContentBase(
    content: RequestMessage["content"],
) {
    if (typeof content === "string") {
        return content;
    }
    const result:MultiBlockContent[] = [];
    for (const part of content) {
        if (part?.type == "image_url" && part?.image_url?.url) {
        try {
            const url = await cacheImageToBase64Image(part?.image_url?.url);
            result.push({type: "input_image", image_url: url});
        } catch (error) {
            console.error("Error processing image URL:", error);
        }
        } else {
        result.push({type: "input_text", text: part?.text});
        }
    }
    return result;
    }

export class ResponsesAPIApi implements LLMApi {

  extractMessage(res: any) {
    console.log("[Response] responsesapi response: ", res);

    return res?.output?.[0]?.content?.[0]?.text;
  }
  async chat(options: ChatOptions): Promise<void> {

    const shouldStream = !!options.config.stream;

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    const modelSpec = {
      ...useAppConfig.getState().modelSpec,
      ...useChatStore.getState().currentSession().mask.modelSpec,
    }

    // try get base64image from local cache image_url
    const messages: IOMessage[] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContentBase(v.content);
      messages.push({ role: v.role, content:content});
    }

    const prompt = messages
      .flat()
      .filter((v) => {
        if ("type" in v){
            return true;
        } else {
            if (!v.content) return false;
            if (typeof v.content === "string" && !v.content.trim()) return false;
        }
        return true;
      });

    const requestBody: ChatRequest = {
      model: modelConfig.model,
      input: prompt,
      temperature: modelConfig.temperature,
      top_p: modelConfig.top_p,
      tool_choice: "auto",
      stream: shouldStream,
    };

    if(modelConfig.model.startsWith("o")){
      requestBody.reasoning = {
        effort: modelSpec.responsesapi_reasoning_effort,
        summary: modelSpec.responsesapi_reasoning_summary,
      };
      requestBody.temperature = null;
      requestBody.top_p = null;
    }

    const path = this.path(ResponsesAPI.ChatPath);

    const controller = new AbortController();
    options.onController?.(controller);

    if (shouldStream) {
      const [tools, funcs] = usePluginStore
        .getState()
        .getAsTools(
          useChatStore.getState().currentSession().mask?.plugin || [],
        );

      return streamWithThink(
        path,
        requestBody,
        {
          ...getHeaders(),
        },
        // @ts-ignore
        tools.map((tool) => ({
          type: "function",
          name: tool?.function?.name,
          description: tool?.function?.description,
          parameters: tool?.function?.parameters,
        })),
        funcs,
        controller,
        // parseSSE
        (text: string, runTools: ChatMessageTool[]) => {
          // console.log("parseSSE", text, runTools);
          const msg = JSON.parse(text);
          switch (msg.type) {
            case "response.output_text.delta":
                return {isThinking: false, content: msg.delta};
            case "response.reasoning_summary_text.delta":
                return {isThinking: true, content: msg.delta};
            case "response.output_item.added":
                if (msg.item?.type === "function_call") {
                    runTools.push({
                        id: msg.item.call_id,
                        function: {
                            name: msg.item.name,
                            arguments: "",
                        }
                    });
                }
                return {isThinking: false, content: undefined};
            case "response.function_call_arguments.done":
                runTools[runTools.length - 1].function.arguments = msg.arguments;
                return {isThinking: false, content: undefined};
            default:
                return {isThinking: false, content: undefined};
            }
        },
        // processToolMessage, include tool_calls message and tool call results
        (
            requestPayload: ChatRequest,
            toolCallMessage: any,
            toolCallResult: any[],
        ) => {
            toolCallMessage.tool_calls.forEach(m => {
                requestPayload.input.push({
                    type: "function_call",
                    call_id: m.id,
                    name: m.function.name,
                    arguments: m.function.arguments,
                })
            });
            toolCallResult.forEach((r) => {
                requestPayload.input.push({
                    type: "function_call_output",
                    call_id: r.tool_call_id,
                    output: r.content,
                })
            });
        },
        options,
      );
    } else {
      const payload = {
        method: "POST",
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        headers: {
          ...getHeaders(),
        },
      };

      try {
        controller.signal.onabort = () =>
          options.onFinish("", new Response(null, { status: 400 }));

        const res = await fetch(path, payload);
        const resJson = await res.json();

        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      } catch (e) {
        console.error("failed to chat", e);
        options.onError?.(e as Error);
      }
    }
  }
  async models() { return []; }
  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl: string = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.responsesapiUrl;
    }

    // if endpoint is empty, use default endpoint
    if (baseUrl.trim().length === 0) {
      baseUrl = ApiPath.ResponsesAPI;
    }

    if (!baseUrl.startsWith("http") && !baseUrl.startsWith("/api")) {
      baseUrl = "https://" + baseUrl;
    }

    baseUrl = trimEnd(baseUrl, "/");

    // try rebuild url, when using cloudflare ai gateway in client
    return `${baseUrl}/${path}`;
  }
}

function trimEnd(s: string, end = " ") {
  if (end.length === 0) return s;

  while (s.endsWith(end)) {
    s = s.slice(0, -end.length);
  }

  return s;
}
