import Anthropic from "@anthropic-ai/sdk";
import { MARKUP_PERCENTAGE, SUPPORTED_MODELS } from "./core-adapter.js";
import OpenAI from "openai";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

interface ModelRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  output_format?: "text" | "json" | "markdown";
}

interface ModelResponse {
  output: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  model: string;
  latency_ms: number;
}

export async function callModel(req: ModelRequest): Promise<ModelResponse> {
  const modelInfo = SUPPORTED_MODELS.find(
    (m: (typeof SUPPORTED_MODELS)[number]) => m.id === req.model,
  );
  if (!modelInfo) throw new Error(`Unsupported model: ${req.model}`);

  const start = Date.now();

  if (modelInfo.provider === "anthropic") {
    return callAnthropic(req, modelInfo, start);
  }
  if (modelInfo.provider === "openai") {
    return callOpenAI(req, modelInfo, start);
  }

  throw new Error(`Unsupported provider: ${modelInfo.provider}`);
}

async function callAnthropic(
  req: ModelRequest,
  modelInfo: (typeof SUPPORTED_MODELS)[number],
  start: number,
): Promise<ModelResponse> {
  const response = await anthropic.messages.create({
    model: req.model,
    max_tokens: req.max_tokens || 4096,
    temperature: req.temperature,
    system: req.system,
    messages: [{ role: "user", content: req.prompt }],
  });

  const output =
    response.content[0].type === "text" ? response.content[0].text : "";

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costCents = calculateCost(inputTokens, outputTokens, modelInfo);

  return {
    output,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_cents: costCents,
    model: req.model,
    latency_ms: Date.now() - start,
  };
}

async function callOpenAI(
  req: ModelRequest,
  modelInfo: (typeof SUPPORTED_MODELS)[number],
  start: number,
): Promise<ModelResponse> {
  const response = await openai.chat.completions.create({
    model: req.model,
    max_tokens: req.max_tokens || 4096,
    temperature: req.temperature,
    messages: [
      ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
      { role: "user" as const, content: req.prompt },
    ],
    ...(req.output_format === "json"
      ? { response_format: { type: "json_object" } }
      : {}),
  });

  const output = response.choices[0]?.message?.content || "";
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const costCents = calculateCost(inputTokens, outputTokens, modelInfo);

  return {
    output,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_cents: costCents,
    model: req.model,
    latency_ms: Date.now() - start,
  };
}

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelInfo: (typeof SUPPORTED_MODELS)[number],
): number {
  const inputCost =
    (inputTokens / 1_000_000) * modelInfo.input_cost_per_million;
  const outputCost =
    (outputTokens / 1_000_000) * modelInfo.output_cost_per_million;
  const baseCost = inputCost + outputCost;
  const withMarkup = baseCost * (1 + MARKUP_PERCENTAGE / 100);
  return Math.ceil(withMarkup); // cents
}
