"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MdFullscreen, MdFullscreenExit, MdClose } from "react-icons/md";
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

type Mode = "cmd" | "ps";

interface OutputEntry {
  kind: "cmd" | "out" | "ok" | "warn" | "err";
  text: string;
}

interface Session {
  id: number;
  mode: Mode;
  cwd: string[];
  entries: OutputEntry[];
  input: string;
  histIdx: number;
  env: Record<string, string>;
  ended: boolean;
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
  {
    id: "multiterminal",
    titleEs: "Lección 6 · Varias terminales",
    titleEn: "Lesson 6 · Multiple terminals",
    briefingEs: "Las pestañas comparten el mismo disco C:. START CMD abre otra terminal, MSG manda un mensaje entre ellas y FINDSTR busca dentro de los archivos.",
    briefingEn: "Tabs share the same C: drive. START CMD opens another terminal, MSG sends a message between them and FINDSTR searches inside files.",
    steps: [
      {
        es: "Abre una segunda terminal con START CMD",
        en: "Open a second terminal with START CMD",
        hintEs: "start cmd",
        hintEn: "start cmd",
        done: (_s, _c, cmds) => cmds.includes("start"),
      },
      {
        es: "Deja una nota para la otra terminal: ECHO Mensaje para ti > mensaje.txt",
        en: "Leave a note for the other terminal: ECHO Message for you > mensaje.txt",
        hintEs: "echo Mensaje para ti > mensaje.txt",
        hintEn: "echo Message for you > mensaje.txt",
        done: (s) => fileExists(s, [...HOME, "mensaje.txt"]),
      },
      {
        es: "Manda un saludo a la otra terminal con MSG (ejemplo: msg 2 Hola)",
        en: "Send a greeting to the other terminal with MSG (example: msg 2 Hello)",
        hintEs: "msg 2 Hola",
        hintEn: "msg 2 Hello",
        done: (_s, _c, cmds) => cmds.includes("msg"),
      },
      {
        es: "Crea una carpeta con variables: SET proyecto=web y luego ECHO %proyecto%",
        en: "Use variables: SET proyecto=web and then ECHO %proyecto%",
        hintEs: "set proyecto=web",
        hintEn: "set proyecto=web",
        done: (_s, _c, cmds) => cmds.includes("set"),
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
  "findstr", "more", "set", "doskey", "robocopy", "msg", "taskkill", "nslookup", "netstat", "tracert",
];

function bannerLines(isEs: boolean): string[] {
  return isEs
    ? [
        "Terminal de práctica CMD / PowerShell — todo es simulado, nada toca tu PC real.",
        "Escribe help para ver los comandos, o elige una lección guiada para empezar.",
        "Abre más terminales con start cmd: comparten el disco C: y se comunican con msg.",
        "",
      ]
    : [
        "CMD / PowerShell practice terminal — everything is simulated, nothing touches your PC.",
        "Type help to see the commands, or pick a guided lesson to start.",
        "Open more terminals with start cmd: tabs share the drive and talk with msg.",
        "",
      ];
}

function newBanner(isEs: boolean): string[] {
  return isEs
    ? [
        "",
        `Nueva terminal abierta. Todas las pestañas comparten el mismo disco C:.`,
        "",
      ]
    : [
        "",
        `New terminal opened. All tabs share the same C: drive.`,
        "",
      ];
}

export default function WindowsTerminal({ locale }: Props) {
  const isEs = locale === "es";

  const [fs, setFs] = useState<FsState>(createInitialFs);
  const [sessions, setSessions] = useState<Session[]>(() => [
    { id: 1, mode: "cmd", cwd: [...HOME], entries: bannerLines(locale === "es").map((t) => ({ kind: "out" as const, text: t })), input: "", histIdx: -1, env: {}, ended: false },
  ]);
  const [activeId, setActiveId] = useState(1);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [doneLessons, setDoneLessons] = useState<string[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [cmdsRun, setCmdsRun] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState<"base" | "lg" | "xl">("base");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const nextIdRef = useRef(2);
  const windowRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const histRef = useRef<string[]>([]);
  histRef.current = cmdHistory;

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const activeIdx = sessions.findIndex((s) => s.id === active.id);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { done?: string[]; history?: string[] };
        if (Array.isArray(parsed.done)) setDoneLessons(parsed.done);
        if (Array.isArray(parsed.history)) setCmdHistory(parsed.history);
      }
      const rawFs = localStorage.getItem(`${STORAGE_KEY}-fs`);
      if (rawFs === "base" || rawFs === "lg" || rawFs === "xl") setFontSize(rawFs);
    } catch {}
  }, []);

