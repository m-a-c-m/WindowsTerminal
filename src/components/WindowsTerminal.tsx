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
import {
  handleKey as rlHandleKey,
  acceptSearch,
  commonPrefix,
  type ReadlineState,
  type ReverseSearch,
  type KeyEvent,
} from "@/lib/readline";

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
  cursor: number;
  histIdx: number;
  saved: string;
  search: ReverseSearch | null;
  killRing: string;
  awaiting: { variable: string; prompt: string } | null;
  title: string | null;
  env: Record<string, string>;
  ended: boolean;
}

const MAX_BUFFER_LINES = 2000;

function trimBuffer(entries: OutputEntry[]): OutputEntry[] {
  let total = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    total += entries[i].text.split("\n").length + 1;
    if (total > MAX_BUFFER_LINES) return entries.slice(i + 1);
  }
  return entries;
}

type TerminalTheme = "ubuntu" | "verde" | "contraste";

interface ThemeSpec {
  labelEs: string;
  labelEn: string;
  prompt: string;
  out: string;
  ok: string;
  err: string;
  warn: string;
  listing: string;
  caret: string;
}

const THEMES: Record<TerminalTheme, ThemeSpec> = {
  ubuntu: {
    labelEs: "Ubuntu",
    labelEn: "Ubuntu",
    prompt: "text-green-400",
    out: "text-white/70",
    ok: "text-green-400",
    err: "text-red-400",
    warn: "text-amber-400",
    listing: "text-sky-300",
    caret: "#4ade80",
  },
  verde: {
    labelEs: "Verde",
    labelEn: "Green",
    prompt: "text-green-400",
    out: "text-green-200/80",
    ok: "text-green-400",
    err: "text-red-400",
    warn: "text-yellow-400",
    listing: "text-green-300",
    caret: "#34d399",
  },
  contraste: {
    labelEs: "Alto contraste",
    labelEn: "High contrast",
    prompt: "text-yellow-300",
    out: "text-white",
    ok: "text-lime-300",
    err: "text-red-300",
    warn: "text-amber-300",
    listing: "text-cyan-200",
    caret: "#fde047",
  },
};

interface SavedEnv {
  savedAt: string;
  fs: FsState;
  sessions: Session[];
  activeId: number;
  doneLessons: string[];
  cmdHistory: string[];
}

