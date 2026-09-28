// SPDX-License-Identifier: Apache-2.0

import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  anthropicProvider,
  claudeProvider,
  defaultModels,
  ollamaProvider,
  ProviderError,
} from "./providers.js";
import { en } from "./strings/en.js";

// Providers are tested against the shapes of their recorded responses, never
// a live endpoint.

const ask = { system: "You explain code.", prompt: "What does a() do?", maxTokens: 300 };

function recorded(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("anthropicProvider", () => {
  it("sends the key in its header only, picks the model by effort and reads the text", async () => {
    const { fetch, calls } = recorded(200, {
      id: "msg_01",
      type: "message",
      role: "assistant",
      model: defaultModels.anthropic.fast,
      content: [{ type: "text", text: "It saves the invoice." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 20, output_tokens: 6 },
    });
    const provider = anthropicProvider({ key: "sk-ant-secret", fetch });
    expect(await provider.complete({ ...ask, effort: "fast" })).toBe("It saves the invoice.");
    const call = calls[0];
    if (!call) throw new Error("no request");
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect((call.init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-secret");
    const body = JSON.parse(String(call.init.body));
    expect(body).toEqual({
      model: defaultModels.anthropic.fast,
      max_tokens: 300,
      thinking: { type: "disabled" },
      system: ask.system,
      messages: [{ role: "user", content: ask.prompt }],
    });
    expect(String(call.init.body)).not.toContain("sk-ant-secret");
  });

  it("fails with the provider's message and status, never the key", async () => {
    const { fetch } = recorded(401, {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });
    const provider = anthropicProvider({ key: "sk-ant-secret", fetch });
    const error = await provider.complete({ ...ask, effort: "best" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ message: "invalid x-api-key", status: 401 });
    expect(String((error as Error).message)).not.toContain("sk-ant-secret");
  });
});

describe("anthropicProvider stopping short", () => {
  it("fails on an answer cut off or declined, instead of giving half of it", async () => {
    for (const [stop, message] of [
      ["max_tokens", en.provider.cutOff],
      ["refusal", en.provider.declined],
    ] as const) {
      const { fetch } = recorded(200, {
        type: "message",
        content: [{ type: "text", text: '{"intro": "In th' }],
        stop_reason: stop,
      });
      await expect(
        anthropicProvider({ key: "k", fetch }).complete({ ...ask, effort: "best" }),
      ).rejects.toMatchObject({ message });
    }
  });
});

describe("ollamaProvider", () => {
  it("asks the local server, with the user's model, and reads the message", async () => {
    const { fetch, calls } = recorded(200, {
      model: "llama3.1",
      created_at: "2026-09-28T09:00:00Z",
      message: { role: "assistant", content: "It saves the invoice." },
      done: true,
    });
    const provider = ollamaProvider({ model: "llama3.1", fetch });
    expect(await provider.complete({ ...ask, effort: "fast" })).toBe("It saves the invoice.");
    expect(calls[0]?.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      model: "llama3.1",
      stream: false,
      messages: [
        { role: "system", content: ask.system },
        { role: "user", content: ask.prompt },
      ],
    });
  });
});

describe("claudeProvider", () => {
  it("runs the claude command in print mode and reads its result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codemap-claude-"));
    try {
      // Answers as `claude -p --output-format json` does, and reports its
      // arguments and what it read, so the test can see them.
      const command = join(dir, "claude");
      await writeFile(
        command,
        `#!${process.execPath}\nlet input = "";\nprocess.stdin.on("data", (c) => (input += c));\nprocess.stdin.on("end", () => process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: JSON.stringify({ args: process.argv.slice(2), input, cwd: process.cwd() }) })));\n`,
      );
      await chmod(command, 0o755);
      const provider = claudeProvider({ command });
      const answer = JSON.parse(await provider.complete({ ...ask, effort: "best" })) as {
        args: string[];
        input: string;
        cwd: string;
      };
      // No tools and no MCP servers: it answers from the prompt and nothing else.
      expect(answer.args).toEqual([
        "-p",
        "--output-format",
        "json",
        "--model",
        "sonnet",
        "--tools",
        "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--setting-sources",
        "",
        "--no-session-persistence",
        "--system-prompt",
        ask.system,
      ]);
      expect(answer.input).toBe(ask.prompt);
      // A folder of its own, empty and gone once it has answered.
      expect(answer.cwd).toMatch(/codemap-claude-/);
      await expect(stat(answer.cwd)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("gives up on a command that does not answer in time", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codemap-claude-slow-"));
    try {
      const command = join(dir, "claude");
      await writeFile(command, `#!${process.execPath}\nsetTimeout(() => {}, 60000);\n`);
      await chmod(command, 0o755);
      const provider = claudeProvider({ command, timeout: 200 });
      await expect(provider.complete({ ...ask, effort: "fast" })).rejects.toMatchObject({
        message: en.provider.timedOut,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails clearly when the command is not there", async () => {
    const provider = claudeProvider({ command: "/nonexistent/claude" });
    await expect(provider.complete({ ...ask, effort: "fast" })).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});