  const persist = useCallback((nextDone: string[], nextHistory: string[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ done: nextDone, history: nextHistory })); } catch {}
  }, []);

  const changeFontSize = useCallback((next: "base" | "lg" | "xl") => {
    setFontSize(next);
    try { localStorage.setItem(`${STORAGE_KEY}-fs`, next); } catch {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!windowRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void windowRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const fontCls = fontSize === "base"
    ? "text-xs sm:text-sm"
    : fontSize === "lg"
      ? "text-sm sm:text-base"
      : "text-base sm:text-lg";

  const patchSession = useCallback((id: number, patch: Partial<Session> | ((s: Session) => Partial<Session>)) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)));
  }, []);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [active?.entries]);

  const appendEntries = useCallback((id: number, entries: OutputEntry[]) => {
    patchSession(id, (s) => ({ entries: [...s.entries, ...entries] }));
  }, [patchSession]);

  const createSession = useCallback((mode: Mode, banner: boolean) => {
    const id = nextIdRef.current++;
    const session: Session = {
      id,
      mode,
      cwd: [...HOME],
      entries: banner
        ? bannerLines(isEs).map((t) => ({ kind: "out" as const, text: t }))
        : newBanner(isEs).map((t) => ({ kind: "out" as const, text: t })),
      input: "",
      histIdx: -1,
      env: {},
      ended: false,
    };
    setSessions((prev) => [...prev, session]);
    setActiveId(id);
    setUnread((prev) => ({ ...prev, [id]: 0 }));
    return id;
  }, [isEs]);

  const closeSession = useCallback((id: number) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fresh: Session = { id: nextIdRef.current++, mode: "cmd", cwd: [...HOME], entries: bannerLines(isEs).map((t) => ({ kind: "out" as const, text: t })), input: "", histIdx: -1, env: {}, ended: false };
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
    setUnread((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [activeId]);

  const resetTerminal = useCallback(() => {
    setFs(createInitialFs());
    setSessions([{ id: nextIdRef.current++, mode: "cmd", cwd: [...HOME], entries: bannerLines(isEs).map((t) => ({ kind: "out" as const, text: t })), input: "", histIdx: -1, env: {}, ended: false }]);
    setActiveId(-1);
    setActiveLesson(null);
    setShowHint(false);
    setUnread({});
  }, [isEs]);

  useEffect(() => {
    if (activeId === -1 && sessions.length > 0) setActiveId(sessions[0].id);
  }, [activeId, sessions]);

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
      appendEntries(activeId, [{ kind: "ok", text: isEs ? `✔ Lección completada: ${lesson.titleEs}` : `✔ Lesson completed: ${lesson.titleEn}` }]);
      setActiveLesson(null);
      setShowHint(false);
    }
  }, [isEs, persist, appendEntries, activeId]);

  const handleSubmit = useCallback(() => {
    const line = active.input;
    const mode = active.mode;
    const cwd = active.cwd;
    const env = active.env;
    patchSession(active.id, { input: "", histIdx: -1 });
    if (!line.trim()) {
      appendEntries(active.id, [{ kind: "cmd", text: `${promptString(cwd, mode)} ` }]);
      return;
    }
    appendEntries(active.id, [{ kind: "cmd", text: `${promptString(cwd, mode)} ${line}` }]);
    const nextHistory = [line, ...cmdHistory.filter((h) => h !== line)].slice(0, 60);
    setCmdHistory(nextHistory);
    persist(doneLessons, nextHistory);

    const result = executeLine(fs, cwd, line, { isEs, mode, env, history: cmdHistory });

    if (result.clear) {
      patchSession(active.id, { cwd: result.cwd, env: result.env ?? env, entries: [] });
      setFs(result.state);
      if (result.exit) patchSession(active.id, { ended: true });
      return;
    }
    appendEntries(active.id, result.lines.map((t) => ({ kind: (result.error ? "err" : "out") as OutputEntry["kind"], text: t })));
    patchSession(active.id, { cwd: result.cwd, env: result.env ?? env });
    setFs(result.state);
    if (result.exit) {
      patchSession(active.id, { ended: true });
      return;
    }

    if (result.openTab) {
      const id = createSession(result.openTab.mode, false);
      setUnread((prev) => ({ ...prev, [id]: 0 }));
    }

    if (result.sendTo) {
      const targetSession = sessions[result.sendTo.target - 1];
      if (targetSession) {
        appendEntries(targetSession.id, [
          { kind: "ok", text: isEs
            ? `--- Mensaje de la terminal ${activeIdx + 1} ---`
            : `--- Message from terminal ${activeIdx + 1} ---` },
          { kind: "out", text: result.sendTo.message },
        ]);
        if (targetSession.id !== activeId) {
          setUnread((prev) => ({ ...prev, [targetSession.id]: (prev[targetSession.id] ?? 0) + 1 }));
        }
      } else {
        appendEntries(active.id, [{ kind: "err", text: isEs
          ? `MSG: no existe la terminal ${result.sendTo.target}. Hay ${sessions.length} abiertas.`
          : `MSG: terminal ${result.sendTo.target} does not exist. There are ${sessions.length} open.` }]);
      }
    }

    const lowerCmd = line.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const nextCmds = [...cmdsRun, lowerCmd];
    setCmdsRun(nextCmds);
    if (activeLesson) {
      checkLessonProgress(activeLesson, result.state, result.cwd, nextCmds);
    }
  }, [active, activeIdx, activeId, fs, cmdHistory, doneLessons, persist, isEs, activeLesson, cmdsRun, checkLessonProgress, patchSession, appendEntries, createSession, sessions]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (active.ended) return;
      handleSubmit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histRef.current.length === 0) return;
      const next = Math.min(active.histIdx + 1, histRef.current.length - 1);
      patchSession(active.id, { histIdx: next, input: histRef.current[next] });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (active.histIdx <= 0) {
        patchSession(active.id, { histIdx: -1, input: "" });
      } else {
        patchSession(active.id, { histIdx: active.histIdx - 1, input: histRef.current[active.histIdx - 1] });
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const input = active.input;
      const parts = input.split(/\s+/);
      if (parts.length === 0) return;
      const last = parts[parts.length - 1];
      if (last.length === 0) return;
      const lower = last.toLowerCase();
      let candidates: string[];
      if (parts.length === 1) {
        candidates = COMMAND_NAMES.filter((c) => c.startsWith(lower));
      } else {
        const pathSegs = last.split(/[\\/]+/).filter((p) => p.length > 0);
        const searchName = (pathSegs.pop() ?? "").toLowerCase();
        const targetDir = pathSegs.length > 0 ? pathSegs : active.cwd;
        const dirNode = targetDir.length === 0 ? fs.root : resolveDir(fs, targetDir);
        candidates = Object.values(dirNode?.children ?? {})
          .filter((c) => c.name.toLowerCase().startsWith(searchName))
          .map((c) => (c.kind === "dir" ? `${c.name}\\` : c.name));
      }
      if (candidates.length === 1) {
        parts[parts.length - 1] = candidates[0];
        patchSession(active.id, { input: parts.join(" ") });
      } else if (candidates.length > 1) {
        appendEntries(active.id, [{ kind: "out", text: candidates.join("  ") }]);
      }
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      appendEntries(active.id, [
        { kind: "cmd", text: `${promptString(active.cwd, active.mode)} ${active.input}` },
        { kind: "warn", text: "^C" },
      ]);
      patchSession(active.id, { input: "" });
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      patchSession(active.id, { entries: [] });
    }
  }, [active, fs, handleSubmit, patchSession, appendEntries]);

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
    patchSession(activeId, { mode: lesson.id === "powershell" ? "ps" : active.mode });
    const intro = [
      "",
      isEs ? `— ${lesson.titleEs} —` : `— ${lesson.titleEn} —`,
      isEs ? lesson.briefingEs : lesson.briefingEn,
      isEs ? `Paso 1 de ${lesson.steps.length}: ${lesson.steps[0].es}` : `Step 1 of ${lesson.steps.length}: ${lesson.steps[0].en}`,
      "",
    ];
    appendEntries(activeId, intro.map((t) => ({ kind: "out" as const, text: t })));
    inputRef.current?.focus();
  }, [isEs, activeId, active.mode, patchSession, appendEntries]);

  const activeStepIdx = useMemo(() => {
    if (!activeLesson) return 0;
    let idx = 0;
    for (let i = 0; i < activeLesson.steps.length; i++) {
      if (activeLesson.steps[i].done(fs, active.cwd, cmdsRun)) idx = i + 1;
    }
    return idx;
  }, [activeLesson, fs, active.cwd, cmdsRun]);

  const nextStep = activeLesson?.steps[Math.min(activeStepIdx, activeLesson.steps.length - 1)] ?? null;

  const tabLabel = (s: Session) => {
    const leaf = s.cwd.length > 0 ? s.cwd[s.cwd.length - 1] : "C:";
    return `${s.mode === "ps" ? "PS" : "cmd"} · ${leaf}`;
  };

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
        ref={windowRef}
        className={`overflow-hidden border border-white/15 bg-black ${
          isFullscreen ? "flex h-screen flex-col rounded-none" : "rounded-2xl"
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-black px-2 pt-2">
          {sessions.map((s, i) => (
            <div
              key={s.id}
              className={`flex shrink-0 items-center gap-1 rounded-t-md border-t border-r border-l px-2.5 py-1 font-mono text-[11px] transition-colors ${
                s.id === activeId
                  ? "border-white/15 bg-white/10 text-white"
                  : "border-transparent text-white/40 hover:text-white/80"
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setActiveId(s.id); setUnread((prev) => ({ ...prev, [s.id]: 0 })); }}
                className="flex items-center gap-1.5"
              >
                <span className="text-white/30">{i + 1}</span>
                {tabLabel(s)}
                {(unread[s.id] ?? 0) > 0 && s.id !== activeId && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">
                    {unread[s.id]}
                  </span>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                className="rounded p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                title={isEs ? "Cerrar esta terminal" : "Close this terminal"}
              >
                <MdClose className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); createSession("cmd", false); }}
            className="shrink-0 rounded-t-md px-2 py-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title={isEs ? "Nueva terminal (comparte el disco C:)" : "New terminal (shares the C: drive)"}
            aria-label={isEs ? "Nueva terminal" : "New terminal"}
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-2 sm:px-4">
          {!isFullscreen && (
            <>
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
              <span className="ml-2 hidden font-mono text-xs text-white/50 sm:inline">{active.mode === "ps" ? "powershell.exe" : "cmd.exe"} — {pathToString(active.cwd)}</span>
            </>
          )}
          {isFullscreen && <span className="font-mono text-xs text-white/50">{active.mode === "ps" ? "powershell.exe" : "cmd.exe"} — {pathToString(active.cwd)}</span>}
          <div className="ml-auto flex items-center gap-1">
            <div className="mr-1 hidden items-center gap-1 rounded-md border border-white/10 p-0.5 sm:flex">
              {(["base", "lg", "xl"] as const).map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); changeFontSize(s); }}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                    fontSize === s ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
                  }`}
                  title={isEs ? "Tamaño de letra (para proyectar)" : "Font size (for projecting)"}
                >
                  {s === "base" ? "A" : s === "lg" ? "A+" : "A++"}
                </button>
              ))}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title={isEs ? "Pantalla completa para proyectar" : "Fullscreen for projecting"}
            >
              {isFullscreen ? <MdFullscreenExit /> : <MdFullscreen />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); patchSession(active.id, { mode: "cmd" }); }}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                active.mode === "cmd" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
              }`}
            >
              CMD
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); patchSession(active.id, { mode: "ps" }); }}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                active.mode === "ps" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
              }`}
            >
              PowerShell
            </button>
          </div>
        </div>
        <div
          ref={outputRef}
          key={active.id}
          className={`overflow-y-auto px-3 py-3 font-mono leading-relaxed text-white/90 sm:px-4 ${
            isFullscreen ? "min-h-0 flex-1" : "h-[380px] sm:h-[460px]"
          } ${fontCls}`}
        >
          {active.entries.map((entry, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${
                entry.kind === "cmd"
                  ? "font-semibold text-white"
                  : entry.kind === "ok"
                    ? "text-green-400"
                    : entry.kind === "err"
                      ? "text-red-400"
                      : entry.kind === "warn"
                        ? "text-amber-400"
                        : entry.text.trimStart().startsWith("<DIR>")
                          ? "text-sky-300"
                          : "text-white/70"
              }`}
            >
              {entry.text}
            </div>
          ))}
          <div className="flex items-center gap-0">
            <span className={`shrink-0 whitespace-pre ${active.mode === "ps" ? "text-yellow-300" : "text-green-400"}`}>{active.ended ? "" : `${promptString(active.cwd, active.mode)}`}</span>
            {active.ended ? (
              <span className="text-white/70">{isEs ? "Sesión cerrada. Cierra la pestaña o pulsa «Reiniciar terminal» para volver a empezar." : "Session closed. Close the tab or press «Reset terminal» to start again."}</span>
            ) : (
              <input
                ref={inputRef}
                value={active.input}
                onChange={(e) => patchSession(active.id, { input: e.target.value })}
                onKeyDown={handleKey}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent font-mono text-white outline-none [caret-color:#4ade80]"
                aria-label={isEs ? "Comandos de la terminal" : "Terminal commands"}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted/70">
        <span>
          {isEs
            ? "↑/↓ historial · Tab completa nombres · Ctrl+L limpia · start cmd abre otra pestaña que comparte el disco · msg 2 texto manda mensajes entre pestañas"
            : "↑/↓ history · Tab completes · Ctrl+L clears · start cmd opens a tab that shares the drive · msg 2 text sends messages between tabs"}
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
              ? "Las pestañas comparten el mismo disco C: virtual (como las ventanas de un Windows real). MSG entrega mensajes solo entre pestañas abiertas aquí."
              : "Tabs share the same virtual C: drive (like real windows on a machine). MSG delivers messages only between tabs open here."}
          </li>
          <li>
            {isEs
              ? "Los comandos de red (ipconfig, ping, nslookup, netstat, tracert) muestran valores de ejemplo para aprender a leerlos, no los de tu conexión real."
              : "Network commands (ipconfig, ping, nslookup, netstat, tracert) show sample values so you learn to read them, not your real connection."}
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
