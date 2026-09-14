export type FsKind = "dir" | "file";

export interface FsNode {
  name: string;
  kind: FsKind;
  children?: Record<string, FsNode>;
  content?: string;
}

export interface FsState {
  root: FsNode;
  reg?: Record<string, string>;
}

export type FsError =
  | "invalidPath"
  | "notFound"
  | "duplicate"
  | "notADir"
  | "notAFile"
  | "isDir"
  | "dirNotEmpty"
  | "rootOp"
  | "destExists"
  | "emptyArg";

export type FsResult<T> = { ok: true; value: T } | { ok: false; error: FsError };

export const USER_HOME = ["Users", "Estudiante"];

function cloneNode(node: FsNode): FsNode {
  const out: FsNode = { name: node.name, kind: node.kind };
  if (node.children) {
    out.children = {};
    for (const key of Object.keys(node.children)) {
      out.children[key] = cloneNode(node.children[key]);
    }
  }
  if (node.content !== undefined) out.content = node.content;
  return out;
}

export function cloneState(state: FsState): FsState {
  const out: FsState = { root: cloneNode(state.root) };
  if (state.reg) out.reg = { ...state.reg };
  return out;
}

export function createInitialFs(): FsState {
  const root: FsNode = {
    name: "C:",
    kind: "dir",
    children: {
      Windows: {
        name: "Windows",
        kind: "dir",
        children: {
          System32: {
            name: "System32",
            kind: "dir",
            children: {
              "cmd.exe": { name: "cmd.exe", kind: "file", content: "binario simulado" },
              "notepad.exe": { name: "notepad.exe", kind: "file", content: "binario simulado" },
            },
          },
        },
      },
      Users: {
        name: "Users",
        kind: "dir",
        children: {
          Estudiante: {
            name: "Estudiante",
            kind: "dir",
            children: {
              Documentos: {
                name: "Documentos",
                kind: "dir",
                children: {
                  "apuntes.txt": {
                    name: "apuntes.txt",
                    kind: "file",
                    content: "Comandos basicos de CMD:\r\n  dir, cd, mkdir, type, echo, del, copy\r\nPractica todos los dias.",
                  },
                  "tareas.txt": {
                    name: "tareas.txt",
                    kind: "file",
                    content: "1. Aprender a navegar con cd\n2. Crear carpetas con mkdir\n3. Leer archivos con type",
                  },
                },
              },
              Escritorio: {
                name: "Escritorio",
                kind: "dir",
                children: {
                  "bienvenido.txt": {
                    name: "bienvenido.txt",
                    kind: "file",
                    content: "Bienvenido a la terminal de practica.\nTodo lo que haces aqui es simulado: nada de tu PC real se toca.\nEscribe help para ver los comandos disponibles.",
                  },
                },
              },
              Imágenes: { name: "Imágenes", kind: "dir", children: {} },
              Descargas: { name: "Descargas", kind: "dir", children: {} },
            },
          },
          Publico: { name: "Publico", kind: "dir", children: {} },
        },
      },
    },
  };
  return { root };
}

export function normalizeSegments(input: string): string[] {
  const parts = input.split(/[\\/]+/).filter((p) => p.length > 0 && p !== "C:" && p !== "c:");
  const out: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(part);
  }
  return out;
}

export function resolvePath(cwd: string[], input: string): { ok: true; value: string[] } {
  const trimmed = input.trim();
  const rawParts = trimmed.split(/[\\/]+/).filter((p) => p.length > 0 && p.toLowerCase() !== "c:");
  const absolute = trimmed.startsWith("\\") || trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed);
  const combined = absolute ? rawParts : [...cwd, ...rawParts];
  const out: string[] = [];
  for (const part of combined) {
    if (part === ".") continue;
    if (part === "..") {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(part);
  }
  return { ok: true, value: out };
}

export function pathToString(segments: string[]): string {
  if (segments.length === 0) return "C:";
  return `C:\\${segments.join("\\")}`;
}

function findNode(node: FsNode, segments: string[]): FsNode | null {
  let current: FsNode = node;
  for (const seg of segments) {
    if (current.kind !== "dir" || !current.children) return null;
    const key = Object.keys(current.children).find((k) => k.toLowerCase() === seg.toLowerCase());
    if (!key) return null;
    current = current.children[key];
  }
  return current;
}

export function getNode(state: FsState, path: string[]): FsNode | null {
  return findNode(state.root, path);
}

export function pathExists(state: FsState, path: string[]): boolean {
  return getNode(state, path) !== null;
}

export function dirExists(state: FsState, path: string[]): boolean {
  const node = getNode(state, path);
  return node !== null && node.kind === "dir";
}

export function fileExists(state: FsState, path: string[]): boolean {
  const node = getNode(state, path);
  return node !== null && node.kind === "file";
}

export function dirContains(state: FsState, dirPath: string[], childName: string, kind?: FsKind): boolean {
  const node = getNode(state, dirPath);
  if (!node || node.kind !== "dir" || !node.children) return false;
  const key = Object.keys(node.children).find((k) => k.toLowerCase() === childName.toLowerCase());
  if (!key) return false;
  return kind ? node.children[key].kind === kind : true;
}

export function listDir(state: FsState, path: string[]): FsResult<{ name: string; kind: FsKind }[]> {
  const node = getNode(state, path);
  if (!node) return { ok: false, error: "notFound" };
  if (node.kind !== "dir") return { ok: false, error: "notADir" };
  const entries = Object.values(node.children ?? {}).map((n) => ({ name: n.name, kind: n.kind }));
  entries.sort((a, b) => (a.kind === b.kind ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.kind === "dir" ? -1 : 1));
  return { ok: true, value: entries };
}

