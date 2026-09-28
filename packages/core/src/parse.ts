// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { Language as Grammar, type Node, Parser } from "web-tree-sitter";
import type { LanguageId } from "./languages.js";

// What one file contains, as far as the map needs it: what it imports, which
// symbols it defines, and which names it calls from where. Structure only —
// nothing here runs or evaluates the code.

export type SymbolKind = "function" | "class" | "method" | "component";

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  // 1-based, inclusive.
  startLine: number;
  endLine: number;
  exported: boolean;
  // The class a method belongs to.
  owner?: string;
}

export interface Import {
  // As written: "./billing", "stripe", "os.path", "github.com/x/y".
  specifier: string;
  // The names taken from it; "*" for a namespace, "default" for a default.
  names: string[];
  line: number;
}

export interface Call {
  // The called name: `charge` in `stripe.charges.charge(x)`.
  name: string;
  // The object it is called on, when there is one: `stripe.charges`.
  receiver?: string;
  line: number;
  // The innermost symbol of this file the call sits in, if any.
  caller?: string;
}

export interface FileFacts {
  imports: Import[];
  symbols: CodeSymbol[];
  calls: Call[];
}

const grammarFile: Record<LanguageId, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
};

let ready: Promise<void> | undefined;
const parsers = new Map<LanguageId, Promise<Parser>>();

// The grammars ship as WebAssembly in grammars/, next to src/ and dist/, so
// installing Codemap never compiles anything.
function parserFor(language: LanguageId): Promise<Parser> {
  let parser = parsers.get(language);
  if (!parser) {
    ready ??= Parser.init();
    parser = ready.then(async () => {
      const path = new URL(`../grammars/${grammarFile[language]}`, import.meta.url);
      const grammar = await Grammar.load(new Uint8Array(await readFile(path)));
      const instance = new Parser();
      instance.setLanguage(grammar);
      return instance;
    });
    parsers.set(language, parser);
  }
  return parser;
}

const line = (node: Node) => node.startPosition.row + 1;
const endLine = (node: Node) => node.endPosition.row + 1;

function walk(node: Node, visit: (node: Node) => void) {
  visit(node);
  for (const child of node.namedChildren) if (child) walk(child, visit);
}

const unquote = (text: string) => text.replace(/^[`'"]|[`'"]$/g, "");

// A call is attributed to the innermost symbol whose lines contain it.
function attribute(calls: Call[], symbols: CodeSymbol[]): Call[] {
  return calls.map((call) => {
    let best: CodeSymbol | undefined;
    for (const symbol of symbols) {
      if (call.line < symbol.startLine || call.line > symbol.endLine) continue;
      if (!best || symbol.endLine - symbol.startLine <= best.endLine - best.startLine)
        best = symbol;
    }
    return best ? { ...call, caller: best.name } : call;
  });
}

// ---------------------------------------------------------------- TypeScript, JavaScript

const isComponentName = (name: string) => /^[A-Z]/.test(name);

function script(root: Node, jsx: boolean): FileFacts {
  const imports: Import[] = [];
  const symbols: CodeSymbol[] = [];
  const calls: Call[] = [];

  const exported = (node: Node) => node.parent?.type === "export_statement";

  walk(root, (node) => {
    switch (node.type) {
      case "import_statement":
      case "export_statement": {
        const source = node.childForFieldName("source");
        if (!source) break;
        const names: string[] = [];
        walk(node, (inner) => {
          if (inner.type === "import_specifier" || inner.type === "export_specifier") {
            const name = inner.childForFieldName("name");
            if (name) names.push(name.text);
          } else if (inner.type === "namespace_import" || inner.type === "namespace_export") {
            names.push("*");
          } else if (inner.type === "import_clause") {
            const first = inner.namedChildren[0];
            if (first?.type === "identifier") names.push("default");
          }
        });
        imports.push({ specifier: unquote(source.text), names, line: line(node) });
        break;
      }
      case "call_expression": {
        const fn = node.childForFieldName("function");
        const args = node.childForFieldName("arguments");
        const first = args?.namedChildren[0];
        // require("x") and import("x") are imports, not calls.
        if (fn && first?.type === "string" && (fn.text === "require" || fn.type === "import")) {
          imports.push({ specifier: unquote(first.text), names: ["*"], line: line(node) });
          break;
        }
        if (fn?.type === "identifier") calls.push({ name: fn.text, line: line(node) });
        if (fn?.type === "member_expression") {
          const property = fn.childForFieldName("property");
          const object = fn.childForFieldName("object");
          if (property)
            calls.push({
              name: property.text,
              ...(object ? { receiver: object.text } : {}),
              line: line(node),
            });
        }
        break;
      }
      case "new_expression": {
        const created = node.childForFieldName("constructor");
        if (created?.type === "identifier") calls.push({ name: created.text, line: line(node) });
        break;
      }
      case "jsx_opening_element":
      case "jsx_self_closing_element": {
        // Rendering a component is how React code calls it.
        const name = node.childForFieldName("name");
        if (name?.type === "identifier" && isComponentName(name.text))
          calls.push({ name: name.text, line: line(node) });
        break;
      }
      case "function_declaration":
      case "generator_function_declaration": {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push({
            name: name.text,
            kind: jsx && isComponentName(name.text) ? "component" : "function",
            startLine: line(node),
            endLine: endLine(node),
            exported: exported(node),
          });
        }
        break;
      }
      case "class_declaration": {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push({
            name: name.text,
            kind: "class",
            startLine: line(node),
            endLine: endLine(node),
            exported: exported(node),
          });
        }
        break;
      }
      case "method_definition": {
        const name = node.childForFieldName("name");
        const owner = node.parent?.parent?.childForFieldName("name")?.text;
        if (name && name.text !== "constructor") {
          symbols.push({
            name: name.text,
            kind: "method",
            startLine: line(node),
            endLine: endLine(node),
            exported: false,
            ...(owner ? { owner } : {}),
          });
        }
        break;
      }
      case "variable_declarator": {
        // const handler = async (event) => { … } is a function by another name.
        const name = node.childForFieldName("name");
        const value = node.childForFieldName("value");
        if (
          name?.type === "identifier" &&
          value &&
          /^(arrow_function|function_expression|function)$/.test(value.type)
        ) {
          const declaration = node.parent;
          symbols.push({
            name: name.text,
            kind: jsx && isComponentName(name.text) ? "component" : "function",
            startLine: line(node),
            endLine: endLine(node),
            exported: declaration ? exported(declaration) : false,
          });
        }
        break;
      }
    }
  });
  return { imports, symbols, calls: attribute(calls, symbols) };
}

