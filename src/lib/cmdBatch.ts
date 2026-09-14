import { resolvePath, getNode, type FsState } from "./terminalFs";
import type { CmdOptions, CmdResult } from "./winCmd";

export type BatchExecFn = (state: FsState, cwd: string[], line: string, opts: CmdOptions) => CmdResult;

export interface BatchPending {
  variable: string;
  resumeLine: number;
  source: string;
}

interface Ctx {
  state: FsState;
  cwd: string[];
  opts: CmdOptions;
  exec: BatchExecFn;
  env: Record<string, string>;
  out: string[];
  hasError: boolean;
  exited: boolean;
  status: number;
  wait: { variable: string; prompt: string } | null;
  resumeLine: number;
  goto?: string;
}

function expandBatchVars(text: string, env: Record<string, string>, args: string[]): string {
  let out = text;
  for (let i = args.length; i >= 1; i--) {
    out = out.replace(new RegExp(`%${i}`, "g"), args[i - 1] ?? "");
  }
  out = out.replace(/%(\d)/g, "");
  out = out.replace(/%%([A-Za-z])/g, "\u0000$1\u0000");
  out = out.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_m, n: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === n.toLowerCase());
    return key ? env[key] : "";
  });
  out = out.replace(/\u0000([A-Za-z])\u0000/g, "%%$1");
  return out;
}

