// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { Language as Grammar, type Node, Parser } from "web-tree-sitter";
import type { LanguageId } from "./languages.js";

export type SymbolKind = "function" | "class" | "method" | "component";

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  exported: boolean;
  owner?: string;
}

interface Binding {
  local: string;
  imported: string;
}

export interface Import {
  specifier: string;
  bindings: Binding[];
  line: number;
}

export interface Call {
  name: string;
  receiver?: string;
  line: number;
  caller?: string;
}

export interface FileFacts {
  imports: Import[];
  symbols: CodeSymbol[];
  calls: Call[];
  directives: string[];
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

// Grammars ship as WebAssembly, so installing never compiles native code.
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

// Parse keeps key order because facts are compared as JSON.
function symbolOf(
  node: Node,
  name: string,
  kind: SymbolKind,
  exported: boolean,
  owner?: string,
): CodeSymbol {
  return {
    name,
    kind,
    startLine: line(node),
    endLine: endLine(node),
    exported,
    ...(owner ? { owner } : {}),
  };
}

function memberCall(node: Node, name: Node | null, receiver: Node | null): Call[] {
  if (!name) return [];
  return [{ name: name.text, ...(receiver ? { receiver: receiver.text } : {}), line: line(node) }];
}

const capitalised = (name: string) => /^[A-Z]/.test(name);

// Each call belongs to the innermost symbol around it.
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

// const stripe = require("stripe") binds the whole module.
function requireImport(node: Node, specifier: Node): Import {
  const declarator = node.parent?.type === "variable_declarator" ? node.parent : undefined;
  const name = declarator?.childForFieldName("name");
  const bindings = name?.type === "identifier" ? [{ local: name.text, imported: "*" }] : [];
  return { specifier: unquote(specifier.text), bindings, line: line(node) };
}

// Rendering a component is how React code calls it.
function componentRendered(node: Node): Call[] {
  const name = node.childForFieldName("name");
  return name?.type === "identifier" && capitalised(name.text)
    ? [{ name: name.text, line: line(node) }]
    : [];
}

const holdsFunction = (value: Node | null) =>
  value !== null && /^(arrow_function|function_expression|function)$/.test(value.type);

function script(root: Node, jsx: boolean): FileFacts {
  const imports: Import[] = [];
  const symbols: CodeSymbol[] = [];
  const calls: Call[] = [];

  const exported = (node: Node) => node.parent?.type === "export_statement";

  // Directives are string statements before any other statement.
  const directives: string[] = [];
  for (const statement of root.namedChildren) {
    if (statement?.type !== "expression_statement" || statement.namedChildren[0]?.type !== "string")
      break;
    directives.push(unquote(statement.namedChildren[0].text));
  }

  walk(root, (node) => {
    switch (node.type) {
      case "import_statement":
      case "export_statement": {
        const source = node.childForFieldName("source");
        if (!source) break;
        const bindings: Binding[] = [];
        walk(node, (inner) => {
          if (inner.type === "import_specifier" || inner.type === "export_specifier") {
            const name = inner.childForFieldName("name");
            const alias = inner.childForFieldName("alias");
            if (name) bindings.push({ local: (alias ?? name).text, imported: name.text });
          } else if (inner.type === "namespace_import") {
            const alias = inner.namedChildren.find((c) => c?.type === "identifier");
            if (alias) bindings.push({ local: alias.text, imported: "*" });
          } else if (inner.type === "import_clause") {
            const first = inner.namedChildren[0];
            if (first?.type === "identifier")
              bindings.push({ local: first.text, imported: "default" });
          }
        });
        imports.push({ specifier: unquote(source.text), bindings, line: line(node) });
        break;
      }
      case "call_expression": {
        const fn = node.childForFieldName("function");
        const args = node.childForFieldName("arguments");
        const first = args?.namedChildren[0];
        // require("x") and import("x") are imports, not calls.
        if (fn && first?.type === "string" && (fn.text === "require" || fn.type === "import")) {
          imports.push(requireImport(node, first));
          break;
        }
        if (fn?.type === "identifier") calls.push({ name: fn.text, line: line(node) });
        if (fn?.type === "member_expression") {
          calls.push(
            ...memberCall(node, fn.childForFieldName("property"), fn.childForFieldName("object")),
          );
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
        calls.push(...componentRendered(node));
        break;
      }
      case "function_declaration":
      case "generator_function_declaration": {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push(
            symbolOf(
              node,
              name.text,
              jsx && capitalised(name.text) ? "component" : "function",
              exported(node),
            ),
          );
        }
        break;
      }
      case "class_declaration": {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push(symbolOf(node, name.text, "class", exported(node)));
        }
        break;
      }
      case "method_definition": {
        const name = node.childForFieldName("name");
        const owner = node.parent?.parent?.childForFieldName("name")?.text;
        if (name && name.text !== "constructor") {
          symbols.push(symbolOf(node, name.text, "method", false, owner));
        }
        break;
      }
      case "variable_declarator": {
        const name = node.childForFieldName("name");
        if (name?.type === "identifier" && holdsFunction(node.childForFieldName("value"))) {
          const declaration = node.parent;
          symbols.push(
            symbolOf(
              node,
              name.text,
              jsx && capitalised(name.text) ? "component" : "function",
              declaration ? exported(declaration) : false,
            ),
          );
        }
        break;
      }
    }
  });
  return { imports, symbols, calls: attribute(calls, symbols), directives };
}