// ---------------------------------------------------------------- Python

function python(root: Node): FileFacts {
  const imports: Import[] = [];
  const symbols: CodeSymbol[] = [];
  const calls: Call[] = [];
  walk(root, (node) => {
    switch (node.type) {
      case "import_statement":
        for (const name of node.childrenForFieldName("name")) {
          const module = name?.type === "aliased_import" ? name.childForFieldName("name") : name;
          if (module) imports.push({ specifier: module.text, names: ["*"], line: line(node) });
        }
        break;
      case "import_from_statement": {
        const module = node.childForFieldName("module_name");
        if (!module) break;
        const names = node
          .childrenForFieldName("name")
          .map((n) => (n?.type === "aliased_import" ? n.childForFieldName("name")?.text : n?.text))
          .filter((n): n is string => !!n);
        imports.push({
          specifier: module.text,
          names: names.length ? names : ["*"],
          line: line(node),
        });
        break;
      }
      case "function_definition": {
        const name = node.childForFieldName("name");
        const inClass = node.parent?.parent?.type === "class_definition";
        const owner = inClass ? node.parent?.parent?.childForFieldName("name")?.text : undefined;
        if (name) {
          symbols.push({
            name: name.text,
            kind: inClass ? "method" : "function",
            startLine: line(node),
            endLine: endLine(node),
            // Python has no export; a leading underscore marks what is private.
            exported: !name.text.startsWith("_"),
            ...(owner ? { owner } : {}),
          });
        }
        break;
      }
      case "class_definition": {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push({
            name: name.text,
            kind: "class",
            startLine: line(node),
            endLine: endLine(node),
            exported: !name.text.startsWith("_"),
          });
        }
        break;
      }
      case "call": {
        const fn = node.childForFieldName("function");
        if (fn?.type === "identifier") calls.push({ name: fn.text, line: line(node) });
        if (fn?.type === "attribute") {
          const attribute = fn.childForFieldName("attribute");
          const object = fn.childForFieldName("object");
          if (attribute)
            calls.push({
              name: attribute.text,
              ...(object ? { receiver: object.text } : {}),
              line: line(node),
            });
        }
        break;
      }
    }
  });
  return { imports, symbols, calls: attribute(calls, symbols) };
}

// ---------------------------------------------------------------- Go

function go(root: Node): FileFacts {
  const imports: Import[] = [];
  const symbols: CodeSymbol[] = [];
  const calls: Call[] = [];
  // Go exports by capital letter.
  const exportedName = (name: string) => /^[A-Z]/.test(name);
  walk(root, (node) => {
    switch (node.type) {
      case "import_spec": {
        const path = node.childForFieldName("path");
        if (path) imports.push({ specifier: unquote(path.text), names: ["*"], line: line(node) });
        break;
      }
      case "function_declaration": {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push({
            name: name.text,
            kind: "function",
            startLine: line(node),
            endLine: endLine(node),
            exported: exportedName(name.text),
          });
        }
        break;
      }
      case "method_declaration": {
        const name = node.childForFieldName("name");
        const receiver = node.childForFieldName("receiver");
        let owner: string | undefined;
        if (receiver) {
          walk(receiver, (inner) => {
            if (inner.type === "type_identifier") owner ??= inner.text;
          });
        }
        if (name) {
          symbols.push({
            name: name.text,
            kind: "method",
            startLine: line(node),
            endLine: endLine(node),
            exported: exportedName(name.text),
            ...(owner ? { owner } : {}),
          });
        }
        break;
      }
      case "type_spec": {
        const name = node.childForFieldName("name");
        const type = node.childForFieldName("type");
        if (name && type?.type === "struct_type") {
          symbols.push({
            name: name.text,
            kind: "class",
            startLine: line(node),
            endLine: endLine(node),
            exported: exportedName(name.text),
          });
        }
        break;
      }
      case "call_expression": {
        const fn = node.childForFieldName("function");
        if (fn?.type === "identifier") calls.push({ name: fn.text, line: line(node) });
        if (fn?.type === "selector_expression") {
          const field = fn.childForFieldName("field");
          const operand = fn.childForFieldName("operand");
          if (field)
            calls.push({
              name: field.text,
              ...(operand ? { receiver: operand.text } : {}),
              line: line(node),
            });
        }
        break;
      }
    }
  });
  return { imports, symbols, calls: attribute(calls, symbols) };
}

export async function parse(language: LanguageId, source: string): Promise<FileFacts> {
  const parser = await parserFor(language);
  const tree = parser.parse(source);
  if (!tree) return { imports: [], symbols: [], calls: [] };
  try {
    switch (language) {
      case "typescript":
      case "javascript":
        return script(tree.rootNode, language === "javascript");
      case "tsx":
        return script(tree.rootNode, true);
      case "python":
        return python(tree.rootNode);
      case "go":
        return go(tree.rootNode);
    }
  } finally {
    tree.delete();
  }
}
