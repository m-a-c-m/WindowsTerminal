"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  executeLine,
  promptString,
  HOME,
} from "@/lib/winCmd";
import {
  createInitialFs,
  dirExists,
  fileExists,
  pathToString,
  type FsState,
} from "@/lib/terminalFs";

interface Props {
  locale?: string;
}

interface OutputEntry {
  kind: "cmd" | "out" | "ok" | "warn";
  text: string;
}

interface LessonStep {
  es: string;
  en: string;
  hintEs: string;
  hintEn: string;
  done: (state: FsState, cwd: string[], cmdsRun: string[]) => boolean;
}

interface Lesson {
  id: string;
  titleEs: string;
  titleEn: string;
  briefingEs: string;
  briefingEn: string;
  steps: LessonStep[];
}

const LESSONS: Lesson[] = [
  {
    id: "navegar",
    titleEs: "Lección 1 · Navegar por el sistema",
    titleEn: "Lesson 1 · Moving around",
    briefingEs: "Todo empieza por saber dónde estás y qué hay alrededor: CD cambia de carpeta y DIR muestra el contenido.",
    briefingEn: "Everything starts with knowing where you are: CD changes folder and DIR lists contents.",
    steps: [
      {
        es: "Ejecuta DIR para ver qué hay en tu carpeta de usuario",
        en: "Run DIR to see what is in your user folder",
        hintEs: "dir",
        hintEn: "dir",
        done: (_s, _c, cmds) => cmds.some((c) => c === "dir" || c === "ls"),
      },
      {
        es: "Entra en la carpeta Documentos",
        en: "Enter the Documentos (Documents) folder",
        hintEs: "cd Documentos",
        hintEn: "cd Documentos",
        done: (_s, cwd) => cwd.join("\\").toLowerCase().endsWith("documentos"),
      },
      {
        es: "Vuelve atrás con CD ..",
        en: "Go back with CD ..",
        hintEs: "cd ..",
        hintEn: "cd ..",
        done: (_s, cwd) => cwd.join("\\").toLowerCase() === HOME.join("\\").toLowerCase(),
      },
    ],
  },
  {
    id: "crear",
    titleEs: "Lección 2 · Crear y borrar",
    titleEn: "Lesson 2 · Create and delete",
    briefingEs: "MD crea carpetas, ECHO > guarda texto en un archivo, TYPE lo lee y DEL lo borra.",
    briefingEn: "MD creates folders, ECHO > saves text into a file, TYPE reads it and DEL deletes it.",
    steps: [
      {
        es: "Crea una carpeta llamada practica",
        en: "Create a folder called practica",
        hintEs: "md practica",
        hintEn: "md practica",
        done: (s) => dirExists(s, [...HOME, "practica"]),
      },
      {
        es: "Guarda un saludo en practica\\hola.txt con ECHO y >",
        en: "Save a greeting into practica\\hola.txt using ECHO and >",
        hintEs: 'echo Hola desde la terminal > practica\\hola.txt',
        hintEn: 'echo Hello from the terminal > practica\\hola.txt',
        done: (s) => fileExists(s, [...HOME, "practica", "hola.txt"]),
      },
      {
        es: "Lee el archivo con TYPE",
        en: "Read the file with TYPE",
        hintEs: "type practica\\hola.txt",
        hintEn: "type practica\\hola.txt",
        done: (s, _c, cmds) => cmds.some((c) => c === "type" || c === "cat" || c === "get-content") && fileExists(s, [...HOME, "practica", "hola.txt"]),
      },
      {
        es: "Borra el archivo con DEL",
        en: "Delete the file with DEL",
        hintEs: "del practica\\hola.txt",
        hintEn: "del practica\\hola.txt",
        done: (s) => !fileExists(s, [...HOME, "practica", "hola.txt"]),
      },
    ],
  },
  {
    id: "organizar",
    titleEs: "Lección 3 · Copiar y mover",
    titleEn: "Lesson 3 · Copy and move",
    briefingEs: "COPY duplica, MOVE traslada, REN renombra y TREE dibuja el árbol de carpetas.",
    briefingEn: "COPY duplicates, MOVE transfers, REN renames and TREE draws the folder tree.",
    steps: [
      {
        es: "Copia el archivo apuntes.txt de Documentos a Escritorio",
        en: "Copy apuntes.txt from Documentos to Escritorio",
        hintEs: "copy Documentos\\apuntes.txt Escritorio",
        hintEn: "copy Documentos\\apuntes.txt Escritorio",
        done: (s) => fileExists(s, [...HOME, "Escritorio", "apuntes.txt"]),
      },
      {
        es: "Mira el resultado con TREE",
        en: "Check the result with TREE",
        hintEs: "tree",
        hintEn: "tree",
        done: (s, _c, cmds) => cmds.some((c) => c === "tree") && fileExists(s, [...HOME, "Escritorio", "apuntes.txt"]),
      },
      {
        es: "Renombra la copia a mis-notas.txt con REN",
        en: "Rename the copy to mis-notas.txt with REN",
        hintEs: "ren Escritorio\\apuntes.txt mis-notas.txt",
        hintEn: "ren Escritorio\\apuntes.txt mis-notas.txt",
        done: (s) => fileExists(s, [...HOME, "Escritorio", "mis-notas.txt"]),
      },
      {
        es: "Borra la copia con DEL",
        en: "Delete the copy with DEL",
        hintEs: "del Escritorio\\mis-notas.txt",
        hintEn: "del Escritorio\\mis-notas.txt",
        done: (s) => !fileExists(s, [...HOME, "Escritorio", "mis-notas.txt"]),
      },
    ],
  },
  {
    id: "sistema",
    titleEs: "Lección 4 · Sistema y red",
    titleEn: "Lesson 4 · System and network",
    briefingEs: "WHOAMI te dice quién eres, IPCONFIG tu red, PING comprueba conexión y TASKLIST los procesos.",
    briefingEn: "WHOAMI tells you who you are, IPCONFIG your network, PING tests the connection and TASKLIST the processes.",
    steps: [
      {
        es: "Consulta el usuario actual con WHOAMI",
        en: "Check the current user with WHOAMI",
        hintEs: "whoami",
        hintEn: "whoami",
        done: (_s, _c, cmds) => cmds.includes("whoami"),
      },
      {
        es: "Mira la configuración de red con IPCONFIG",
        en: "Check the network config with IPCONFIG",
        hintEs: "ipconfig",
        hintEn: "ipconfig",
        done: (_s, _c, cmds) => cmds.includes("ipconfig"),
      },
      {
        es: "Comprueba la conexión con PING",
        en: "Test the connection with PING",
        hintEs: "ping miguelacm.es",
        hintEn: "ping miguelacm.es",
        done: (_s, _c, cmds) => cmds.includes("ping"),
      },
      {
        es: "Lista los procesos con TASKLIST",
        en: "List processes with TASKLIST",
        hintEs: "tasklist",
        hintEn: "tasklist",
        done: (_s, _c, cmds) => cmds.includes("tasklist"),
      },
    ],
  },
  {
    id: "powershell",
    titleEs: "Lección 5 · PowerShell",
    titleEn: "Lesson 5 · PowerShell",
    briefingEs: "PowerShell usa cmdlets con nombre largo: Get-ChildItem lista, Get-Content lee y Get-Location muestra dónde estás.",
    briefingEn: "PowerShell uses long cmdlet names: Get-ChildItem lists, Get-Content reads and Get-Location shows where you are.",
    steps: [
      {
        es: "Lista el contenido con Get-ChildItem",
        en: "List contents with Get-ChildItem",
        hintEs: "Get-ChildItem",
        hintEn: "Get-ChildItem",
        done: (_s, _c, cmds) => cmds.includes("get-childitem") || cmds.includes("gci"),
      },
      {
        es: "Lee el archivo tareas.txt con Get-Content",
        en: "Read tareas.txt with Get-Content",
        hintEs: "Get-Content Documentos\\tareas.txt",
        hintEn: "Get-Content Documentos\\tareas.txt",
        done: (_s, _c, cmds) => cmds.includes("get-content") || cmds.includes("gc"),
      },
      {
        es: "Muestra tu ubicación con Get-Location",
        en: "Show your location with Get-Location",
        hintEs: "Get-Location",
        hintEn: "Get-Location",
        done: (_s, _c, cmds) => cmds.includes("get-location") || cmds.includes("gl"),
      },
    ],
  },
];

