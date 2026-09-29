// SPDX-License-Identifier: Apache-2.0

import { spawn as spawnProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { en } from "./strings/en.js";

// The user's own provider, the only place Codemap sends anything to. Three
// kinds: Claude through the `claude` command the user has installed and
// signed in to, the Anthropic API with the user's key, or a local model
// through Ollama. Nothing here logs a key, a prompt or a reply; an error
// carries the provider's message and status only.

export type ProviderKind = "claude" | "anthropic" | "ollama";

// Explanations are many and short: the fast model. An answer to a question
// weighs more: the best one.
export type Effort = "fast" | "best";

export interface Completion {
  system: string;
  prompt: string;
  maxTokens: number;
  effort: Effort;
}

export interface Provider {
  kind: ProviderKind;
  complete(completion: Completion): Promise<string>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// The models each kind uses unless the user names one. Ollama has no default
// the user could rely on having; it takes the model the user set up.
export const defaultModels = {
  anthropic: { fast: "claude-haiku-4-5-20251001", best: "claude-sonnet-5" },
  claude: { fast: "haiku", best: "sonnet" },
} as const;

type Fetch = typeof globalThis.fetch;

// How long one request may take before it is given up, so a provider that
// hangs cannot hold the map back.
export const requestTimeout = 120_000;

// A request that hangs is given up after the timeout, with its own words.
async function send(request: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await request(url, { ...init, signal: AbortSignal.timeout(requestTimeout) });
  } catch (error) {
    throw new ProviderError(
      error instanceof Error && error.name === "TimeoutError"
        ? en.provider.timedOut
        : en.provider.unreachable,
    );
  }
}

async function failure(response: Response): Promise<ProviderError> {
  let message = response.statusText;
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    message = typeof body.error === "string" ? body.error : (body.error?.message ?? message);
  } catch {
    // Not JSON: the status text says enough.
  }
  return new ProviderError(message, response.status);
}

export function anthropicProvider(options: {
  key: string;
  models?: Partial<Record<Effort, string>>;
  fetch?: Fetch;
}): Provider {
  const request = options.fetch ?? globalThis.fetch;
  return {
    kind: "anthropic",
    async complete({ system, prompt, maxTokens, effort }) {
      const response = await send(request, "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": options.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: options.models?.[effort] ?? defaultModels.anthropic[effort],
          max_tokens: maxTokens,
          // No thinking: it would count against max_tokens and could leave
          // the answer cut off.
          thinking: { type: "disabled" },
          system,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok) throw await failure(response);
      const body = (await response.json()) as {
        content?: { type: string; text?: string }[];
        stop_reason?: string;
      };
      if (body.stop_reason === "max_tokens") throw new ProviderError(en.provider.cutOff);
      if (body.stop_reason === "refusal") throw new ProviderError(en.provider.declined);
      return (body.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("");
    },
  };
}

export function ollamaProvider(options: { model: string; host?: string; fetch?: Fetch }): Provider {
  const request = options.fetch ?? globalThis.fetch;
  const host = options.host ?? "http://127.0.0.1:11434";
  return {
    kind: "ollama",
    async complete({ system, prompt, maxTokens }) {
      const response = await send(request, `${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          stream: false,
          options: { num_predict: maxTokens },
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!response.ok) throw await failure(response);
      const body = (await response.json()) as { message?: { content?: string } };
      return body.message?.content ?? "";
    },
  };
}

// The `claude` command in print mode, with the user's own sign-in. What the
// flags hold: no tools, so the model reads no file and runs nothing; no MCP
// servers and no slash commands; no settings files; no saved session; and a
// fresh empty folder to run in, removed afterwards. What `claude` itself adds
// to every run beyond that (the user's own instructions and memory, plugin
// hooks) only --bare turns off, and --bare turns off the sign-in too.
export function claudeProvider(
  options: {
    command?: string;
    models?: Partial<Record<Effort, string>>;
    spawn?: typeof spawnProcess;
    timeout?: number;
  } = {},
): Provider {
  const run = options.spawn ?? spawnProcess;
  const limit = options.timeout ?? requestTimeout;
  return {
    kind: "claude",
    async complete({ system, prompt, effort }) {
      const model = options.models?.[effort] ?? defaultModels.claude[effort];
      const folder = await mkdtemp(join(tmpdir(), "codemap-claude-"));
      try {
        return await new Promise<string>((resolve, reject) => {
          const child = run(
            options.command ?? "claude",
            [
              "-p",
              "--output-format",
              "json",
              "--model",
              model,
              "--tools",
              "",
              "--strict-mcp-config",
              "--disable-slash-commands",
              "--setting-sources",
              "",
              "--no-session-persistence",
              "--system-prompt",
              system,
            ],
            { cwd: folder, stdio: ["pipe", "pipe", "ignore"] },
          );
          const timer = setTimeout(() => {
            child.kill();
            reject(new ProviderError(en.provider.timedOut));
          }, limit);
          let out = "";
          child.stdout?.on("data", (chunk: Buffer) => {
            out += chunk.toString();
          });
          child.on("error", () => {
            clearTimeout(timer);
            reject(new ProviderError(en.provider.claudeMissing));
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            try {
              const body = JSON.parse(out) as { result?: string; is_error?: boolean };
              if (code === 0 && !body.is_error && typeof body.result === "string")
                resolve(body.result);
              else reject(new ProviderError(body.result ?? en.provider.failed));
            } catch {
              reject(new ProviderError(en.provider.noAnswer));
            }
          });
          // A command that ends before reading all of the prompt (not signed
          // in, killed) closes the pipe under it; unheard, that error would
          // end Codemap. Its end is reported by close, as any other failure.
          child.stdin?.on("error", () => {});
          child.stdin?.end(prompt);
        });
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
}