function runBatchLine(ctx: Ctx, rawLine: string, idx: number, args: string[]): void {
  const line = rawLine.trim();
  if (line.length === 0 || line.startsWith(":") || /^rem\b/i.test(line)) return;
  const lowered = line.toLowerCase();

  if (lowered.startsWith("@echo off") || lowered === "@echo off") return;
  if (lowered === "@echo on" || lowered === "echo on") return;

  const ifMatch = line.match(/^@?if\s+(.+)$/i);
  if (ifMatch) {
    const rest = expandBatchVars(ifMatch[1], ctx.env, args);
    const notExistMatch = rest.match(/^not\s+exist\s+(.+?)\s+(.+)$/i);
    const existMatch = rest.match(/^exist\s+(.+?)\s+(.+)$/i);
    const strMatch = rest.match(/^(?:"([^"]*)"|(\S+))\s*==\s*(?:"([^"]*)"|(\S+))\s+(.+)$/i);
    const errMatch = rest.match(/^errorlevel\s+(\d+)\s+(.+)$/i);
    let cond = false;
    let command = "";
    if (notExistMatch) {
      const target = expandBatchVars(notExistMatch[1].replace(/^"|"$/g, ""), ctx.env, args);
      cond = getNode(ctx.state, resolvePath(ctx.cwd, target).value) === null;
      command = notExistMatch[2];
    } else if (existMatch) {
      const target = expandBatchVars(existMatch[1].replace(/^"|"$/g, ""), ctx.env, args);
      cond = getNode(ctx.state, resolvePath(ctx.cwd, target).value) !== null;
      command = existMatch[2];
    } else if (errMatch) {
      cond = ctx.hasError && ctx.status >= Number(errMatch[1]);
      command = errMatch[2];
    } else if (strMatch) {
      const left = strMatch[1] ?? strMatch[2];
      const right = strMatch[3] ?? strMatch[4];
      cond = (left ?? "") === (right ?? "");
      command = strMatch[5];
    } else {
      return;
    }
    if (!cond) return;
    const expandedCmd = expandBatchVars(command, ctx.env, args);
    if (ctx.env["__BAT_X"] === "1") ctx.out.push(`+ ${expandedCmd}`);
    const res = ctx.exec(ctx.state, ctx.cwd, expandedCmd, { ...ctx.opts, env: ctx.env });
    if (res.env) ctx.env = res.env;
    ctx.state = res.state;
    ctx.cwd = res.cwd;
    ctx.out.push(...res.lines);
    ctx.hasError = res.error === true;
    ctx.status = res.error ? 1 : 0;
    if (res.waitInput) {
      ctx.wait = { variable: res.waitInput.variable, prompt: res.waitInput.prompt };
      ctx.resumeLine = idx + 1;
    }
    if (res.exit) ctx.exited = true;
    return;
  }

  const gotoMatch = line.match(/^goto\s+([^\s]+)$/i);
  if (gotoMatch) {
    ctx.goto = gotoMatch[1].toLowerCase();
    return;
  }

  const forMatch = line.match(/^for\s+%%([A-Za-z])\s+in\s+\(([^)]*)\)\s+do\s+(.+)$/i);
  if (forMatch) {
    const listRaw = forMatch[2].trim();
    const items = listRaw.replace(/["']/g, "").split(/\s+/).filter((w) => w.length > 0);
    for (const item of items) {
      if (ctx.exited || ctx.wait) return;
      ctx.env[`__B${forMatch[1].toUpperCase()}`] = item;
      const expanded = expandBatchVars(forMatch[3].replace(new RegExp(`%%${forMatch[1]}`, "gi"), `%__B${forMatch[1].toUpperCase()}%`), ctx.env, args);
      if (ctx.env["__BAT_X"] === "1") ctx.out.push(`+ ${expanded}`);
      const res = ctx.exec(ctx.state, ctx.cwd, expanded, { ...ctx.opts, env: ctx.env });
      if (res.env) ctx.env = res.env;
      ctx.state = res.state;
      ctx.cwd = res.cwd;
      ctx.out.push(...res.lines);
      ctx.hasError = res.error === true;
      ctx.status = res.error ? 1 : 0;
      if (res.waitInput) {
        ctx.wait = { variable: res.waitInput.variable, prompt: res.waitInput.prompt };
        ctx.resumeLine = idx + 1;
        return;
      }
      if (res.exit) ctx.exited = true;
    }
    ctx.env[`__B${forMatch[1].toUpperCase()}`] = "";
    return;
  }

  if (lowered.startsWith("set ") || lowered === "set") {
    const res = ctx.exec(ctx.state, ctx.cwd, expandedOrRaw(line, ctx, args), { ...ctx.opts, env: ctx.env });
    if (res.env) ctx.env = res.env;
    ctx.state = res.state;
    ctx.cwd = res.cwd;
    ctx.out.push(...res.lines);
    if (res.waitInput) {
      ctx.wait = { variable: res.waitInput.variable, prompt: res.waitInput.prompt };
      ctx.resumeLine = idx + 1;
    }
    return;
  }

  const expanded = expandBatchVars(line, ctx.env, args);
  if (ctx.env["__BAT_X"] === "1") ctx.out.push(`+ ${expanded}`);
  const res = ctx.exec(ctx.state, ctx.cwd, expanded, { ...ctx.opts, env: ctx.env });
  if (res.env) ctx.env = res.env;
  ctx.state = res.state;
  ctx.cwd = res.cwd;
  ctx.out.push(...res.lines);
  if (res.error) ctx.hasError = true;
  ctx.status = res.error ? 1 : 0;
  if (res.waitInput) {
    ctx.wait = { variable: res.waitInput.variable, prompt: res.waitInput.prompt };
    ctx.resumeLine = idx + 1;
  }
  if (res.exit) ctx.exited = true;
}

function expandedOrRaw(line: string, ctx: Ctx, args: string[]): string {
  return expandBatchVars(line, ctx.env, args);
}

export interface BatchOutcome {
  lines: string[];
  state: FsState;
  cwd: string[];
  error: boolean;
  env?: Record<string, string>;
  pending?: { variable: string; resumeLine: number; source: string };
  exited: boolean;
}

export function runBatch(
  state: FsState,
  cwd: string[],
  source: string,
  opts: CmdOptions,
  exec: BatchExecFn,
  resume?: { variable: string; line: number; value: string },
  batchArgs: string[] = [],
): BatchOutcome {
  const lines = source.split(/\r?\n/);
  const ctx: Ctx = {
    state,
    cwd,
    opts,
    exec,
    env: { ...(opts.env ?? {}) },
    out: [],
    hasError: false,
    exited: false,
    status: 0,
    wait: null,
    resumeLine: -1,
  };
  let i = 0;
  if (resume) {
    i = Math.max(0, Math.min(resume.line, lines.length));
    ctx.env[resume.variable] = resume.value;
  }
  let guard = 0;
  while (i < lines.length) {
    if (ctx.exited || ctx.wait) break;
    guard++;
    if (guard > 3000) break;
    const line = lines[i].trim();
    if (ctx.goto) {
      const target = ctx.goto;
      ctx.goto = undefined;
      const labelIdx = lines.findIndex((l) => l.trim().toLowerCase() === `:${target}`);
      if (labelIdx === -1) {
        ctx.out.push(`El sistema no puede encontrar la etiqueta del programa especificada - ${target}`);
        ctx.hasError = true;
        break;
      }
      i = labelIdx + 1;
      continue;
    }
    runBatchLine(ctx, lines[i], i, batchArgs);
    i++;
  }
  if (ctx.wait) {
    return {
      lines: ctx.out,
      state: ctx.state,
      cwd: ctx.cwd,
      error: false,
      env: ctx.env,
      pending: { variable: ctx.wait.variable, resumeLine: ctx.resumeLine >= 0 ? ctx.resumeLine : lines.length, source },
      exited: false,
    };
  }
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.env)) {
    if (k.startsWith("__") || k === "?") continue;
    cleaned[k] = v;
  }
  return {
    lines: ctx.out,
    state: ctx.state,
    cwd: ctx.cwd,
    error: ctx.hasError,
    env: cleaned,
    exited: ctx.exited,
  };
}