const STORAGE_KEY = "macm-windows-terminal-v1";

const COMMAND_NAMES = [
  "help", "cls", "cd", "chdir", "dir", "ls", "md", "mkdir", "rd", "rmdir", "del", "erase",
  "type", "cat", "echo", "copy", "move", "ren", "rename", "tree", "whoami", "hostname",
  "ipconfig", "systeminfo", "tasklist", "ping", "date", "time", "ver", "start", "exit",
  "pwd", "get-childitem", "get-content", "get-location",
];

function bannerLines(isEs: boolean): string[] {
  return isEs
    ? [
        "Terminal de práctica CMD/PowerShell — Todo lo que haces aquí es simulado, nada toca tu PC real.",
        "Escribe help para ver los comandos, o elige una lección guiada para empezar.",
        "",
      ]
    : [
        "CMD/PowerShell practice terminal — everything here is simulated, nothing touches your PC.",
        "Type help to see the commands, or pick a guided lesson to start.",
        "",
      ];
}

export default function WindowsTerminal({ locale }: Props) {
  const isEs = locale === "es";

  const [fs, setFs] = useState<FsState>(createInitialFs);
  const [cwd, setCwd] = useState<string[]>([...HOME]);
  const [entries, setEntries] = useState<OutputEntry[]>(() =>
    bannerLines(locale === "es").map((t) => ({ kind: "out" as const, text: t }))
  );
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [doneLessons, setDoneLessons] = useState<string[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [ended, setEnded] = useState(false);
  const [cmdsRun, setCmdsRun] = useState<string[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const histRef = useRef<string[]>([]);

  histRef.current = cmdHistory;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { done?: string[]; history?: string[] };
        if (Array.isArray(parsed.done)) setDoneLessons(parsed.done);
        if (Array.isArray(parsed.history)) setCmdHistory(parsed.history);
      }
    } catch {}
  }, []);

  const persist = useCallback((nextDone: string[], nextHistory: string[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ done: nextDone, history: nextHistory })); } catch {}
  }, []);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [entries]);

  const pushOut = useCallback((lines: string[]) => {
    setEntries((prev) => [...prev, ...lines.map((t) => ({ kind: "out" as const, text: t }))]);
  }, []);

  const resetTerminal = useCallback(() => {
    setFs(createInitialFs());
    setCwd([...HOME]);
    setEntries(bannerLines(isEs).map((t) => ({ kind: "out" as const, text: t })));
    setEnded(false);
    setShowHint(false);
  }, [isEs]);

  const checkLessonProgress = useCallback((lesson: Lesson, st: FsState, cw: string[], cmds: string[]) => {
    let allDone = true;
    for (const step of lesson.steps) {
      if (!step.done(st, cw, cmds)) allDone = false;
    }
    if (allDone) {
      setDoneLessons((prev) => {
        if (prev.includes(lesson.id)) return prev;
        const next = [...prev, lesson.id];
        persist(next, histRef.current);
        return next;
      });
      setEntries((prev) => [...prev,
        { kind: "ok", text: isEs ? `✔ Lección completada: ${lesson.titleEs}` : `✔ Lesson completed: ${lesson.titleEn}` },
      ]);
      setActiveLesson(null);
      setShowHint(false);
    }
  }, [isEs, persist]);

  const handleSubmit = useCallback(() => {
    const line = input;
    setInput("");
    if (!line.trim()) {
      setEntries((prev) => [...prev, { kind: "cmd", text: `${promptString(cwd)} ` }]);
      return;
    }
    setEntries((prev) => [...prev, { kind: "cmd", text: `${promptString(cwd)} ${line}` }]);
    const nextHistory = [line, ...cmdHistory.filter((h) => h !== line)].slice(0, 60);
    setCmdHistory(nextHistory);
    setHistIdx(-1);
    persist(doneLessons, nextHistory);

    const result = executeLine(fs, cwd, line, { isEs });
    if (result.clear) {
      setEntries([]);
      setFs(result.state);
      setCwd(result.cwd);
      if (result.exit) setEnded(true);
      return;
    }
    setEntries((prev) => [...prev, ...result.lines.map((t) => ({ kind: "out" as const, text: t }))]);
    setFs(result.state);
    setCwd(result.cwd);
    if (result.exit) {
      setEnded(true);
      return;
    }

    const lowerCmd = line.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const nextCmds = [...cmdsRun, lowerCmd];
    setCmdsRun(nextCmds);
    if (activeLesson) {
      checkLessonProgress(activeLesson, result.state, result.cwd, nextCmds);
    }
  }, [input, cwd, fs, cmdHistory, doneLessons, persist, isEs, activeLesson, cmdsRun, checkLessonProgress]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (ended) return;
      handleSubmit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histRef.current.length === 0) return;
      const next = Math.min(histIdx + 1, histRef.current.length - 1);
      setHistIdx(next);
      setInput(histRef.current[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx <= 0) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(histIdx - 1);
        setInput(histRef.current[histIdx - 1]);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const parts = input.split(/\s+/);
      if (parts.length === 0) return;
      const last = parts[parts.length - 1];
      if (last.length === 0) return;
      const lower = last.toLowerCase();
      let candidates: string[];
      if (parts.length === 1) {
        candidates = COMMAND_NAMES.filter((c) => c.startsWith(lower));
      } else {
        const node = fs.root;
        const pathSegs = last.split(/[\\/]+/).filter((p) => p.length > 0);
        const searchName = (pathSegs.pop() ?? "").toLowerCase();
        const targetDir = pathSegs.length > 0 ? pathSegs : cwd;
        const dirNode = targetDir.length === 0
          ? node
          : resolveDir(fs, targetDir);
        candidates = Object.values(dirNode?.children ?? {})
          .filter((c) => c.name.toLowerCase().startsWith(searchName))
          .map((c) => (c.kind === "dir" ? `${c.name}\\` : c.name));
      }
      if (candidates.length === 1) {
        parts[parts.length - 1] = candidates[0];
        setInput(parts.join(" "));
      } else if (candidates.length > 1) {
        setEntries((prev) => [...prev, { kind: "out", text: candidates.join("  ") }]);
      }
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setEntries((prev) => [...prev, { kind: "cmd", text: `${promptString(cwd)} ${input}` }, { kind: "warn", text: "^C" }]);
      setInput("");
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    }
  }, [input, histIdx, cwd, fs, handleSubmit, ended]);

  const resolveDir = (fsState: FsState, segs: string[]) => {
    let node = fsState.root;
    for (const seg of segs) {
      const key = Object.keys(node.children ?? {}).find((k) => k.toLowerCase() === seg.toLowerCase());
      const child = key ? node.children?.[key] : undefined;
      if (!child) return null;
      node = child;
      if (node.kind !== "dir") return null;
    }
    return node;
  };

  const startLesson = useCallback((lesson: Lesson) => {
    setActiveLesson(lesson);
    setShowHint(false);
    const intro = [
      "",
      isEs ? `— ${lesson.titleEs} —` : `— ${lesson.titleEn} —`,
      isEs ? lesson.briefingEs : lesson.briefingEn,
      isEs ? `Paso 1 de ${lesson.steps.length}: ${lesson.steps[0].es}` : `Step 1 of ${lesson.steps.length}: ${lesson.steps[0].en}`,
      "",
    ];
    setEntries((prev) => [...prev, ...intro.map((t) => ({ kind: "out" as const, text: t }))]);
    inputRef.current?.focus();
  }, [isEs]);

  const activeStepIdx = useMemo(() => {
    if (!activeLesson) return 0;
    let idx = 0;
    for (let i = 0; i < activeLesson.steps.length; i++) {
      if (activeLesson.steps[i].done(fs, cwd, cmdsRun)) idx = i + 1;
    }
    return idx;
  }, [activeLesson, fs, cwd, cmdsRun]);

  const nextStep = activeLesson?.steps[Math.min(activeStepIdx, activeLesson.steps.length - 1)] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/20 bg-surface/30 p-3">
        <span className="text-xs font-bold text-text">{isEs ? "Modo" : "Mode"}:</span>
        <button
          onClick={() => { setActiveLesson(null); setShowHint(false); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            !activeLesson ? "bg-primary text-background" : "bg-surface/60 text-text-muted hover:text-text"
          }`}
        >
          {isEs ? "Terminal libre" : "Free terminal"}
        </button>
        {LESSONS.map((l) => (
          <button
            key={l.id}
            onClick={() => startLesson(l)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeLesson?.id === l.id ? "bg-primary text-background" : doneLessons.includes(l.id) ? "bg-green-500/15 text-green-400" : "bg-surface/60 text-text-muted hover:text-text"
            }`}
          >
            {doneLessons.includes(l.id) ? "✔ " : ""}{isEs ? l.titleEs.split(" · ")[1] : l.titleEn.split(" · ")[1]}
          </button>
        ))}
        <button
          onClick={resetTerminal}
          className="ml-auto rounded-lg border border-border/30 bg-surface/60 px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text"
        >
          {isEs ? "Reiniciar terminal" : "Reset terminal"}
        </button>
      </div>

      {activeLesson && nextStep && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-primary">
              {isEs ? `Paso ${activeStepIdx + 1} de ${activeLesson.steps.length}` : `Step ${activeStepIdx + 1} of ${activeLesson.steps.length}`}
            </p>
            <button
              onClick={() => setShowHint(true)}
              className="rounded-lg border border-border/30 bg-surface/60 px-3 py-1 text-xs text-text-muted transition-colors hover:text-text"
            >
              {isEs ? "Ver pista" : "Show hint"}
            </button>
          </div>
          <p className="mt-1 text-sm text-text">{isEs ? nextStep.es : nextStep.en}</p>
          {showHint && (
            <p className="mt-2 font-mono text-xs text-green-400">$ {isEs ? nextStep.hintEs : nextStep.hintEn}</p>
          )}
        </div>
      )}

      <div
        className="overflow-hidden rounded-2xl border border-white/15 bg-black"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2">
          <span className="h-3 w-3 rounded-full bg-red-500/80" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <span className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-2 font-mono text-xs text-white/50">cmd.exe — {pathToString(cwd)}</span>
        </div>
        <div
          ref={outputRef}
          className="h-[420px] overflow-y-auto px-4 py-3 font-mono text-sm leading-relaxed text-white/90"
        >
          {entries.map((entry, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${
                entry.kind === "cmd" ? "text-white" : entry.kind === "ok" ? "text-green-400" : entry.kind === "warn" ? "text-amber-400" : "text-white/70"
              }`}
            >
              {entry.text}
            </div>
          ))}
          <div className="flex items-center gap-0">
            <span className="shrink-0 whitespace-pre text-green-400">{ended ? "" : `${promptString(cwd)}`}</span>
            {ended ? (
              <span className="text-white/70">{isEs ? "Sesión cerrada. Pulsa «Reiniciar terminal» para volver a empezar." : "Session closed. Press «Reset terminal» to start again."}</span>
            ) : (
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
                aria-label={isEs ? "Comandos de la terminal" : "Terminal commands"}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted/70">
        <span>
          {isEs
            ? "↑/↓ historial · Tab completa nombres · Ctrl+L limpia · Ctrl+C cancela la línea"
            : "↑/↓ history · Tab completes names · Ctrl+L clears · Ctrl+C cancels the line"}
        </span>
        {doneLessons.length > 0 && (
          <span className="font-semibold text-green-400">
            {doneLessons.length}/{LESSONS.length} {isEs ? "lecciones completadas" : "lessons completed"}
          </span>
        )}
      </div>

      <details className="rounded-2xl border border-border/20 bg-surface/30 p-4 text-sm text-text-muted">
        <summary className="cursor-pointer font-semibold text-text">{isEs ? "Qué es esta terminal y hasta dónde llega" : "What this terminal is and where it ends"}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>
            {isEs
              ? "Es un simulador con fines educativos: hay un sistema de archivos virtual en memoria. Nada de lo que escribas toca tu ordenador, tu red real ni ningún dato."
              : "It is a teaching simulator: there is an in-memory virtual filesystem. Nothing you type touches your computer, your network or any real data."}
          </li>
          <li>
            {isEs
              ? "Los comandos de red (ipconfig, ping) muestran valores de ejemplo para aprender a leerlos, no los de tu conexión real."
              : "Network commands (ipconfig, ping) show sample values so you learn to read them, not your real connection."}
          </li>
          <li>
            {isEs
              ? "Progreso de lecciones e historial de comandos se guardan solo en tu navegador (localStorage)."
              : "Lesson progress and command history are stored only in your browser (localStorage)."}
          </li>
          <li>
            {isEs
              ? "Ojo con la diferencia clave del mundo real: aquí no hay antivirus, usuarios con permisos ni discos duros reales. Cuando practiques en un PC de verdad, DEL y RD borran de verdad."
              : "Mind the real-world difference: no permissions, antivirus or real disks here. On a real PC, DEL and RD delete for real."}
          </li>
        </ul>
      </details>
    </div>
  );
}
