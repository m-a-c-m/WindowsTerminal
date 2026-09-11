import {
  createInitialFs,
  resolvePath,
  pathToString,
  getNode,
  listDir,
  mkdir,
  writeFile,
  readFile,
  deletePath,
  copyPath,
  movePath,
  countTree,
  renderTree,
  matchWildcard,
  type FsState,
} from "./terminalFs";

export interface CmdOptions {
  isEs: boolean;
}

export interface CmdResult {
  lines: string[];
  state: FsState;
  cwd: string[];
  clear: boolean;
  exit: boolean;
}

export const HOME = ["Users", "Estudiante"];

export function promptString(cwd: string[]): string {
  return `${pathToString(cwd)}>`;
}

function thousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function pad(text: string | number, len: number): string {
  return String(text).padStart(len, " ");
}

function dateStamp(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const FAKES = {
  whoami: "pc-estudiante\\estudiante",
  hostname: "PC-ESTUDIANTE",
  ipconfig: [
    "",
    "Configuración IP de Windows",
    "",
    "Adaptador Ethernet Ethernet:",
    "",
    "   Sufijo DNS específico para la conexión. . : miguelacm.local",
    "   Dirección IPv4. . . . . . . . . . . . . . : 192.168.1.42",
    "   Máscara de subred . . . . . . . . . . . . : 255.255.255.0",
    "   Puerta de enlace predeterminada . . . . . : 192.168.1.1",
    "",
    "Adaptador de LAN inalámbrica Wi-Fi:",
    "",
    "   Estado de los medios. . . . . . . . . . . : medios desconectados",
  ],
  systeminfo: [
    "",
    "Nombre de host:                         PC-ESTUDIANTE",
    "Nombre del sistema operativo:           Microsoft Windows 10 Simulado",
    "Tipo de sistema:                        PC basado en x64",
    "Memoria física total:                   16.384 MB",
    "Memoria física disponible:              9.216 MB",
    "Dominio:                                GRUPO-TRABAJO",
    "Zona horaria:                           (UTC+01:00) Madrid",
  ],
  tasklist: [
    "",
    "Nombre de imagen                 PID Nombre de sesión    Uso de memoria",
    "========================= ======== ================ ============",
    "explorer.exe                   1024 Console           48.928 KB",
    "cmd.exe                        2048 Console            3.116 KB",
    "notepad.exe                    2112 Console           12.844 KB",
    "chrome.exe                     3124 Console          289.532 KB",
  ],
};

function ok(state: FsState, cwd: string[], lines: string[], clear = false, exit = false): CmdResult {
  return { lines, state, cwd, clear, exit };
}

function err(state: FsState, cwd: string[], lines: string[], isEs: boolean, code: string): CmdResult {
  const messages: Record<string, [string, string]> = {
    notFound: [isEs ? "El sistema no puede encontrar la ruta especificada." : "The system cannot find the path specified.", ""],
    notADir: [isEs ? "El directorio no es válido." : "The directory name is invalid.", ""],
    notAFile: [isEs ? "Acceso denegado: es un directorio." : "Access denied: it is a directory.", ""],
    duplicate: [isEs ? "Ya existe un subdirectorio o un archivo con ese nombre." : "A subdirectory or file with that name already exists.", ""],
    dirNotEmpty: [isEs ? "El directorio no está vacío. Usa RD /S para borrarlo con su contenido." : "The directory is not empty. Use RD /S to delete it with its contents.", ""],
    isDir: [isEs ? "Acceso denegado: es un directorio." : "Access denied: it is a directory.", ""],
    rootOp: [isEs ? "Acceso denegado: no se puede operar sobre la raíz." : "Access denied: cannot operate on the root.", ""],
    destExists: [isEs ? "Ya existe un archivo con ese nombre en el destino." : "A file with that name already exists in the destination.", ""],
    invalidPath: [isEs ? "La ruta no es válida." : "The path is not valid.", ""],
  };
  const [msg] = messages[code] ?? ["", ""];
  return ok(state, cwd, [msg]);
}

function tokenize(line: string): string[] {
  return line.trim().split(/\s+/).filter((t) => t.length > 0);
}

export function executeLine(state: FsState, cwd: string[], line: string, opts: CmdOptions): CmdResult {
  const isEs = opts.isEs;
  const tokens = tokenize(line);
  if (tokens.length === 0) return ok(state, cwd, []);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  const argLine = tokens.slice(1).join(" ");

  switch (cmd) {
    case "help":
    case "?": {
      const rows = isEs
        ? [
            "",
            "Comandos disponibles (escribe help comando para más detalle):",
            "  CD [ruta]        Cambia de directorio          DIR [ruta]   Lista el contenido",
            "  MD nombre        Crea una carpeta              RD [/S] dir  Borra una carpeta",
            "  TYPE archivo     Muestra el contenido          DEL archivo  Borra archivos",
            "  COPY origen dst  Copia archivos                MOVE origen dst  Mueve",
            "  REN origen nvo   Renombra                      ECHO texto [> archivo]",
            "  TREE             Muestra el árbol              CLS          Limpia la pantalla",
            "  IPCONFIG         Configuración de red          PING host    Comprueba conexión",
            "  WHOAMI           Usuario actual                SYSTEMINFO   Info del sistema",
            "  TASKLIST         Procesos                      DATE / TIME  Fecha y hora",
            "  VER              Versión                       HOSTNAME     Nombre del equipo",
            "  EXIT             Cierra la sesión              LS / PWD     Alias de DIR y CD",
            "",
          ]
        : [
            "",
            "Available commands:",
            "  CD [path]        Change directory              DIR [path]   List contents",
            "  MD name          Make directory                RD [/S] dir  Remove directory",
            "  TYPE file        Show file contents            DEL file     Delete files",
            "  COPY src dst     Copy files                    MOVE src dst Move",
            "  REN src new      Rename                        ECHO text [> file]",
            "  TREE             Show tree                     CLS          Clear screen",
            "  IPCONFIG         Network config                PING host    Test connection",
            "  WHOAMI           Current user                  SYSTEMINFO   System info",
            "  TASKLIST         Processes                     DATE / TIME  Date and time",
            "  VER              Version                       HOSTNAME     Machine name",
            "  EXIT             Close terminal                LS / PWD     Aliases for DIR and CD",
            "",
          ];
      return ok(state, cwd, rows);
    }

    case "cls":
      return ok(state, cwd, [], true);

    case "exit":
      return ok(state, cwd, [isEs ? "Gracias por practicar. Cerrando la terminal..." : "Thanks for practicing. Closing the terminal..."], false, true);

    case "cd":
    case "chdir":
    case "pwd": {
      if (args.length === 0) return ok(state, cwd, [promptString(cwd)]);
      const target = resolvePath(cwd, argLine);
      if (!target.ok) return err(state, cwd, [], isEs, "invalidPath");
      const node = getNode(state, target.value);
      if (!node) return err(state, cwd, [], isEs, "notFound");
      if (node.kind !== "dir") return err(state, cwd, [], isEs, "notADir");
      return { lines: [], state, cwd: target.value, clear: false, exit: false };
    }

    case "dir":
    case "ls": {
      const targetArg = args[0];
      const target = targetArg ? resolvePath(cwd, targetArg).value : cwd;
      const node = getNode(state, target);
      if (!node) return err(state, cwd, [], isEs, "notFound");
      if (node.kind !== "dir") return err(state, cwd, [], isEs, "notADir");
      const entriesRes = listDir(state, target);
      const entries = entriesRes.ok ? entriesRes.value : [];
      const lines = [
        "",
        ` El volumen de la unidad C no tiene etiqueta.`,
        ` Directorio de ${pathToString(target)}`,
        "",
        ...entries.map((e) => {
          const node2 = getNode(state, [...target, e.name]);
          const size = e.kind === "file" ? pad(thousands((node2?.content ?? "").length), 16) : "<DIR>";
          return `${size} ${e.name}`;
        }),
        "",
        `${pad(entries.filter((e) => e.kind === "file").length, 15)} ${isEs ? "archivos" : "files"}`,
        `${pad(entries.filter((e) => e.kind === "dir").length + 2, 15)} ${isEs ? "directorios" : "directories"}`,
        "",
      ];
      return ok(state, cwd, lines);
    }

    case "md":
    case "mkdir": {
      if (args.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      let st = state;
      for (const name of args) {
        const target = resolvePath(cwd, name);
        const res = mkdir(st, target.value);
        if (!res.ok) return err(st, cwd, [], isEs, res.error);
        st = res.value;
      }
      return ok(st, cwd, []);
    }

    case "rd":
    case "rmdir": {
      const recursive = args[0]?.toLowerCase() === "/s";
      const name = recursive ? args[1] : args[0];
      if (!name) return err(state, cwd, [], isEs, "invalidPath");
      const target = resolvePath(cwd, name);
      const res = deletePath(state, target.value, recursive);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(res.value, cwd, []);
    }

    case "del":
    case "erase": {
      if (args.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      let st = state;
      for (const raw of args) {
        const parentPart = raw.includes("\\") ? raw.slice(0, raw.lastIndexOf("\\") + 1) : "";
        const pattern = raw.slice(raw.lastIndexOf("\\") + 1) || raw;
        const parentPath = resolvePath(cwd, parentPart).value;
        const node = getNode(st, parentPath);
        if (!node || node.kind !== "dir") return err(st, cwd, [], isEs, "notFound");
        const matches = Object.values(node.children ?? {})
          .filter((c) => c.kind === "file" && matchWildcard(c.name, pattern))
          .map((c) => c.name);
        if (matches.length === 0 && !pattern.includes("*")) return err(st, cwd, [], isEs, "notFound");
        for (const name of matches) {
          const res = deletePath(st, [...parentPath, name]);
          if (!res.ok) return err(st, cwd, [], isEs, res.error);
          st = res.value;
        }
      }
      return ok(st, cwd, []);
    }

    case "type":
    case "cat": {
      if (args.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      const target = resolvePath(cwd, args[0]);
      const res = readFile(state, target.value);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(state, cwd, res.value.length > 0 ? res.value.split(/\r?\n/) : [""]);
    }

    case "echo": {
      const redirectIdx = args.indexOf(">");
      if (redirectIdx >= 0) {
        const text = args.slice(0, redirectIdx).join(" ");
        const fileRaw = args[redirectIdx + 1];
        if (!fileRaw) return err(state, cwd, [], isEs, "invalidPath");
        const target = resolvePath(cwd, fileRaw);
        const res = writeFile(state, target.value, text + "\r\n");
        if (!res.ok) return err(state, cwd, [], isEs, res.error);
        return ok(res.value, cwd, []);
      }
      return ok(state, cwd, [args.length === 0 ? (isEs ? "ECHO está activado." : "ECHO is on.") : args.join(" ")]);
    }

    case "copy": {
      if (args.length < 2) return err(state, cwd, [], isEs, "invalidPath");
      const src = resolvePath(cwd, args[0]);
      const dst = resolvePath(cwd, args[1]);
      const res = copyPath(state, src.value, dst.value);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(res.value, cwd, [isEs ? "        1 archivo(s) copiado(s)." : "        1 file(s) copied."]);
    }

    case "move": {
      if (args.length < 2) return err(state, cwd, [], isEs, "invalidPath");
      const src = resolvePath(cwd, args[0]);
      const dst = resolvePath(cwd, args[1]);
      const res = movePath(state, src.value, dst.value);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(res.value, cwd, [isEs ? "        1 archivo(s) movido(s)." : "        1 file(s) moved."]);
    }

    case "ren":
    case "rename": {
      if (args.length < 2) return err(state, cwd, [], isEs, "invalidPath");
      const src = resolvePath(cwd, args[0]);
      const node = getNode(state, src.value);
      if (!node) return err(state, cwd, [], isEs, "notFound");
      const dst = [...src.value.slice(0, -1), args[1]];
      const res = movePath(state, src.value, dst);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(res.value, cwd, []);
    }

    case "tree": {
      const target = args[0] ? resolvePath(cwd, args[0]).value : cwd;
      const node = getNode(state, target);
      if (!node) return err(state, cwd, [], isEs, "notFound");
      if (node.kind !== "dir") return err(state, cwd, [], isEs, "notADir");
      const counts = countTree(node);
      return ok(state, cwd, [pathToString(target), ...renderTree(node), "", isEs
        ? `${counts.dirs} carpetas, ${counts.files} archivos`
        : `${counts.dirs} folders, ${counts.files} files`]);
    }

    case "whoami":
      return ok(state, cwd, [FAKES.whoami]);

    case "hostname":
      return ok(state, cwd, [FAKES.hostname]);

    case "ipconfig":
      return ok(state, cwd, FAKES.ipconfig);

    case "systeminfo":
      return ok(state, cwd, FAKES.systeminfo);

    case "tasklist":
      return ok(state, cwd, FAKES.tasklist);

    case "ping": {
      if (args.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      const host = args[0];
      const lines = isEs
        ? [
            `Haciendo ping a ${host} [93.184.216.34] con 32 bytes de datos:`,
            "Respuesta desde 93.184.216.34: bytes=32 tiempo=24ms TTL=57",
            "Respuesta desde 93.184.216.34: bytes=32 tiempo=25ms TTL=57",
            "Respuesta desde 93.184.216.34: bytes=32 tiempo=23ms TTL=57",
            "Respuesta desde 93.184.216.34: bytes=32 tiempo=26ms TTL=57",
            "",
            "Estadísticas de ping para 93.184.216.34:",
            "    Paquetes: enviados = 4, recibidos = 4, perdidos = 0 (0% perdidos),",
          ]
        : [
            `Pinging ${host} [93.184.216.34] with 32 bytes of data:`,
            "Reply from 93.184.216.34: bytes=32 time=24ms TTL=57",
            "Reply from 93.184.216.34: bytes=32 time=25ms TTL=57",
            "Reply from 93.184.216.34: bytes=32 time=23ms TTL=57",
            "Reply from 93.184.216.34: bytes=32 time=26ms TTL=57",
            "",
            `Ping statistics for 93.184.216.34:`,
            "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),",
          ];
      return ok(state, cwd, lines);
    }

    case "date":
      return ok(state, cwd, [isEs
        ? `La fecha actual es: ${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
        : `The current date is: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`]);

    case "time":
      return ok(state, cwd, [isEs
        ? `La hora actual es: ${new Date().toLocaleTimeString("es-ES")}`
        : `The current time is: ${new Date().toLocaleTimeString("en-US")}`]);

    case "ver":
      return ok(state, cwd, [isEs ? "Microsoft Windows [Simulado para práctica] versión 10.0" : "Microsoft Windows [Simulated for practice] version 10.0"]);

    case "start": {
      const app = args[0]?.toLowerCase() ?? "";
      const known: Record<string, [string, string]> = {
        notepad: [isEs ? "El Bloc de notas (simulado) se abriría ahora." : "Notepad (simulated) would open now.", ""],
        calc: [isEs ? "La Calculadora (simulada) se abriría ahora." : "Calculator (simulated) would open now.", ""],
      };
      if (known[app]) return ok(state, cwd, [known[app][0]]);
      return ok(state, cwd, [isEs ? `No se puede encontrar '${args[0] ?? ""}'. Prueba: start notepad o start calc.` : `Cannot find '${args[0] ?? ""}'. Try start notepad or start calc.`]);
    }

    case "get-childitem":
    case "gci": {
      const dirRes = executeLine(state, cwd, `dir ${args.join(" ")}`, opts);
      return dirRes;
    }

    case "get-content":
    case "gc": {
      const typeRes = executeLine(state, cwd, `type ${args.join(" ")}`, opts);
      return typeRes;
    }

    case "get-location":
    case "gl": {
      return ok(state, cwd, ["", `Path    : ${pathToString(cwd)}`, ""]);
    }

    default:
      return ok(state, cwd, [isEs
        ? `'${tokens[0]}' no se reconoce como un comando interno o externo. Escribe help para ver los disponibles.`
        : `'${tokens[0]}' is not recognized as an internal command. Type help to see available ones.`]);
  }
}