// import a.b binds a; import a.b as c binds c.
function moduleImports(node: Node): Import[] {
  const imports: Import[] = [];
  for (const name of node.childrenForFieldName("name")) {
    const aliased = name?.type === "aliased_import";
    const module = aliased ? name.childForFieldName("name") : name;
    const alias = aliased ? name.childForFieldName("alias")?.text : undefined;
    if (!module) continue;
    const local = alias ?? module.text.split(".")[0] ?? module.text;
    imports.push({
      specifier: module.text,
      bindings: [{ local, imported: "*" }],
      line: line(node),
    });
  }
  return imports;
}

const pythonPublic = (name: string) => !name.startsWith("_");

function python(root: Node): FileFacts {
  const imports: Import[] = [];
  const symbols: CodeSymbol[] = [];
  const calls: Call[] = [];
  walk(root, (node) => {
    switch (node.type) {
      case "import_statement":
        imports.push(...moduleImports(node));
        break;
      case "import_from_statement": {
        const module = node.childForFieldName("module_name");
        if (!module) break;
        const bindings: Binding[] = [];
        for (const n of node.childrenForFieldName("name")) {
          const aliased = n?.type === "aliased_import";
          const imported = aliased ? n.childForFieldName("name")?.text : n?.text;
          const local = aliased ? n.childForFieldName("alias")?.text : imported;
          if (imported && local) bindings.push({ local, imported });
        }
        imports.push({ specifier: module.text, bindings, line: line(node) });
        break;
      }
      case "function_definition": {
        const name = node.childForFieldName("name");
        const inClass = node.parent?.parent?.type === "class_definition";
        const owner = inClass ? node.parent?.parent?.childForFieldName("name")?.text : undefined;
        if (name) {
          symbols.push(
            symbolOf(
              node,
              name.text,
              inClass ? "method" : "function",
              pythonPublic(name.text),
              owner,
            ),
          );
        }
        break;
      }
      case "class_definition": {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push(symbolOf(node, name.text, "class", pythonPublic(name.text)));
        }
        break;
      }
      case "call": {
        const fn = node.childForFieldName("function");
        if (fn?.type === "identifier") calls.push({ name: fn.text, line: line(node) });
        if (fn?.type === "attribute") {
          calls.push(
            ...memberCall(node, fn.childForFieldName("attribute"), fn.childForFieldName("object")),
          );
        }
        break;
      }
    }
  });
  return { imports, symbols, calls: attribute(calls, symbols), directives: [] };
}

// Packages are named by alias, last element, or before /vN.
function goImport(node: Node): Import | undefined {
  const path = node.childForFieldName("path");
  if (!path) return undefined;
  const specifier = unquote(path.text);
  const parts = specifier.split("/");
  const last = parts.at(-1) ?? specifier;
  const name = /^v\d+$/.test(last) ? (parts.at(-2) ?? last) : last;
  const alias = node.childForFieldName("name")?.text;
  return {
    specifier,
    bindings: [{ local: alias ?? name, imported: "*" }],
    line: line(node),
  };
}

function go(root: Node): FileFacts {
  const imports: Import[] = [];
  const symbols: CodeSymbol[] = [];
  const calls: Call[] = [];
  walk(root, (node) => {
    switch (node.type) {
      case "import_spec": {
        const spec = goImport(node);
        if (spec) imports.push(spec);
        break;
      }
      case "function_declaration": {
        const name = node.childForFieldName("name");
        if (name) {
          // Go exports by capital letter.
          symbols.push(symbolOf(node, name.text, "function", capitalised(name.text)));
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
          symbols.push(symbolOf(node, name.text, "method", capitalised(name.text), owner));
        }
        break;
      }
      case "type_spec": {
        const name = node.childForFieldName("name");
        const type = node.childForFieldName("type");
        if (name && type?.type === "struct_type") {
          symbols.push(symbolOf(node, name.text, "class", capitalised(name.text)));
        }
        break;
      }
      case "call_expression": {
        const fn = node.childForFieldName("function");
        if (fn?.type === "identifier") calls.push({ name: fn.text, line: line(node) });
        if (fn?.type === "selector_expression") {
          calls.push(
            ...memberCall(node, fn.childForFieldName("field"), fn.childForFieldName("operand")),
          );
        }
        break;
      }
    }
  });
  return { imports, symbols, calls: attribute(calls, symbols), directives: [] };
}

export const readerVersion = 1;

export async function parse(language: LanguageId, source: string): Promise<FileFacts> {
  const parser = await parserFor(language);
  const tree = parser.parse(source);
  if (!tree) return { imports: [], symbols: [], calls: [], directives: [] };
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