function insertChild(node: FsNode, segments: string[], build: () => FsNode): FsError | null {
  if (segments.length === 0) return "rootOp";
  let current = node;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = Object.keys(current.children ?? {}).find((k) => k.toLowerCase() === segments[i].toLowerCase());
    if (!key) return "notFound";
    current = current.children![key];
    if (current.kind !== "dir") return "notADir";
  }
  const leafName = segments[segments.length - 1];
  if (Object.keys(current.children ?? {}).some((k) => k.toLowerCase() === leafName.toLowerCase())) return "duplicate";
  current.children = current.children ?? {};
  current.children[leafName] = build();
  current.children[leafName].name = leafName;
  return null;
}

export function mkdir(state: FsState, path: string[]): FsResult<FsState> {
  if (path.length === 0) return { ok: false, error: "rootOp" };
  const next = cloneState(state);
  const err = insertChild(next.root, path, () => ({ name: path[path.length - 1], kind: "dir", children: {} }));
  if (err) return { ok: false, error: err };
  return { ok: true, value: next };
}

export function writeFile(state: FsState, path: string[], content: string, append = false): FsResult<FsState> {
  if (path.length === 0) return { ok: false, error: "rootOp" };
  const parent = getNode(state, path.slice(0, -1));
  if (!parent || parent.kind !== "dir") return { ok: false, error: "notFound" };
  const leafName = path[path.length - 1];
  const existingKey = parent.children ? Object.keys(parent.children).find((k) => k.toLowerCase() === leafName.toLowerCase()) : undefined;
  if (existingKey && parent.children![existingKey].kind === "dir") return { ok: false, error: "isDir" };
  const next = cloneState(state);
  const parentNode = getNode(next, path.slice(0, -1))!;
  const name = existingKey ?? leafName;
  const prevContent = existingKey ? (parentNode.children![existingKey].content ?? "") : "";
  parentNode.children = parentNode.children ?? {};
  parentNode.children[name] = {
    name,
    kind: "file",
    content: append && existingKey ? prevContent + content : content,
  };
  return { ok: true, value: next };
}

export function readFile(state: FsState, path: string[]): FsResult<string> {
  const node = getNode(state, path);
  if (!node) return { ok: false, error: "notFound" };
  if (node.kind !== "file") return { ok: false, error: "notAFile" };
  return { ok: true, value: node.content ?? "" };
}

export function deletePath(state: FsState, path: string[], recursive = false): FsResult<FsState> {
  if (path.length === 0) return { ok: false, error: "rootOp" };
  const target = getNode(state, path);
  if (!target) return { ok: false, error: "notFound" };
  if (target.kind === "dir" && !recursive && Object.keys(target.children ?? {}).length > 0) {
    return { ok: false, error: "dirNotEmpty" };
  }
  const next = cloneState(state);
  const parent = getNode(next, path.slice(0, -1));
  if (!parent || parent.kind !== "dir" || !parent.children) return { ok: false, error: "notFound" };
  const key = Object.keys(parent.children).find((k) => k.toLowerCase() === path[path.length - 1].toLowerCase());
  if (!key) return { ok: false, error: "notFound" };
  delete parent.children[key];
  return { ok: true, value: next };
}

export function copyPath(state: FsState, srcPath: string[], dstPath: string[]): FsResult<FsState> {
  const src = getNode(state, srcPath);
  if (!src) return { ok: false, error: "notFound" };
  const dst = getNode(state, dstPath);
  if (dst && dst.kind === "dir") {
    const next = cloneState(state);
    const dstNode = getNode(next, dstPath)!;
    if (Object.keys(dstNode.children ?? {}).some((k) => k.toLowerCase() === src.name.toLowerCase())) {
      return { ok: false, error: "destExists" };
    }
    const clone = cloneNode(src);
    dstNode.children = dstNode.children ?? {};
    dstNode.children[clone.name] = clone;
    return { ok: true, value: next };
  }
  const next = cloneState(state);
  const err = insertChild(next.root, dstPath, () => cloneNode(src));
  if (err) return { ok: false, error: err };
  return { ok: true, value: next };
}

export function movePath(state: FsState, srcPath: string[], dstPath: string[]): FsResult<FsState> {
  const copied = copyPath(state, srcPath, dstPath);
  if (!copied.ok) return copied;
  const removed = deletePath(copied.value, srcPath, true);
  if (!removed.ok) return { ok: false, error: removed.error };
  return removed;
}

export function countTree(node: FsNode): { dirs: number; files: number } {
  let dirs = 0;
  let files = 0;
  for (const child of Object.values(node.children ?? {})) {
    if (child.kind === "dir") {
      dirs++;
      const sub = countTree(child);
      dirs += sub.dirs;
      files += sub.files;
    } else {
      files++;
    }
  }
  return { dirs, files };
}

export function renderTree(node: FsNode, prefix = ""): string[] {
  const out: string[] = [];
  const children = Object.values(node.children ?? {});
  children.sort((a, b) => (a.kind === b.kind ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.kind === "dir" ? -1 : 1));
  children.forEach((child, i) => {
    const last = i === children.length - 1;
    out.push(`${prefix}${last ? "└── " : "├── "}${child.name}`);
    if (child.kind === "dir") {
      out.push(...renderTree(child, `${prefix}${last ? "    " : "│   "}`));
    }
  });
  return out;
}

export function matchWildcard(name: string, pattern: string): boolean {
  const lower = name.toLowerCase();
  const pat = pattern.toLowerCase();
  if (!pat.includes("*")) return lower === pat;
  const regex = new RegExp(`^${pat.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return regex.test(lower);
}

export function countNodes(node: FsNode): number {
  let count = 1;
  for (const child of Object.values(node.children ?? {})) count += countNodes(child);
  return count;
}
