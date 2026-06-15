export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  text: string;
  provider: string;
  model: string;
  tokens_in?: number;
  tokens_out?: number;
};

export interface Provider {
  name: string;
  models: string[]; // priority order
  chat(messages: ChatMessage[], opts?: { model?: string; temperature?: number }): Promise<ChatResult>;
}