function loadSavedEnvs(key: string): Record<string, SavedEnv> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SavedEnv>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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
    { id: 1, mode: "cmd", cwd: [...HOME], entries: bannerLines(locale === "es").map((t) => ({ kind: "out" as const, text: t })), input: "", cursor: 0, histIdx: -1, saved: "", search: null, killRing: "", awaiting: null, title: null, env: {}, ended: false },
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
  const [layout, setLayout] = useState<"single" | "split">("single");
  const [theme, setTheme] = useState<TerminalTheme>("ubuntu");
  const [splitPct, setSplitPct] = useState(50);
  const [isMd, setIsMd] = useState(false);
  const [f7, setF7] = useState<{ open: boolean; idx: number }>({ open: false, idx: 0 });
  const [showEnvs, setShowEnvs] = useState(false);
  const [envName, setEnvName] = useState("");
  const [envMsg, setEnvMsg] = useState("");
  const [savedEnvs, setSavedEnvs] = useState<Record<string, SavedEnv>>({});

  const nextIdRef = useRef(2);
  const windowRef = useRef<HTMLDivElement>(null);
  const splitWrapRef = useRef<HTMLDivElement>(null);
  const outputRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const lastTabRef = useRef<Record<number, string>>({});
  const f8IdxRef = useRef(0);
  const histRef = useRef<string[]>([]);
  histRef.current = cmdHistory;

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];

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
      const rawLayout = localStorage.getItem(`${STORAGE_KEY}-layout`);
      if (rawLayout === "split") setLayout("split");
      const rawTheme = localStorage.getItem(`${STORAGE_KEY}-theme`);
      if (rawTheme === "ubuntu" || rawTheme === "verde" || rawTheme === "contraste") setTheme(rawTheme);
      const rawSplit = Number(localStorage.getItem(`${STORAGE_KEY}-split`));
      if (Number.isFinite(rawSplit) && rawSplit >= 22 && rawSplit <= 78) setSplitPct(rawSplit);
      setSavedEnvs(loadSavedEnvs(`${STORAGE_KEY}-envs`));
    } catch {}
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsMd(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const persist = useCallback((nextDone: string[], nextHistory: string[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ done: nextDone, history: nextHistory })); } catch {}
  }, []);

  const changeFontSize = useCallback((next: "base" | "lg" | "xl") => {
    setFontSize(next);
    try { localStorage.setItem(`${STORAGE_KEY}-fs`, next); } catch {}
  }, []);

  const changeLayout = useCallback((next: "single" | "split") => {
    setLayout(next);
    try { localStorage.setItem(`${STORAGE_KEY}-layout`, next); } catch {}
  }, []);

  const changeTheme = useCallback((next: TerminalTheme) => {
    setTheme(next);
    try { localStorage.setItem(`${STORAGE_KEY}-theme`, next); } catch {}
  }, []);

  const changeSplitPct = useCallback((pct: number) => {
    setSplitPct(pct);
    try { localStorage.setItem(`${STORAGE_KEY}-split`, String(pct)); } catch {}
  }, []);

  const startDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = splitWrapRef.current;
    if (!container) return;
    const onMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      changeSplitPct(Math.round(Math.min(78, Math.max(22, pct))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [changeSplitPct]);

  const persistEnvs = useCallback((next: Record<string, SavedEnv>) => {
    setSavedEnvs(next);
    try { localStorage.setItem(`${STORAGE_KEY}-envs`, JSON.stringify(next)); } catch {}
  }, []);

  const applyEnv = useCallback((env: SavedEnv) => {
    setFs(env.fs);
    const restored = env.sessions.map((s) => ({ ...s, input: "", cursor: 0, histIdx: -1, saved: "", search: null, killRing: "", awaiting: null }));
    setSessions(restored);
    setActiveId(restored.some((s) => s.id === env.activeId) ? env.activeId : restored[0].id);
    nextIdRef.current = Math.max(...restored.map((s) => s.id)) + 1;
    setDoneLessons(env.doneLessons ?? []);
    setCmdHistory(env.cmdHistory ?? []);
    setUnread({});
    setActiveLesson(null);
    setShowHint(false);
  }, []);

  const snapshotEnv = useCallback((): SavedEnv => ({
    savedAt: new Date().toISOString(),
    fs,
    sessions,
    activeId,
    doneLessons,
    cmdHistory,
  }), [fs, sessions, activeId, doneLessons, cmdHistory]);

  const saveEnv = useCallback(() => {
    const name = envName.trim();
    if (!name) return;
    persistEnvs({ ...savedEnvs, [name]: snapshotEnv() });
    setEnvName("");
    setEnvMsg(isEs ? `Entorno «${name}» guardado.` : `Environment «${name}» saved.`);
  }, [envName, savedEnvs, snapshotEnv, persistEnvs, isEs]);

  const deleteEnv = useCallback((name: string) => {
    const next = { ...savedEnvs };
    delete next[name];
    persistEnvs(next);
  }, [savedEnvs, persistEnvs]);

  const exportEnv = useCallback(() => {
    const name = envName.trim() || "entorno-windows";
    const blob = new Blob([JSON.stringify(snapshotEnv(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [envName, snapshotEnv]);

  const importEnv = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SavedEnv;
        if (!parsed || !parsed.fs || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
          setEnvMsg(isEs ? "El archivo no es un entorno válido." : "The file is not a valid environment.");
          return;
        }
        applyEnv(parsed);
        setEnvMsg(isEs ? "Entorno importado." : "Environment imported.");
      } catch {
        setEnvMsg(isEs ? "El archivo no es un entorno válido." : "The file is not a valid environment.");
      }
    };
    reader.readAsText(file);
  }, [applyEnv, isEs]);

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
    for (const el of Object.values(outputRefs.current)) {
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [sessions]);

  useEffect(() => {
    inputRefs.current[activeId]?.focus();
  }, [activeId]);

  useEffect(() => {
    const el = inputRefs.current[active.id];
    if (!el || document.activeElement !== el) return;
    if (el.selectionStart !== active.cursor || el.selectionEnd !== active.cursor) {
      el.setSelectionRange(active.cursor, active.cursor);
    }
  }, [active.input, active.cursor, active.id]);

  const appendEntries = useCallback((id: number, entries: OutputEntry[]) => {
    patchSession(id, (s) => ({ entries: trimBuffer([...s.entries, ...entries]) }));
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
      cursor: 0,
      histIdx: -1,
      saved: "",
      search: null,
      killRing: "",
      awaiting: null,
      title: null,
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
        const fresh: Session = { id: nextIdRef.current++, mode: "cmd", cwd: [...HOME], entries: bannerLines(isEs).map((t) => ({ kind: "out" as const, text: t })), input: "", cursor: 0, histIdx: -1, saved: "", search: null, killRing: "", awaiting: null, title: null, env: {}, ended: false };
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
    setSessions([{ id: nextIdRef.current++, mode: "cmd", cwd: [...HOME], entries: bannerLines(isEs).map((t) => ({ kind: "out" as const, text: t })), input: "", cursor: 0, histIdx: -1, saved: "", search: null, killRing: "", awaiting: null, title: null, env: {}, ended: false }]);
    setActiveId(-1);
    setActiveLesson(null);
    setShowHint(false);
    setUnread({});
  }, [isEs]);

  useEffect(() => {
    if (activeId === -1 && sessions.length > 0) setActiveId(sessions[0].id);
  }, [activeId, sessions]);

  const checkLessonProgress = useCallback((lesson: Lesson, st: FsState, cw: string[], cmds: string[], id: number) => {
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
      appendEntries(id, [{ kind: "ok", text: isEs ? `✔ Lección completada: ${lesson.titleEs}` : `✔ Lesson completed: ${lesson.titleEn}` }]);
      setActiveLesson(null);
      setShowHint(false);
    }
  }, [isEs, persist, appendEntries]);

  const handleSubmit = useCallback((session: Session) => {
    const line = session.input;
    const mode = session.mode;
    const cwd = session.cwd;
    const env = session.env;
    if (session.awaiting) {
      const { variable, prompt: promptText } = session.awaiting;
      appendEntries(session.id, [{ kind: "out", text: `${promptText}${line}` }]);
      const env2 = { ...env };
      if (line.length > 0) env2[variable] = line;
      else delete env2[variable];
      patchSession(session.id, { input: "", cursor: 0, histIdx: -1, saved: "", search: null, killRing: "", awaiting: null, env: env2 });
      return;
    }
    patchSession(session.id, { input: "", cursor: 0, histIdx: -1, saved: "", search: null, killRing: "" });
    if (!line.trim()) {
      appendEntries(session.id, [{ kind: "cmd", text: `${promptString(cwd, mode)} ` }]);
      return;
    }
    appendEntries(session.id, [{ kind: "cmd", text: `${promptString(cwd, mode)} ${line}` }]);
    const nextHistory = [line, ...cmdHistory.filter((h) => h !== line)].slice(0, 60);
    setCmdHistory(nextHistory);
    persist(doneLessons, nextHistory);

    const result = executeLine(fs, cwd, line, { isEs, mode, env, history: cmdHistory });

    if (result.clear) {
      patchSession(session.id, { cwd: result.cwd, env: result.env ?? env, entries: [] });
      setFs(result.state);
      if (result.exit) patchSession(session.id, { ended: true });
      return;
    }
    appendEntries(session.id, result.lines.map((t) => ({ kind: (result.error ? "err" : "out") as OutputEntry["kind"], text: t })));
    patchSession(session.id, { cwd: result.cwd, env: result.env ?? env });
    setFs(result.state);
    if (result.waitInput) {
      appendEntries(session.id, [{ kind: "warn", text: result.waitInput.prompt }]);
      patchSession(session.id, { awaiting: result.waitInput });
      return;
    }
    if (result.title !== undefined) {
      patchSession(session.id, { title: result.title });
    }
    if (result.exit) {
      patchSession(session.id, { ended: true });
      return;
    }

    if (result.openTab) {
      const id = createSession(result.openTab.mode, false);
      setUnread((prev) => ({ ...prev, [id]: 0 }));
    }

    if (result.sendTo) {
      const senderIdx = sessions.findIndex((s) => s.id === session.id);
      const targetSession = sessions[result.sendTo.target - 1];
      if (targetSession) {
        appendEntries(targetSession.id, [
          { kind: "ok", text: isEs
            ? `--- Mensaje de la terminal ${senderIdx + 1} ---`
            : `--- Message from terminal ${senderIdx + 1} ---` },
          { kind: "out", text: result.sendTo.message },
        ]);
        if (targetSession.id !== session.id) {
          setUnread((prev) => ({ ...prev, [targetSession.id]: (prev[targetSession.id] ?? 0) + 1 }));
        }
      } else {
        appendEntries(session.id, [{ kind: "err", text: isEs
          ? `MSG: no existe la terminal ${result.sendTo.target}. Hay ${sessions.length} abiertas.`
          : `MSG: terminal ${result.sendTo.target} does not exist. There are ${sessions.length} open.` }]);
      }
    }

    const lowerCmd = line.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const nextCmds = [...cmdsRun, lowerCmd];
    setCmdsRun(nextCmds);
    if (activeLesson) {
      checkLessonProgress(activeLesson, result.state, result.cwd, nextCmds, session.id);
    }
  }, [fs, cmdHistory, doneLessons, persist, isEs, activeLesson, cmdsRun, checkLessonProgress, patchSession, appendEntries, createSession, sessions]);

  const toRl = (s: Session): ReadlineState => ({
    input: s.input,
    cursor: s.cursor,
    histIdx: s.histIdx,
    saved: s.saved,
    search: s.search,
    killRing: s.killRing,
    exit: false,
  });

  const patchRl = useCallback((id: number, next: ReadlineState) => {
    patchSession(id, { input: next.input, cursor: next.cursor, histIdx: next.histIdx, saved: next.saved, search: next.search, killRing: next.killRing });
  }, [patchSession]);

  const resetInput = useCallback((id: number) => {
    patchSession(id, { input: "", cursor: 0, histIdx: -1, saved: "", search: null, killRing: "" });
  }, [patchSession]);

  const pasteText = useCallback((session: Session, raw: string) => {
    const text = raw.replace(/\r\n?/g, " ");
    if (!text) return;
    const c = session.cursor;
    patchSession(session.id, { input: session.input.slice(0, c) + text + session.input.slice(c), cursor: c + text.length });
  }, [patchSession]);

  const pasteFromClipboard = useCallback((session: Session) => {
    void navigator.clipboard
      .readText()
      .then((t) => pasteText(session, t))
      .catch(() => {});
  }, [pasteText]);

  const exitSession = useCallback((session: Session) => {
    appendEntries(session.id, [{ kind: "warn", text: "^D" }]);
    patchSession(session.id, { ended: true });
  }, [appendEntries, patchSession]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>, session: Session) => {
    const isAltGr = e.ctrlKey && e.altKey;
    if (f7.open) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const len = histRef.current.length;
        if (len === 0) return;
        setF7((p) => ({ ...p, idx: e.key === "ArrowUp" ? Math.max(0, p.idx - 1) : Math.min(len - 1, p.idx + 1) }));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const oldestFirst = [...histRef.current].reverse();
        const picked = oldestFirst[f7.idx] ?? "";
        setF7({ open: false, idx: 0 });
        patchSession(session.id, { input: picked, cursor: picked.length, histIdx: histRef.current.indexOf(picked), saved: "", search: null, killRing: "" });
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setF7({ open: false, idx: 0 });
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const n = Number(e.key);
        if (n >= 1) {
          const oldestFirst = [...histRef.current].reverse();
          const picked = oldestFirst[n - 1];
          if (picked !== undefined) {
            setF7({ open: false, idx: 0 });
            patchSession(session.id, { input: picked, cursor: picked.length, histIdx: histRef.current.indexOf(picked), saved: "", search: null, killRing: "" });
            return;
          }
        }
        return;
      }
      setF7({ open: false, idx: 0 });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (session.ended) return;
      handleSubmit(session);
      return;
    }
    if (session.mode === "cmd" && (e.key === "F1" || e.key === "F3" || e.key === "F7" || e.key === "F8")) {
      e.preventDefault();
      const hist = histRef.current;
      if (e.key === "F7") {
        if (hist.length === 0) return;
        setF7({ open: true, idx: hist.length - 1 });
        return;
      }
      if (e.key === "F3") {
        const last = hist[0];
        if (last === undefined) return;
        patchSession(session.id, { input: last, cursor: last.length, histIdx: 0, saved: "" });
        return;
      }
      if (e.key === "F1") {
        const last = hist[0];
        if (last === undefined || session.input.length >= last.length) return;
        const next = last.slice(0, session.input.length + 1);
        patchSession(session.id, { input: next, cursor: next.length, histIdx: 0, saved: "" });
        return;
      }
      if (e.key === "F8") {
        const prefix = session.input.toLowerCase();
        const matches = hist.filter((h) => h.toLowerCase().startsWith(prefix));
        if (matches.length === 0) return;
        f8IdxRef.current = (f8IdxRef.current + 1) % matches.length;
        const picked = matches[f8IdxRef.current];
        patchSession(session.id, { input: picked, cursor: picked.length, histIdx: hist.indexOf(picked), saved: "" });
        return;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (session.search) return;
      const input = session.input;
      const parts = input.split(/\s+/);
      if (parts.length === 0) return;
      const last = parts[parts.length - 1] ?? "";
      if (last.length === 0) return;
      const lower = last.toLowerCase();
      let candidates: string[];
      if (parts.length === 1) {
        candidates = COMMAND_NAMES.filter((c) => c.startsWith(lower));
      } else {
        const pathSegs = last.split(/[\\/]+/).filter((p) => p.length > 0);
        const searchName = (pathSegs.pop() ?? "").toLowerCase();
        const targetDir = pathSegs.length > 0 ? pathSegs : session.cwd;
        const dirNode = targetDir.length === 0 ? fs.root : resolveDir(fs, targetDir);
        candidates = Object.values(dirNode?.children ?? {})
          .filter((c) => c.name.toLowerCase().startsWith(searchName))
          .map((c) => (c.kind === "dir" ? `${c.name}\\` : c.name));
      }
      if (candidates.length === 1) {
        parts[parts.length - 1] = candidates[0];
        const done = parts.join(" ");
        lastTabRef.current[session.id] = done;
        patchSession(session.id, { input: done, cursor: done.length });
      } else if (candidates.length > 1) {
        if (lastTabRef.current[session.id] === input) {
          appendEntries(session.id, [{ kind: "out", text: candidates.join("  ") }]);
        } else {
          const common = commonPrefix(candidates);
          if (common.length > last.length) {
            parts[parts.length - 1] = common;
            const done = parts.join(" ");
            lastTabRef.current[session.id] = done;
            patchSession(session.id, { input: done, cursor: done.length });
          } else {
            lastTabRef.current[session.id] = input;
          }
        }
      }
      return;
    }
    if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
      e.preventDefault();
      const sel = window.getSelection()?.toString();
      if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
      return;
    }
    if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
      e.preventDefault();
      pasteFromClipboard(session);
      return;
    }
    if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      appendEntries(session.id, [
        { kind: "cmd", text: `${promptString(session.cwd, session.mode)} ${session.input}` },
        { kind: "warn", text: "^C" },
      ]);
      resetInput(session.id);
      return;
    }
    if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      patchSession(session.id, { entries: [] });
      return;
    }
    if (e.key === "F1" || e.key === "F3" || e.key === "F7" || e.key === "F8") {
      e.preventDefault();
      return;
    }
    const plainTyping = e.key.length === 1 && (isAltGr || (!e.ctrlKey && !e.altKey));
    if (plainTyping && !session.search) return;
    if (e.ctrlKey || e.altKey || session.search) e.preventDefault();
    const ev: KeyEvent = { key: e.key, ctrl: isAltGr ? false : e.ctrlKey, alt: isAltGr ? false : e.altKey };
    const next = rlHandleKey(toRl(session), ev, histRef.current);
    if (next.exit) {
      exitSession(session);
      return;
    }
    patchRl(session.id, next);
  }, [fs, handleSubmit, patchSession, appendEntries, patchRl, resetInput, pasteFromClipboard, exitSession, f7]);

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
    inputRefs.current[activeId]?.focus();
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
    if (s.title) return s.title;
    return `${s.mode === "ps" ? "PS" : "cmd"} · ${leaf}`;
  };

  const visibleSessions = layout === "split" && sessions.length > 1
    ? [sessions[0], active.id === sessions[0].id ? sessions[1] : active]
    : [active];
  const isSplit = layout === "split" && visibleSessions.length > 1;
  const outputHeight = isFullscreen ? "min-h-0 flex-1" : isSplit ? "h-[300px] sm:h-[360px]" : "h-[380px] sm:h-[460px]";

  const renderPane = (s: Session) => {
    const paneActive = s.id === activeId;
    const th = THEMES[theme];
    return (
      <div
        key={s.id}
        onMouseDown={() => {
          if (!paneActive) setActiveId(s.id);
        }}
        className="flex min-h-0 min-w-0 flex-col"
      >
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-2 sm:px-4">
          {!isFullscreen && (
            <>
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
            </>
          )}
          <span className="ml-2 hidden truncate font-mono text-xs text-white/50 sm:inline">
            {s.mode === "ps" ? "powershell.exe" : "cmd.exe"} — {pathToString(s.cwd)}
          </span>
          {paneActive && (
            <div className="ml-auto flex items-center gap-1">
              <div className="mr-1 hidden items-center gap-1 rounded-md border border-white/10 p-0.5 sm:flex">
                {(["base", "lg", "xl"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => changeFontSize(size)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                      fontSize === size ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
                    }`}
                    title={isEs ? "Tamaño de letra (para proyectar)" : "Font size (for projecting)"}
                  >
                    {size === "base" ? "A" : size === "lg" ? "A+" : "A++"}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleFullscreen}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                title={isEs ? "Pantalla completa para proyectar" : "Fullscreen for projecting"}
              >
                {isFullscreen ? <MdFullscreenExit /> : <MdFullscreen />}
              </button>
              <button
                onClick={() => patchSession(s.id, { mode: "cmd" })}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                  s.mode === "cmd" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
                }`}
              >
                CMD
              </button>
              <button
                onClick={() => patchSession(s.id, { mode: "ps" })}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                  s.mode === "ps" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
                }`}
              >
                PowerShell
              </button>
            </div>
          )}
        </div>
        <div
          ref={(el) => { outputRefs.current[s.id] = el; }}
          onMouseUp={() => {
            const sel = window.getSelection()?.toString();
            if (sel) {
              void navigator.clipboard.writeText(sel).catch(() => {});
              return;
            }
            inputRefs.current[s.id]?.focus();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            pasteFromClipboard(s);
          }}
          className={`overflow-y-auto px-3 py-3 font-mono leading-relaxed text-white/90 sm:px-4 ${outputHeight} ${fontCls}`}
        >
          {s.entries.map((entry, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${
                entry.kind === "cmd"
                  ? "font-semibold text-white"
                  : entry.kind === "ok"
                    ? th.ok
                    : entry.kind === "err"
                      ? th.err
                      : entry.kind === "warn"
                        ? th.warn
                        : entry.text.trimStart().startsWith("<DIR>") || entry.text.trimStart().startsWith("lrwx")
                          ? th.listing
                          : th.out
              }`}
            >
              {entry.text}
            </div>
          ))}
          {s.search && (
            <div className="mb-1 font-mono text-xs">
              <span className={s.search.failed ? "text-red-400" : "text-amber-300"}>
                ({isEs ? "búsqueda inversa" : "reverse-i-search"})`{s.search.query}`:{" "}
              </span>
              <span className="text-white">{s.search.matchIdx >= 0 ? histRef.current[s.search.matchIdx] ?? "" : ""}</span>
            </div>
          )}
          {f7.open && s.id === activeId && (
            <div className="mb-1 max-h-40 overflow-y-auto rounded border border-white/15 bg-black/90 p-1 font-mono text-xs">
              {[...histRef.current].reverse().map((h, i) => (
                <div key={i} className={`whitespace-pre-wrap break-words px-1 ${i === f7.idx ? "bg-white/15 text-white" : "text-white/60"}`}>
                  {`${i + 1}  ${h}`}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-0">
            <span className={`shrink-0 whitespace-pre ${s.mode === "ps" ? "text-yellow-300" : th.prompt}`}>{s.ended ? "" : `${promptString(s.cwd, s.mode)}`}</span>
            {s.ended ? (
              <span className="text-white/70">{isEs ? "Sesión cerrada. Cierra la pestaña o pulsa «Reiniciar terminal» para volver a empezar." : "Session closed. Close the tab or press «Reset terminal» to start again."}</span>
            ) : (
              <input
                ref={(el) => { inputRefs.current[s.id] = el; }}
                value={s.input}
                onChange={(e) => patchSession(s.id, { input: e.target.value, cursor: e.target.selectionStart ?? e.target.value.length })}
                onKeyDown={(e) => handleKey(e, s)}
                spellCheck={false}
                autoComplete="off"
                style={{ caretColor: th.caret }}
                className="w-full bg-transparent font-mono text-white outline-none"
                aria-label={isEs ? "Comandos de la terminal" : "Terminal commands"}
              />
            )}
          </div>
        </div>
      </div>
    );
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => changeLayout(layout === "split" ? "single" : "split")}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              layout === "split" ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 bg-surface/60 text-text-muted hover:text-text"
            }`}
            title={isEs ? "Ver dos terminales a la vez" : "See two terminals at once"}
          >
            {layout === "split" ? (isEs ? "1 panel" : "1 pane") : (isEs ? "2 paneles" : "2 panes")}
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-border/30 bg-surface/60 px-1 py-1">
            {(Object.keys(THEMES) as TerminalTheme[]).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  theme === t ? "bg-primary/20 text-primary" : "text-text-muted hover:text-text"
                }`}
                title={isEs ? `Tema ${THEMES[t].labelEs}` : `${THEMES[t].labelEn} theme`}
              >
                {t === "ubuntu" ? "Ubuntu" : t === "verde" ? "Verde" : "Contraste"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowEnvs((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              showEnvs ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 bg-surface/60 text-text-muted hover:text-text"
            }`}
          >
            {isEs ? "Entornos" : "Environments"}
          </button>
          <button
            onClick={resetTerminal}
            className="rounded-lg border border-border/30 bg-surface/60 px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text"
          >
            {isEs ? "Reiniciar terminal" : "Reset terminal"}
          </button>
        </div>
      </div>

      {showEnvs && (
        <div className="rounded-2xl border border-border/20 bg-surface/30 p-4 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={envName}
              onChange={(e) => setEnvName(e.target.value)}
              placeholder={isEs ? "Nombre del entorno (ej. clase-1)" : "Environment name (e.g. class-1)"}
              className="w-48 rounded-lg border border-border/30 bg-background px-3 py-1.5 text-xs text-text outline-none focus:border-primary/50"
            />
            <button
              onClick={saveEnv}
              disabled={!envName.trim()}
              className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 font-semibold text-primary transition-colors disabled:opacity-40"
            >
              {isEs ? "Guardar" : "Save"}
            </button>
            <button
              onClick={exportEnv}
              className="rounded-lg border border-border/30 bg-surface/60 px-3 py-1.5 font-semibold text-text-muted transition-colors hover:text-text"
            >
              {isEs ? "Exportar archivo" : "Export file"}
            </button>
            <label className="cursor-pointer rounded-lg border border-border/30 bg-surface/60 px-3 py-1.5 font-semibold text-text-muted transition-colors hover:text-text">
              {isEs ? "Importar archivo" : "Import file"}
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importEnv(file);
                  e.target.value = "";
                }}
              />
            </label>
            {envMsg && <span className="text-green-400">{envMsg}</span>}
          </div>
          {Object.keys(savedEnvs).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(savedEnvs).map(([name, env]) => (
                <span key={name} className="flex items-center gap-1 rounded-lg border border-border/30 bg-surface/60 px-2 py-1">
                  <button
                    onClick={() => { applyEnv(env); setEnvMsg(isEs ? `Entorno «${name}» cargado.` : `Environment «${name}» loaded.`); }}
                    className="font-semibold text-text transition-colors hover:text-primary"
                    title={isEs ? "Cargar este entorno" : "Load this environment"}
                  >
                    {name}
                  </button>
                  <button
                    onClick={() => deleteEnv(name)}
                    className="rounded p-0.5 text-text-muted/60 transition-colors hover:text-red-400"
                    title={isEs ? "Eliminar" : "Delete"}
                  >
                    <MdClose className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-text-muted/70">
            {isEs
              ? "Un entorno guarda el disco C: completo, las pestañas, el historial y las lecciones. Se almacena en tu navegador; exporta el archivo para compartirlo con la clase."
              : "An environment saves the whole C: drive, the tabs, the history and the lessons. It is stored in your browser; export the file to share it with the class."}
          </p>
        </div>
      )}

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
        <div ref={splitWrapRef} className={`flex min-h-0 flex-col md:flex-row ${isFullscreen ? "flex-1" : ""}`}>
          {isSplit ? (
            <>
              <div className="min-h-0 min-w-0" style={isMd ? { width: `${splitPct}%` } : undefined}>
                {renderPane(visibleSessions[0])}
              </div>
              <div
                onPointerDown={startDrag}
                className="hidden h-2 w-full shrink-0 cursor-row-resize bg-white/10 transition-colors hover:bg-primary/60 md:h-auto md:w-2 md:cursor-col-resize"
                aria-hidden="true"
              />
              <div className="min-h-0 min-w-0 flex-1">
                {renderPane(visibleSessions[1])}
              </div>
            </>
          ) : (
            renderPane(visibleSessions[0])
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted/70">
        <span>
          {isEs
            ? "↑/↓ historial · Tab completa (2× lista opciones) · F7 menú de historial · F8 por prefijo · F3 repite el último · F1 letra a letra · Ctrl+R busca (PowerShell) · selecciona para copiar · click derecho pega · start cmd abre pestaña que comparte el disco · msg manda mensajes"
            : "↑/↓ history · Tab completes (2× lists options) · F7 history menu · F8 by prefix · F3 repeats last · F1 char by char · Ctrl+R search (PowerShell) · select to copy · right-click to paste · start cmd opens a tab sharing the drive · msg sends messages"}
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
