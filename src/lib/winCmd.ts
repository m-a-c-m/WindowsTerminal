import {
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
  matchWildcard,
  cloneState,
  type FsNode,
  type FsState,
} from "./terminalFs";
import { runBatch, type BatchPending } from "./cmdBatch";

export interface CmdOptions {
  isEs: boolean;
  mode?: "cmd" | "ps";
  env?: Record<string, string>;
  history?: string[];
  pending?: { line: number; variable: string; value: string; source: string };
}

export interface CmdResult {
  lines: string[];
  state: FsState;
  cwd: string[];
  clear: boolean;
  exit: boolean;
  error?: boolean;
  env?: Record<string, string>;
  sendTo?: { target: number; message: string };
  openTab?: { mode: "cmd" | "ps" };
  waitInput?: { variable: string; prompt: string };
  pending?: BatchPending;
  title?: string;
}

export const HOME = ["Users", "Estudiante"];

export const DEFAULT_ENV: Record<string, string> = {
  ALLUSERSPROFILE: "C:\\ProgramData",
  APPDATA: "C:\\Users\\Estudiante\\AppData\\Roaming",
  COMPUTERNAME: "PC-ESTUDIANTE",
  HOMEDRIVE: "C:",
  HOMEPATH: "\\Users\\Estudiante",
  LOCALAPPDATA: "C:\\Users\\Estudiante\\AppData\\Local",
  OS: "Windows_NT",
  PATH: "C:\\Windows\\system32;C:\\Windows",
  PROCESSOR_ARCHITECTURE: "AMD64",
  SYSTEMROOT: "C:\\Windows",
  TEMP: "C:\\Users\\Estudiante\\AppData\\Local\\Temp",
  TMP: "C:\\Users\\Estudiante\\AppData\\Local\\Temp",
  USERNAME: "Estudiante",
  USERPROFILE: "C:\\Users\\Estudiante",
  WINDIR: "C:\\Windows",
};

const HOSTS: Record<string, string> = {
  localhost: "127.0.0.1",
  "pc-estudiante": "192.168.1.42",
  router: "192.168.1.1",
  "router.miguelacm.local": "192.168.1.1",
  "miguelacm.es": "93.184.216.34",
  "www.miguelacm.es": "93.184.216.34",
  "google.com": "142.250.200.99",
  "youtube.com": "142.250.185.78",
  "wikipedia.org": "208.80.154.224",
  "github.com": "140.82.121.4",
};

export function promptString(cwd: string[], mode: "cmd" | "ps" = "cmd"): string {
  const base = `${pathToString(cwd)}>`;
  return mode === "ps" ? `PS ${pathToString(cwd)}>` : base;
}

function thousands(n: number, isEs: boolean): string {
  const sep = isEs ? "." : ",";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function pad(text: string | number, len: number): string {
  return String(text).padStart(len, " ");
}

function contentLines(content: string): string[] {
  if (content.length === 0) return [];
  return content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

function splitFlags(args: string[]): { flags: Set<string>; rest: string[] } {
  const flags = new Set<string>();
  const rest: string[] = [];
  for (const a of args) {
    if (a.startsWith("/") && a.length > 1) flags.add(a.slice(1).toLowerCase());
    else rest.push(a);
  }
  return { flags, rest };
}

function volumeHeader(isEs: boolean): string[] {
  return isEs
    ? [" El volumen de la unidad C no tiene etiqueta.", " El número de serie del volumen es 1A2B-3C4D"]
    : [" The volume in drive C has no label.", " Volume Serial Number is 1A2B-3C4D"];
}

function dirHeader(target: string[], isEs: boolean): string {
  return isEs ? ` Directorio de ${pathToString(target)}` : ` Directory of ${pathToString(target)}`;
}

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function resolveHost(host: string): { ip: string; local: boolean } | null {
  const clean = host.toLowerCase();
  if (isIpv4(clean)) return { ip: clean, local: clean.startsWith("127.") };
  const ip = HOSTS[clean];
  if (!ip) return null;
  return { ip, local: ip.startsWith("127.") };
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
  ipconfigAll: [
    "",
    "Configuración IP de Windows",
    "",
    "   Nombre de host. . . . . . . . . . . . . . : PC-ESTUDIANTE",
    "   Sufijo DNS principal  . . . . . . . . . . : miguelacm.local",
    "",
    "Adaptador Ethernet Ethernet:",
    "",
    "   Sufijo DNS específico para la conexión. . : miguelacm.local",
    "   Descripción . . . . . . . . . . . . . . . : Realtek PCIe GbE Family Controller",
    "   Dirección física. . . . . . . . . . . . . : 00-1A-2B-3C-4D-5E",
    "   DHCP habilitado . . . . . . . . . . . . . : Sí",
    "   Configuración automática habilitada . . . : Sí",
    "   Dirección IPv4. . . . . . . . . . . . . . : 192.168.1.42 (Preferida)",
    "   Máscara de subred . . . . . . . . . . . . : 255.255.255.0",
    "   Puerta de enlace predeterminada . . . . . : 192.168.1.1",
    "   Servidores DNS. . . . . . . . . . . . . . : 192.168.1.1",
    "                                               8.8.8.8",
    "   Concesión obtenida. . . . . . . . . . . . : 11 de septiembre de 2026 8:15:22",
    "   Concesión expira . . . . . . . . . . . . : 18 de septiembre de 2026 8:15:21",
    "",
    "Adaptador de LAN inalámbrica Wi-Fi:",
    "",
    "   Estado de los medios. . . . . . . . . . . : medios desconectados",
  ],
  ipconfigAllEn: [
    "",
    "Windows IP Configuration",
    "",
    "   Host Name . . . . . . . . . . . . . . . . : PC-ESTUDIANTE",
    "   Primary Dns Suffix  . . . . . . . . . . . : miguelacm.local",
    "",
    "Ethernet adapter Ethernet:",
    "",
    "   Connection-specific DNS Suffix  . . . . . : miguelacm.local",
    "   Description . . . . . . . . . . . . . . . : Realtek PCIe GbE Family Controller",
    "   Physical Address. . . . . . . . . . . . . : 00-1A-2B-3C-4D-5E",
    "   DHCP Enabled. . . . . . . . . . . . . . . : Yes",
    "   Autoconfiguration Enabled . . . . . . . . : Yes",
    "   IPv4 Address. . . . . . . . . . . . . . . : 192.168.1.42(Preferred)",
    "   Subnet Mask . . . . . . . . . . . . . . . : 255.255.255.0",
    "   Default Gateway . . . . . . . . . . . . . : 192.168.1.1",
    "   DNS Servers . . . . . . . . . . . . . . . : 192.168.1.1",
    "                                               8.8.8.8",
    "   Lease Obtained. . . . . . . . . . . . . . : Friday, September 11, 2026 8:15:22 AM",
    "   Lease Expires . . . . . . . . . . . . . . : Friday, September 18, 2026 8:15:21 AM",
    "",
    "Wireless LAN adapter Wi-Fi:",
    "",
    "   Media State . . . . . . . . . . . . . . . : Media disconnected",
  ],
  systeminfo: [
    "",
    "Nombre de host:                         PC-ESTUDIANTE",
    "Nombre del sistema operativo:           Microsoft Windows 10 Pro",
    "Versión del sistema operativo:          10.0.19045 N/D Compilación 19045",
    "Fabricante del sistema operativo:       Microsoft Corporation",
    "Tipo de sistema:                        PC basado en x64",
    "Procesador(es):                         1 procesador(es) instalado(s).",
    "                                        Intel64 Family 6 Model 158 ~3600 Mhz",
    "Memoria física total:                   16.384 MB",
    "Memoria física disponible:              9.216 MB",
    "Dominio:                                GRUPO-TRABAJO",
    "Zona horaria:                           (UTC+01:00) Madrid",
  ],
  systeminfoEn: [
    "",
    "Host Name:                              PC-ESTUDIANTE",
    "OS Name:                                Microsoft Windows 10 Pro",
    "OS Version:                             10.0.19045 N/A Build 19045",
    "OS Manufacturer:                        Microsoft Corporation",
    "System Type:                            x64-based PC",
    "Processor(s):                           1 Processor(s) Installed.",
    "                                        Intel64 Family 6 Model 158 ~3600 Mhz",
    "Total Physical Memory:                  16,384 MB",
    "Available Physical Memory:              9,216 MB",
    "Domain:                                 WORKGROUP",
    "Time Zone:                              (UTC+01:00) Madrid",
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
  tasklistEn: [
    "",
    "Image Name                     PID Session Name        Mem Usage",
    "========================= ======== ================ ============",
    "explorer.exe                   1024 Console           48,928 K",
    "cmd.exe                        2048 Console            3,116 K",
    "notepad.exe                    2112 Console           12,844 K",
    "chrome.exe                     3124 Console          289,532 K",
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
    copyDir: [isEs ? "No se puede copiar una carpeta con COPY. Usa XCOPY o ROBOCOPY." : "Cannot copy a folder with COPY. Use XCOPY or ROBOCOPY.", ""],
  };
  const [msg] = messages[code] ?? ["", ""];
  return { lines: [msg], state, cwd, clear: false, exit: false, error: true };
}

function tokenize(line: string): string[] {
  return line.trim().split(/\s+/).filter((t) => t.length > 0);
}

function expandEnv(line: string, env: Record<string, string>): string {
  return line.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (full, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? env[key] : full;
  });
}

function redirectAtEnd(line: string): { command: string; file: string; append: boolean } | null {
  const m = line.match(/(>>|>)\s*([^\s>]+)\s*$/);
  if (!m) return null;
  const at = line.lastIndexOf(m[1]);
  const command = line.slice(0, at).trim();
  return { command, file: m[2], append: m[1] === ">>" };
}

function splitWinPipe(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote = "";
  for (const c of line) {
    if (quote) {
      cur += c;
      if (c === quote) quote = "";
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "|") {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  parts.push(cur.trim());
  if (parts.some((p) => p.length === 0)) return [];
  return parts.length >= 2 ? parts : [];
}

function applyWinFilter(state: FsState, cwd: string[], tokens: string[], stdin: string[], isEs: boolean): { lines: string[]; error?: string; state?: FsState } {
  const cmdName = tokens[0]?.toLowerCase();
  const flags = tokens.slice(1).filter((a) => a.startsWith("/")).map((a) => a.slice(1).toLowerCase());
  const rest = tokens.slice(1).filter((a) => !a.startsWith("/"));
  if (cmdName === "find") {
    const pattern = rest[0]?.replace(/^"|"$/g, "");
    if (!pattern) return { lines: [], error: isEs ? "FIND: faltan parámetros" : "FIND: missing parameters" };
    const inverse = flags.includes("v");
    const insensitive = true;
    const numbered = flags.includes("n");
    const hits = stdin.map((l, i) => ({ l, i })).filter((x) => {
      const hit = insensitive ? x.l.toLowerCase().includes(pattern.toLowerCase()) : x.l.includes(pattern);
      return inverse ? !hit : hit;
    });
    if (flags.includes("c")) return { lines: [String(hits.length)] };
    return { lines: hits.map((x) => (numbered ? `[${x.i + 1}]${x.l}` : x.l)) };
  }
  if (cmdName === "findstr") {
    const pattern = rest[0]?.replace(/^"|"$/g, "");
    if (!pattern) return { lines: [], error: isEs ? "FINDSTR: falta la cadena de búsqueda" : "FINDSTR: missing search string" };
    const inverse = flags.includes("v");
    const insensitive = flags.includes("i");
    const numbered = flags.includes("n");
    const hits = stdin.map((l, i) => ({ l, i })).filter((x) => {
      const hit = insensitive ? x.l.toLowerCase().includes(pattern.toLowerCase()) : x.l.includes(pattern);
      return inverse ? !hit : hit;
    });
    return { lines: hits.map((x) => (numbered ? `${x.i + 1}:${x.l}` : x.l)) };
  }
  if (cmdName === "more") {
    return { lines: stdin };
  }
  if (cmdName === "sort") {
    const sorted = [...stdin].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return { lines: flags.includes("r") ? sorted.reverse() : sorted };
  }
  return { lines: [], error: isEs ? `El comando '${cmdName}' no se admite en una tubería.` : `The command '${cmdName}' is not supported in a pipe.` };
}

function treeLines(node: FsNode, prefix: string, showFiles: boolean, ascii: boolean): string[] {
  const out: string[] = [];
  const children = Object.values(node.children ?? {});
  children.sort((a, b) => (a.kind === b.kind ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.kind === "dir" ? -1 : 1));
  const visible = children.filter((c) => c.kind === "dir" || showFiles);
  visible.forEach((child, i) => {
    const last = i === visible.length - 1;
    const tee = ascii ? (last ? "\\--- " : "+--- ") : (last ? "└── " : "├── ");
    out.push(`${prefix}${tee}${child.name}`);
    if (child.kind === "dir") {
      const sub = ascii ? (last ? "    " : "|   ") : (last ? "    " : "│   ");
      out.push(...treeLines(child, `${prefix}${sub}`, showFiles, ascii));
    }
  });
  return out;
}

const HELP_DETAILS: Record<string, { es: string[]; en: string[] }> = {
  cd: {
    es: ["CD [/D] ruta        Cambia el directorio actual.", "  cd            Muestra el directorio actual.", "  cd ..         Sube un nivel.", "  cd \\Windows   Va a una ruta absoluta."],
    en: ["CD [/D] path        Changes the current directory.", "  cd            Shows the current directory.", "  cd ..         Goes up one level.", "  cd \\Windows   Goes to an absolute path."],
  },
  dir: {
    es: ["DIR [ruta] [/W] [/S] Lista archivos y carpetas.", "  dir /w        Formato ancho en columnas.", "  dir /s        Incluye subdirectorios.", "  dir archivo   Muestra un archivo concreto."],
    en: ["DIR [path] [/W] [/S] Lists files and folders.", "  dir /w        Wide column format.", "  dir /s        Includes subdirectories.", "  dir file      Shows a single file."],
  },
  md: {
    es: ["MD nombre     Crea una carpeta (también rutas anidadas).", "  md practica\\nivel1\\nivel2"],
    en: ["MD name       Creates a folder (nested paths too).", "  md practice\\level1\\level2"],
  },
  rd: {
    es: ["RD [/S] [/Q] nombre   Borra una carpeta.", "  rd practica   Solo si está vacía.", "  rd /s /q basura  Borra todo sin preguntar."],
    en: ["RD [/S] [/Q] name     Removes a folder.", "  rd practice   Only if empty.", "  rd /s /q junk   Deletes everything without asking."],
  },
  del: {
    es: ["DEL archivo   Borra archivos (admite comodines).", "  del *.txt     Borra todos los .txt del directorio.", "  del /q /f apuntes.txt  Borra sin confirmar."],
    en: ["DEL file      Deletes files (wildcards allowed).", "  del *.txt     Deletes every .txt in the folder.", "  del /q /f notes.txt  Deletes without confirming."],
  },
  copy: {
    es: ["COPY origen destino   Copia archivos.", "  copy apuntes.txt copia.txt", "  copy apuntes.txt Documentos   Copia dentro de una carpeta."],
    en: ["COPY source dest      Copies files.", "  copy notes.txt copy.txt", "  copy notes.txt Documents   Copies into a folder."],
  },
  xcopy: {
    es: ["XCOPY origen destino [/S] [/I] [/Y]  Copia carpetas enteras.", "  xcopy Documentos copia-docs /s"],
    en: ["XCOPY source dest [/S] [/I] [/Y]  Copies whole folders.", "  xcopy Documents docs-copy /s"],
  },
  move: {
    es: ["MOVE origen destino   Mueve archivos o carpetas.", "  move informe.txt Archivo\\"],
    en: ["MOVE source dest      Moves files or folders.", "  move report.txt Archive\\"],
  },
  ren: {
    es: ["REN origen nuevo      Renombra un archivo o carpeta.", "  ren viejo.txt nuevo.txt"],
    en: ["REN source new        Renames a file or folder.", "  ren old.txt new.txt"],
  },
  type: {
    es: ["TYPE archivo [archivo2 ...]   Muestra el contenido de uno o varios archivos."],
    en: ["TYPE file [file2 ...]   Shows the contents of one or more files."],
  },
  echo: {
    es: ["ECHO texto            Muestra texto o crea archivos.", "  echo Hola            Muestra Hola.", "  echo Hola > saludo.txt    Crea el archivo.", "  echo Adios >> saludo.txt  Añade al final."],
    en: ["ECHO text             Shows text or creates files.", "  echo Hello           Shows Hello.", "  echo Hello > hi.txt      Creates the file.", "  echo Bye >> hi.txt       Appends to the file."],
  },
  tree: {
    es: ["TREE [/F] [/A]        Muestra el árbol de carpetas.", "  tree /f       Incluye archivos.", "  tree /a       Líneas ASCII simples."],
    en: ["TREE [/F] [/A]        Shows the folder tree.", "  tree /f       Includes files.", "  tree /a       Plain ASCII lines."],
  },
  findstr: {
    es: ["FINDSTR [/I] [/N] [/V] texto archivo...", "  findstr hola apuntes.txt      Busca (distingue mayúsculas).", "  findstr /i hola apuntes.txt   Ignora mayúsculas.", "  findstr /n hola apuntes.txt   Añade el número de línea.", "  findstr /v hola apuntes.txt   Muestra las líneas que NO coinciden."],
    en: ["FINDSTR [/I] [/N] [/V] text file...", "  findstr hello notes.txt      Searches (case-sensitive).", "  findstr /i hello notes.txt   Ignores case.", "  findstr /n hello notes.txt   Adds the line number.", "  findstr /v hello notes.txt   Shows lines that do NOT match."],
  },
  more: {
    es: ["MORE archivo          Muestra el contenido por páginas (simulado)."],
    en: ["MORE file             Shows content page by page (simulated)."],
  },
  set: {
    es: ["SET                    Lista las variables de entorno.", "SET var=valor          Define una variable.", "SET var=               Borra la variable.", "echo %var%             Usa su valor."],
    en: ["SET                    Lists environment variables.", "SET var=value          Defines a variable.", "SET var=               Deletes the variable.", "echo %var%             Uses its value."],
  },
  path: {
    es: ["PATH                   Muestra la ruta de búsqueda de programas.", "PATH C:\\Herramientas  Cambia la ruta de búsqueda."],
    en: ["PATH                   Shows the program search path.", "PATH C:\\Tools         Changes the search path."],
  },
  doskey: {
    es: ["DOSKEY /HISTORY       Muestra los comandos usados en esta sesión."],
    en: ["DOSKEY /HISTORY       Shows the commands used in this session."],
  },
  robocopy: {
    es: ["ROBOCOPY origen destino [/S]   Copia carpetas completas con resumen."],
    en: ["ROBOCOPY source dest [/S]   Copies complete folders with a summary."],
  },
  fc: {
    es: ["FC archivo1 archivo2  Compara dos archivos línea a línea."],
    en: ["FC file1 file2        Compares two files line by line."],
  },
  attrib: {
    es: ["ATTRIB                Muestra los atributos de los archivos del directorio."],
    en: ["ATTRIB                Shows file attributes in the current folder."],
  },
  msg: {
    es: ["MSG n texto           Envía un mensaje a la terminal número n.", "  msg 1 Hola, ¿cómo vas?   La otra pestaña recibe el aviso."],
    en: ["MSG n text            Sends a message to terminal number n.", "  msg 1 Hi, how is it going?  The other tab gets the notice."],
  },
  taskkill: {
    es: ["TASKKILL /IM proceso.exe [/F]   Cierra un proceso por su nombre."],
    en: ["TASKKILL /IM process.exe [/F]   Ends a process by name."],
  },
  start: {
    es: ["START notepad | calc | cmd | powershell", "  start cmd           Abre otra terminal CMD en una pestaña nueva.", "  start powershell    Abre PowerShell en una pestaña nueva."],
    en: ["START notepad | calc | cmd | powershell", "  start cmd           Opens another CMD terminal in a new tab.", "  start powershell    Opens PowerShell in a new tab."],
  },
  ipconfig: {
    es: ["IPCONFIG [/ALL]       Muestra la configuración de red. /all añade MAC y DHCP."],
    en: ["IPCONFIG [/ALL]       Shows the network configuration. /all adds MAC and DHCP."],
  },
  ping: {
    es: ["PING host [-n veces]  Comprueba si un equipo responde.", "  ping miguelacm.es     4 respuestas.", "  ping -n 2 localhost   2 respuestas."],
    en: ["PING host [-n times]  Checks whether a host responds.", "  ping miguelacm.es     4 replies.", "  ping -n 2 localhost   2 replies."],
  },
  nslookup: {
    es: ["NSLOOKUP host         Traduce un nombre a dirección IP."],
    en: ["NSLOOKUP host         Resolves a name to an IP address."],
  },
  tracert: {
    es: ["TRACERT host          Muestra los saltos hasta el destino."],
    en: ["TRACERT host          Shows the hops to the destination."],
  },
  netstat: {
    es: ["NETSTAT [-A] [-N]     Muestra las conexiones de red activas."],
    en: ["NETSTAT [-A] [-N]     Shows active network connections."],
  },
  getmac: {
    es: ["GETMAC                Muestra la dirección física (MAC) de la tarjeta de red."],
    en: ["GETMAC                Shows the network card physical (MAC) address."],
  },
  arp: {
    es: ["ARP -A                Muestra la tabla de direcciones IP y MAC de la red local."],
    en: ["ARP -A                Shows the local network IP and MAC address table."],
  },
  sc: {
    es: ["SC QUERY [servicio]   Estado de los servicios de Windows."],
    en: ["SC QUERY [service]    Status of Windows services."],
  },
  reg: {
    es: ["REG QUERY ruta        Lee valores del registro de Windows (simulado).", "  reg query HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion"],
    en: ["REG QUERY path        Reads Windows registry values (simulated).", "  reg query HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion"],
  },
  driverquery: {
    es: ["DRIVERQUERY           Lista los controladores instalados."],
    en: ["DRIVERQUERY           Lists installed drivers."],
  },
  chkdsk: {
    es: ["CHKDSK                Comprueba el disco y muestra el espacio usado (simulado)."],
    en: ["CHKDSK                Checks the disk and shows space usage (simulated)."],
  },
  vol: {
    es: ["VOL                   Muestra la etiqueta y el número de serie del volumen."],
    en: ["VOL                   Shows the volume label and serial number."],
  },
  net: {
    es: ["NET USER              Lista las cuentas de usuario del equipo."],
    en: ["NET USER              Lists the computer user accounts."],
  },
  where: {
    es: ["WHERE programa        Busca un programa en las carpetas del sistema.", "  where cmd             Encuentra C:\\Windows\\System32\\cmd.exe"],
    en: ["WHERE program         Finds a program in the system folders.", "  where cmd             Finds C:\\Windows\\System32\\cmd.exe"],
  },
  pause: {
    es: ["PAUSE                 Detiene el proceso hasta pulsar una tecla (simulado)."],
    en: ["PAUSE                 Stops until a key is pressed (simulated)."],
  },
  title: {
    es: ["TITLE texto           Cambia el título de la ventana de la terminal."],
    en: ["TITLE text            Changes the terminal window title."],
  },
  systeminfo: {
    es: ["SYSTEMINFO            Muestra información del sistema y del hardware."],
    en: ["SYSTEMINFO            Shows system and hardware information."],
  },
  tasklist: {
    es: ["TASKLIST              Lista los procesos en ejecución."],
    en: ["TASKLIST              Lists running processes."],
  },
  ver: {
    es: ["VER                   Muestra la versión de Windows."],
    en: ["VER                   Shows the Windows version."],
  },
  "get-childitem": {
    es: ["GET-CHILDITEM [ruta]  Equivalente PowerShell de dir.", "  Get-ChildItem -Recurse   Incluye subdirectorios."],
    en: ["GET-CHILDITEM [path]  PowerShell equivalent of dir.", "  Get-ChildItem -Recurse   Includes subdirectories."],
  },
  "get-content": {
    es: ["GET-CONTENT archivo   Equivalente PowerShell de type."],
    en: ["GET-CONTENT file      PowerShell equivalent of type."],
  },
  "get-process": {
    es: ["GET-PROCESS           Equivalente PowerShell de tasklist."],
    en: ["GET-PROCESS           PowerShell equivalent of tasklist."],
  },
  "select-string": {
    es: ["SELECT-STRING patrón archivo   Busca texto (no distingue mayúsculas).", "  Select-String error app.log"],
    en: ["SELECT-STRING pattern file   Searches text (case-insensitive).", "  Select-String error app.log"],
  },
  "set-location": {
    es: ["SET-LOCATION ruta     Equivalente PowerShell de cd."],
    en: ["SET-LOCATION path     PowerShell equivalent of cd."],
  },
  "get-date": {
    es: ["GET-DATE              Muestra la fecha y la hora actuales."],
    en: ["GET-DATE              Shows the current date and time."],
  },
};

function helpListing(isEs: boolean): string[] {
  return isEs
    ? [
        "",
        "Comandos disponibles (escribe help comando para ver el detalle):",
        "",
        "  NAVEGAR      cd, dir (ls), tree, pwd, Get-Location",
        "  CARPETAS     md (mkdir), rd (rmdir), xcopy, robocopy",
        "  ARCHIVOS     type (cat), echo, copy, move, ren, del, more, fc, attrib",
        "  BUSCAR       findstr, Select-String",
        "  ENTORNO      set, path, doskey /history",
        "  SISTEMA      systeminfo, tasklist, taskkill, ver, date, time, vol, chkdsk, net user, title, pause, cls, exit",
        "  RED          ipconfig, ping, nslookup, tracert, netstat, getmac, arp, sc, reg, driverquery",
        "  POWERSHELL   Get-ChildItem (gci), Get-Content (gc), Get-Process, Select-String, Set-Location, Get-Date",
        "  SESIÓN       start cmd | powershell, msg n texto, exit",
        "",
      ]
    : [
        "",
        "Available commands (type help command for details):",
        "",
        "  NAVIGATE     cd, dir (ls), tree, pwd, Get-Location",
        "  FOLDERS      md (mkdir), rd (rmdir), xcopy, robocopy",
        "  FILES        type (cat), echo, copy, move, ren, del, more, fc, attrib",
        "  SEARCH       findstr, Select-String",
        "  ENVIRONMENT  set, path, doskey /history",
        "  SYSTEM       systeminfo, tasklist, taskkill, ver, date, time, vol, chkdsk, net user, title, pause, cls, exit",
        "  NETWORK      ipconfig, ping, nslookup, tracert, netstat, getmac, arp, sc, reg, driverquery",
        "  POWERSHELL   Get-ChildItem (gci), Get-Content (gc), Get-Process, Select-String, Set-Location, Get-Date",
        "  SESSION      start cmd | powershell, msg n text, exit",
        "",
      ];
}

function pingLines(host: string, ip: string, local: boolean, count: number, isEs: boolean): string[] {
  const seed = host.toLowerCase().split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = local ? 0 : 20 + (seed % 8);
  const times: number[] = [];
  for (let i = 0; i < count; i++) times.push(local ? 0 : base + (i % 3));
  const ms = (t: number) => (t === 0 ? "<1ms" : `${t}ms`);
  const header = isIpv4(host)
    ? (isEs ? `Haciendo ping a ${host} con 32 bytes de datos:` : `Pinging ${host} with 32 bytes of data:`)
    : (isEs ? `Haciendo ping a ${host} [${ip}] con 32 bytes de datos:` : `Pinging ${host} [${ip}] with 32 bytes of data:`);
  const replies = times.map((t) => isEs
    ? `Respuesta desde ${ip}: bytes=32 tiempo=${ms(t)} TTL=${local ? 128 : 57}`
    : `Reply from ${ip}: bytes=32 time=${ms(t)} TTL=${local ? 128 : 57}`);
  const stats = isEs
    ? [
        "",
        `Estadísticas de ping para ${ip}:`,
        `    Paquetes: enviados = ${count}, recibidos = ${count}, perdidos = 0 (0% perdidos),`,
        "Tiempo aproximado de ida y vuelta en milisegundos:",
        `    Mínimo = ${Math.min(...times)}ms, Máximo = ${Math.max(...times)}ms, Media = ${Math.round(times.reduce((a, b) => a + b, 0) / count)}ms`,
      ]
    : [
        "",
        `Ping statistics for ${ip}:`,
        `    Packets: Sent = ${count}, Received = ${count}, Lost = 0 (0% loss),`,
        "Approximate round trip times in milli-seconds:",
        `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((a, b) => a + b, 0) / count)}ms`,
      ];
  return [header, ...replies, ...stats];
}

export function executeLine(state: FsState, cwd: string[], rawLine: string, opts: CmdOptions): CmdResult {  const isEs = opts.isEs;
  const env: Record<string, string> = { ...DEFAULT_ENV, ...(opts.env ?? {}) };
  const readEnv: Record<string, string> = { ...env, CD: pathToString(cwd) };

  if (opts.pending?.source) {
    const outcome = runBatch(state, cwd, opts.pending.source, { ...opts, pending: undefined }, executeLine, {
      variable: opts.pending.variable,
      line: opts.pending.line,
      value: rawLine,
    });
    return {
      lines: outcome.lines,
      state: outcome.state,
      cwd: outcome.cwd,
      clear: false,
      exit: false,
      error: outcome.error,
      env: outcome.env,
      pending: outcome.pending ?? undefined,
    };
  }

  if (rawLine.trim().length === 0) return ok(state, cwd, []);

  const lower0 = rawLine.trim().toLowerCase();
  const firstWord = tokenize(lower0)[0] ?? "";
  const batchCandidate = firstWord === "call" ? (tokenize(lower0)[1] ?? "") : firstWord;
  if (batchCandidate.endsWith(".bat") || batchCandidate.endsWith(".cmd")) {
    const node = getNode(state, resolvePath(cwd, batchCandidate).value);
    if (!node || node.kind !== "file") {
      return { lines: [isEs ? `No se encuentra el archivo por lotes '${batchCandidate}'.` : `Batch file '${batchCandidate}' not found.`], state, cwd, clear: false, exit: false, error: true };
    }
    const scriptArgs = firstWord === "call" ? tokenize(rawLine.trim()).slice(2) : tokenize(rawLine.trim()).slice(1);
    const outcome = runBatch(state, cwd, node.content ?? "", { ...opts, env }, executeLine, undefined, scriptArgs);
    if (outcome.pending) {
      return { lines: outcome.lines, state: outcome.state, cwd: outcome.cwd, clear: false, exit: false, env: outcome.env, pending: outcome.pending };
    }
    return { lines: outcome.lines, state: outcome.state, cwd: outcome.cwd, clear: false, exit: outcome.exited, error: outcome.error, env: outcome.env };
  }

  const redirect = redirectAtEnd(rawLine.trim());
  if (redirect) {
    if (redirect.command.length === 0) {
      const target = resolvePath(cwd, redirect.file);
      const res = writeFile(state, target.value, "", false);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(res.value, cwd, []);
    }
    const inner = executeLine(state, cwd, redirect.command, opts);
    if (inner.clear || inner.exit || inner.openTab || inner.sendTo) return { ...inner, lines: [] };
    const content = inner.lines.join("\r\n") + (inner.lines.length > 0 ? "\r\n" : "");
    const target = resolvePath(cwd, redirect.file);
    const res = writeFile(inner.state, target.value, content, redirect.append);
    if (!res.ok) return err(inner.state, cwd, [], isEs, res.error);
    return { ...inner, state: res.value, lines: [] };
  }

  const line = expandEnv(rawLine, readEnv);
  const pipeParts = splitWinPipe(line);
  if (pipeParts.length >= 2) {
    const firstRes = executeLine(state, cwd, pipeParts[0], opts);
    if (firstRes.error) return firstRes;
    let stdinLines = firstRes.lines;
    let st = firstRes.state;
    for (const seg of pipeParts.slice(1)) {
      const segTokens = tokenize(seg);
      const filtered = applyWinFilter(st, cwd, segTokens, stdinLines, isEs);
      if (filtered.error) return { lines: [filtered.error], state, cwd, clear: false, exit: false, error: true };
      stdinLines = filtered.lines;
      if (filtered.state) st = filtered.state;
    }
    return { ...firstRes, lines: stdinLines, state: st, env };
  }
  const tokens = tokenize(line);
  if (tokens.length === 0) return ok(state, cwd, []);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  const withEnv = (res: CmdResult): CmdResult => ({ ...res, env });

  if (cmd.startsWith("$env:")) {
    const expr = line.trim().slice(5);
    const eq = expr.indexOf("=");
    if (eq >= 0) {
      const name = expr.slice(0, eq).trim();
      const value = expr.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
      if (name.length > 0) env[name] = value;
      return withEnv(ok(state, cwd, []));
    }
    const name = expr.trim();
    const key = Object.keys(readEnv).find((k) => k.toLowerCase() === name.toLowerCase());
    return ok(state, cwd, [key ? readEnv[key] : ""]);
  }

  switch (cmd) {
    case "help":
    case "?": {
      if (args.length === 0) return ok(state, cwd, helpListing(isEs));
      const key = args[0].toLowerCase();
      const detail = HELP_DETAILS[key];
      if (detail) return ok(state, cwd, ["", ...(isEs ? detail.es : detail.en), ""]);
      return ok(state, cwd, [isEs ? `No hay ayuda detallada para '${args[0]}'. Escribe help para ver todos los comandos.` : `No detailed help for '${args[0]}'. Type help to list all commands.`]);
    }

    case "cls":
      return ok(state, cwd, [], true);

    case "exit":
      return ok(state, cwd, [isEs ? "Gracias por practicar. Cerrando la terminal..." : "Thanks for practicing. Closing the terminal..."], false, true);

    case "cd":
    case "chdir": {
      const cdArgs = args[0]?.toLowerCase() === "/d" ? args.slice(1) : args;
      if (cdArgs.length === 0) return ok(state, cwd, [pathToString(cwd)]);
      const target = resolvePath(cwd, cdArgs.join(" "));
      if (!target.ok) return err(state, cwd, [], isEs, "invalidPath");
      const node = getNode(state, target.value);
      if (!node) return err(state, cwd, [], isEs, "notFound");
      if (node.kind !== "dir") return err(state, cwd, [], isEs, "notADir");
      return { lines: [], state, cwd: target.value, clear: false, exit: false };
    }

    case "pwd":
      return ok(state, cwd, [pathToString(cwd)]);

    case "dir":
    case "ls": {
      const { flags, rest } = splitFlags(args);
      const wide = flags.has("w");
      const recursive = flags.has("s");
      const target = rest[0] ? resolvePath(cwd, rest[0]).value : cwd;
      const node = getNode(state, target);
      if (!node) return err(state, cwd, [], isEs, "notFound");
      if (node.kind === "file") {
        const parent = target.slice(0, -1);
        const size = pad(thousands((node.content ?? "").length, isEs), 16);
        return ok(state, cwd, [
          "",
          ...volumeHeader(isEs),
          dirHeader(parent, isEs),
          "",
          `${size} ${node.name}`,
          "",
          `${pad(1, 15)} ${isEs ? "archivos" : "files"}`,
          `${pad(2, 15)} ${isEs ? "directorios" : "directories"}`,
          "",
        ]);
      }
      if (recursive) {
        const lines: string[] = ["", ...volumeHeader(isEs)];
        let dirs = 0;
        let files = 0;
        const walk = (path: string[]) => {
          dirs++;
          const entriesRes = listDir(state, path);
          const entries = entriesRes.ok ? entriesRes.value : [];
          lines.push(dirHeader(path, isEs), "");
          for (const e of entries) {
            const n = getNode(state, [...path, e.name]);
            if (e.kind === "file") {
              files++;
              lines.push(`${pad(thousands((n?.content ?? "").length, isEs), 16)} ${e.name}`);
            } else {
              lines.push(`${pad("<DIR>", 16)} ${e.name}`);
            }
          }
          lines.push("");
          for (const e of entries) if (e.kind === "dir") walk([...path, e.name]);
        };
        walk(target);
        lines.push(`${pad(files, 15)} ${isEs ? "archivos" : "files"}`, `${pad(dirs + 2, 15)} ${isEs ? "directorios" : "directories"}`, "");
        return ok(state, cwd, lines);
      }
      const entriesRes = listDir(state, target);
      const entries = entriesRes.ok ? entriesRes.value : [];
      if (wide) {
        const cols: string[] = [];
        for (const e of entries) cols.push(e.kind === "dir" ? `[${e.name}]` : e.name);
        const rows: string[] = [];
        for (let i = 0; i < cols.length; i += 4) {
          rows.push(cols.slice(i, i + 4).map((c) => pad(c, 22)).join(""));
        }
        return ok(state, cwd, [
          "",
          ...volumeHeader(isEs),
          dirHeader(target, isEs),
          "",
          ...(rows.length > 0 ? rows : [isEs ? "  [Sin archivos]" : "  [No files]"]),
          "",
        ]);
      }
      const lines = [
        "",
        ...volumeHeader(isEs),
        dirHeader(target, isEs),
        "",
        ...entries.map((e) => {
          const n = getNode(state, [...target, e.name]);
          const size = e.kind === "file" ? pad(thousands((n?.content ?? "").length, isEs), 16) : "<DIR>";
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
      const names = args.filter((a) => !a.startsWith("/"));
      if (names.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      let st = state;
      for (const name of names) {
        const target = resolvePath(cwd, name);
        if (getNode(st, target.value)) return err(st, cwd, [], isEs, "duplicate");
        for (let i = 1; i <= target.value.length; i++) {
          const sub = target.value.slice(0, i);
          const existing = getNode(st, sub);
          if (existing) {
            if (existing.kind !== "dir") return err(st, cwd, [], isEs, "notADir");
            continue;
          }
          const res = mkdir(st, sub);
          if (!res.ok) return err(st, cwd, [], isEs, res.error);
          st = res.value;
        }
      }
      return ok(st, cwd, []);
    }

    case "rd":
    case "rmdir": {
      const { flags, rest } = splitFlags(args);
      const name = rest[0];
      if (!name) return err(state, cwd, [], isEs, "invalidPath");
      const target = resolvePath(cwd, name);
      const res = deletePath(state, target.value, flags.has("s"));
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(res.value, cwd, []);
    }

    case "del":
    case "erase": {
      const { rest } = splitFlags(args);
      if (rest.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      let st = state;
      for (const raw of rest) {
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
      const files = args.filter((a) => !a.startsWith("/"));
      if (files.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      const out: string[] = [];
      for (const file of files) {
        const res = readFile(state, resolvePath(cwd, file).value);
        if (!res.ok) return err(state, cwd, [], isEs, res.error);
        out.push(...contentLines(res.value));
      }
      return ok(state, cwd, out);
    }

    case "echo": {
      if (args.length === 0) return ok(state, cwd, [isEs ? "ECHO está activado." : "ECHO is on."]);
      return ok(state, cwd, [args.join(" ")]);
    }

    case "copy": {
      if (args.length < 2) return err(state, cwd, [], isEs, "invalidPath");
      const src = resolvePath(cwd, args[0]);
      const dst = resolvePath(cwd, args[1]);
      const srcNode = getNode(state, src.value);
      if (!srcNode) return err(state, cwd, [], isEs, "notFound");
      if (srcNode.kind === "dir") return err(state, cwd, [], isEs, "copyDir");
      const res = copyPath(state, src.value, dst.value);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      return ok(res.value, cwd, [isEs ? "        1 archivo(s) copiado(s)." : "        1 file(s) copied."]);
    }

    case "xcopy": {
      const { rest } = splitFlags(args);
      if (rest.length < 2) return err(state, cwd, [], isEs, "invalidPath");
      const src = resolvePath(cwd, rest[0]);
      const dst = resolvePath(cwd, rest[1]);
      const srcNode = getNode(state, src.value);
      if (!srcNode) return err(state, cwd, [], isEs, "notFound");
      if (srcNode.kind === "file") {
        const resFile = copyPath(state, src.value, dst.value);
        if (!resFile.ok) return err(state, cwd, [], isEs, resFile.error);
        return ok(resFile.value, cwd, [isEs ? "        1 archivo(s) copiado(s)." : "        1 file(s) copied."]);
      }
      let st = state;
      const dstNode = getNode(st, dst.value);
      if (dstNode && dstNode.kind !== "dir") return err(st, cwd, [], isEs, "notADir");
      if (!dstNode) {
        const mk = mkdir(st, dst.value);
        if (!mk.ok) return err(st, cwd, [], isEs, mk.error);
        st = mk.value;
      }
      for (const child of Object.values(srcNode.children ?? {})) {
        const resChild = copyPath(st, [...src.value, child.name], [...dst.value, child.name]);
        if (resChild.ok) st = resChild.value;
      }
      const total = countTree(srcNode).files;
      return ok(st, cwd, [isEs ? `        ${total} archivo(s) copiado(s).` : `        ${total} file(s) copied.`]);
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

    case "fc": {
      const { rest } = splitFlags(args);
      if (rest.length < 2) return { lines: [isEs ? "Uso: FC archivo1 archivo2" : "Usage: FC file1 file2"], state, cwd, clear: false, exit: false, error: true };
      const aPath = resolvePath(cwd, rest[0]);
      const bPath = resolvePath(cwd, rest[1]);
      const a = readFile(state, aPath.value);
      const b = readFile(state, bPath.value);
      if (!a.ok || !b.ok) return err(state, cwd, [], isEs, "notFound");
      const la = contentLines(a.value);
      const lb = contentLines(b.value);
      const out: string[] = [isEs ? `Comparando los archivos ${pathToString(aPath.value)} y ${pathToString(bPath.value)}` : `Comparing files ${pathToString(aPath.value)} and ${pathToString(bPath.value)}`];
      const max = Math.max(la.length, lb.length);
      let diffs = 0;
      for (let i = 0; i < max; i++) {
        if ((la[i] ?? "") !== (lb[i] ?? "")) {
          diffs++;
          if (diffs <= 6) {
            out.push(`***** ${pathToString(aPath.value)}`, la[i] ?? "", `***** ${pathToString(bPath.value)}`, lb[i] ?? "", "*****");
          }
        }
      }
      if (diffs === 0) out.push(isEs ? "FC: no se encontraron diferencias" : "FC: no differences encountered");
      else if (diffs > 6) out.push(isEs ? `FC: ${diffs} líneas diferentes (se muestran las 6 primeras)` : `FC: ${diffs} different lines (first 6 shown)`);
      return ok(state, cwd, out);
    }

    case "attrib": {
      const entriesRes = listDir(state, cwd);
      const entries = entriesRes.ok ? entriesRes.value : [];
      const files = entries.filter((e) => e.kind === "file");
      if (files.length === 0) return ok(state, cwd, []);
      return ok(state, cwd, files.map((f) => `A          ${pathToString([...cwd, f.name])}`));
    }

    case "tree": {
      const { flags, rest } = splitFlags(args);
      const showFiles = flags.has("f");
      const ascii = flags.has("a");
      const target = rest[0] ? resolvePath(cwd, rest[0]).value : cwd;
      const node = getNode(state, target);
      if (!node) return err(state, cwd, [], isEs, "notFound");
      if (node.kind !== "dir") return err(state, cwd, [], isEs, "notADir");
      const counts = countTree(node);
      const summary = showFiles
        ? (isEs ? `${counts.dirs} carpetas, ${counts.files} archivos` : `${counts.dirs} folders, ${counts.files} files`)
        : (isEs ? `${counts.dirs} carpetas` : `${counts.dirs} folders`);
      return ok(state, cwd, [pathToString(target), ...treeLines(node, "", showFiles, ascii), "", summary]);
    }

    case "whoami":
      return ok(state, cwd, [FAKES.whoami]);

    case "hostname":
      return ok(state, cwd, [FAKES.hostname]);

    case "ipconfig":
      return ok(state, cwd, splitFlags(args).flags.has("all") ? (isEs ? FAKES.ipconfigAll : FAKES.ipconfigAllEn) : FAKES.ipconfig);

    case "systeminfo":
      return ok(state, cwd, isEs ? FAKES.systeminfo : FAKES.systeminfoEn);

    case "tasklist":
      return ok(state, cwd, isEs ? FAKES.tasklist : FAKES.tasklistEn);

    case "get-process":
    case "gps":
      return ok(state, cwd, isEs ? FAKES.tasklist : FAKES.tasklistEn);

    case "ping": {
      let count = 4;
      let host: string | undefined;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-n" && args[i + 1]) {
          const n = Number(args[i + 1]);
          if (Number.isFinite(n)) count = Math.min(10, Math.max(1, Math.floor(n)));
          i++;
        } else if (!a.startsWith("-") && !host) {
          host = a;
        }
      }
      if (!host) return err(state, cwd, [], isEs, "invalidPath");
      const target = resolveHost(host);
      if (!target) {
        return {
          lines: [isEs
            ? `La solicitud de ping no pudo encontrar el host ${host}. Compruebe el nombre y vuelva a intentarlo.`
            : `Ping request could not find host ${host}. Please check the name and try again.`],
          state, cwd, clear: false, exit: false, error: true,
        };
      }
      return ok(state, cwd, pingLines(host, target.ip, target.local, count, isEs));
    }

    case "date":
      return ok(state, cwd, [isEs
        ? `La fecha actual es: ${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
        : `The current date is: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`]);

    case "time":
      return ok(state, cwd, [isEs
        ? `La hora actual es: ${new Date().toLocaleTimeString("es-ES")}`
        : `The current time is: ${new Date().toLocaleTimeString("en-US")}`]);

    case "get-date":
      return ok(state, cwd, [new Date().toLocaleString(isEs ? "es-ES" : "en-US")]);

    case "ver":
      return ok(state, cwd, [isEs ? "Microsoft Windows [Simulado para práctica] Versión 10.0.19045.5011" : "Microsoft Windows [Simulated for practice] Version 10.0.19045.5011"]);

    case "vol":
      return ok(state, cwd, ["", ...volumeHeader(isEs), ""]);

    case "chkdsk":
      return ok(state, cwd, isEs
        ? [
            "",
            "El tipo del sistema de archivos es NTFS.",
            "",
            "Advertencia: no se especificó el parámetro F.",
            "Comprobando archivos (etapa 1 de 3)...",
            "  Procesamiento de 1248 registros de archivo completado.",
            "Comprobando índices (etapa 2 de 3)...",
            "Comprobando descriptores de seguridad (etapa 3 de 3)...",
            "",
            "  196608 KB en espacio total en disco.",
            "   98304 KB en 3 archivos.",
            "   98204 KB disponibles en disco.",
            "",
            "Windows ha comprobado el sistema de archivos y no encontró problemas.",
            "",
          ]
        : [
            "",
            "The type of the file system is NTFS.",
            "",
            "WARNING: F parameter not specified.",
            "Checking file system (stage 1 of 3)...",
            "  Processed 1248 file records.",
            "Checking indexes (stage 2 of 3)...",
            "Checking security descriptors (stage 3 of 3)...",
            "",
            "  196608 KB total disk space.",
            "   98304 KB in 3 files.",
            "   98204 KB available on disk.",
            "",
            "Windows has checked the file system and found no problems.",
            "",
          ]);

    case "pause":
      return ok(state, cwd, [isEs ? "Presione una tecla para continuar . . ." : "Press any key to continue . . ."]);

    case "title":
      return { lines: [], state, cwd, clear: false, exit: false, title: args.join(" ") };

    case "reg": {
      const op = args[0]?.toLowerCase();
      const key = args[1];
      if (!op || !key) {
        return { lines: [isEs ? "Uso: REG ADD clave /v nombre /d valor | REG QUERY clave | REG DELETE clave [/v nombre]" : "Usage: REG ADD key /v name /d value | REG QUERY key | REG DELETE key [/v name]"], state, cwd, clear: false, exit: false, error: true };
      }
      const validRoot = /^h(k(cu|lm|cr|ku|cc)|ey_(classes_root|current_user|local_machine|users|current_config))\\?/i.test(key ?? "");
      if (!validRoot && op !== "query") {
        return ok(state, cwd, [isEs ? "Uso: REG ADD clave /v nombre /d valor | REG QUERY clave | REG DELETE clave [/v nombre]" : "Usage: REG ADD key /v name /d value | REG QUERY key | REG DELETE key [/v name]"]);
      }
      const flagValue = (flag: string): string => {
        const idx = args.findIndex((a) => a.toLowerCase() === flag);
        return idx >= 0 ? args[idx + 1] ?? "" : "";
      };
        const registry: Record<string, string> = { ...(state.reg ?? {}) };
        if (op === "add") {
        const valueName = flagValue("/v") || "(Valor predeterminado)";
        const data = flagValue("/d");
        if (!valueName) {
          return ok(state, cwd, [isEs ? "Uso: REG ADD clave /v nombre /d valor" : "Usage: REG ADD key /v name /d value"]);
        }
        registry[`${key}\\${valueName}`] = data;
        const next = cloneState(state);
        next.reg = registry;
        return ok(next, cwd, [isEs ? "La operación se completó correctamente." : "The operation completed successfully."]);
      }
      if (op === "query") {
        const prefix = `${key.toLowerCase()}\\`;
        const rows: string[] = [];
        const subkeys = new Set<string>();
        const exact: string[] = [];
        for (const [full, value] of Object.entries(registry)) {
          if (!full.toLowerCase().startsWith(prefix) && full.toLowerCase() !== key.toLowerCase()) continue;
          const lastSep = full.lastIndexOf("\\");
          const parent = lastSep > 0 ? full.slice(0, lastSep) : full;
          if (parent.toLowerCase() === key.toLowerCase()) {
            const leaf = full.slice(lastSep + 1);
            exact.push(`    ${leaf}    REG_SZ    ${value}`);
          } else {
            subkeys.add(full);
          }
        }
        for (const sk of subkeys) rows.push(`    ${sk}`);
        rows.push(...exact);
        if (rows.length === 0 && /microsoft|windows/i.test(key)) {
          return ok(state, cwd, [
            "",
            key,
            "    ProgramFilesDir    REG_SZ    C:\\Program Files",
            "    ProductName        REG_SZ    Windows 10 Pro",
            "    CurrentBuild       REG_SZ    19045",
            "",
          ]);
        }
        if (rows.length === 0) {
          return { lines: [isEs ? `ERROR: El sistema no encuentra la clave del Registro especificada.` : `ERROR: The system was unable to find the specified registry key.`], state, cwd, clear: false, exit: false, error: true };
        }
        return ok(state, cwd, ["", key, "", ...rows, ""]);
      }
      if (op === "delete") {
        const valueName = flagValue("/v");
        const prefix = valueName ? `${key.toLowerCase()}\\${valueName.toLowerCase()}` : `${key.toLowerCase()}`;
        let found = false;
        const registryDel: Record<string, string> = {};
        for (const [full, value] of Object.entries(state.reg ?? {})) {
          const target = valueName ? full.toLowerCase() === prefix : full.toLowerCase().startsWith(prefix);
          if (target) {
            found = true;
            continue;
          }
          registryDel[full] = value;
        }
        if (!found) {
          return { lines: [isEs ? "ERROR: El sistema no encuentra la clave o el valor especificados." : "ERROR: The system was unable to find the specified key or value."], state, cwd, clear: false, exit: false, error: true };
        }
        const next = cloneState(state);
        next.reg = registryDel;
        return ok(next, cwd, [isEs ? "La operación se completó correctamente." : "The operation completed successfully."]);
      }
      return ok(state, cwd, [isEs ? "Operaciones de REG disponibles: ADD, QUERY, DELETE." : "Available REG operations: ADD, QUERY, DELETE."]);
    }

    case "net": {
      if (args[0]?.toLowerCase() !== "user") {
        return { lines: [isEs ? "Uso: NET USER para listar los usuarios del equipo." : "Usage: NET USER to list the computer accounts."], state, cwd, clear: false, exit: false, error: true };
      }
      return ok(state, cwd, isEs
        ? [
            "",
            "Cuentas de usuario para \\\\PC-ESTUDIANTE",
            "",
            "-------------------------------------------------------------------------------",
            "Administrador            Estudiante               Invitado",
            "El comando se ha completado correctamente.",
            "",
          ]
        : [
            "",
            `User accounts for \\\\PC-ESTUDIANTE`,
            "",
            "-------------------------------------------------------------------------------",
            "Administrator            Estudiante               Guest",
            "The command completed successfully.",
            "",
          ]);
    }

    case "getmac":
      return ok(state, cwd, isEs
        ? [
            "",
            "Conexión de red              Dirección física      Transporte",
            "=========================== =================== ===================================",
            "Ethernet                    00-1A-2B-3C-4D-5E   \\Device\\Tcpip_{9B7F2A10-DE45-4A5F}",
            "",
          ]
        : [
            "",
            "Connection Name          Network Adapter      Physical Address",
            "======================= =================== ===================================",
            "Ethernet                 Intel(R) 82574L      00-1A-2B-3C-4D-5E",
            "",
          ]);

    case "arp": {
      return ok(state, cwd, isEs
        ? [
            "",
            "Interfaz: 192.168.1.42 --- 0x5",
            "  Dirección de Internet          Dirección física      Tipo",
            "  192.168.1.1           00-1a-2b-3c-4d-01     dinámico",
            "  192.168.1.42          00-1a-2b-3c-4d-5e     dinámico",
            "  192.168.1.255         ff-ff-ff-ff-ff-ff     estático",
            "  224.0.0.22            01-00-5e-00-00-16     estático",
            "  239.255.255.250       01-00-5e-7f-ff-fa     estático",
            "",
          ]
        : [
            "",
            "Interface: 192.168.1.42 --- 0x5",
            "  Internet Address      Physical Address      Type",
            "  192.168.1.1           00-1a-2b-3c-4d-01     dynamic",
            "  192.168.1.42          00-1a-2b-3c-4d-5e     dynamic",
            "  192.168.1.255         ff-ff-ff-ff-ff-ff     static",
            "  224.0.0.22            01-00-5e-00-00-16     static",
            "  239.255.255.250       01-00-5e-7f-ff-fa     static",
            "",
          ]);
    }

    case "sc": {
      const service = args.find((a) => !a.startsWith("/") && a.toLowerCase() !== "query");
      const name = service ?? "Spooler";
      return ok(state, cwd, isEs
        ? [
            "",
            `NOMBRE_SERVICIO: ${name}`,
            "        TIPO               : 110  WIN32_OWN_PROCESS",
            "        ESTADO             : 4  RUNNING",
            "                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)",
            "        CÓDIGO_SALIDA_WIN32 : 0  (0x0)",
            "        CÓDIGO_SALIDA_SERVICIO : 0  (0x0)",
            "        PUNTO_COMPROBACIÓN : 0x0",
            "        SUGERENCIA_ESPERA  : 0x0",
            "",
          ]
        : [
            "",
            `SERVICE_NAME: ${name}`,
            "        TYPE               : 110  WIN32_OWN_PROCESS",
            "        STATE              : 4  RUNNING",
            "                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)",
            "        WIN32_EXIT_CODE    : 0  (0x0)",
            "        SERVICE_EXIT_CODE  : 0  (0x0)",
            "        CHECKPOINT         : 0x0",
            "        WAIT_HINT          : 0x0",
            "",
          ]);
    }

    case "reg": {
      const path = args.find((a) => !a.toLowerCase().startsWith("query") && !a.startsWith("/"));
      if (!path) {
        return { lines: [isEs ? "Uso: REG QUERY HKLM\\SOFTWARE\\..." : "Usage: REG QUERY HKLM\\SOFTWARE\\..."], state, cwd, clear: false, exit: false, error: true };
      }
      return ok(state, cwd, [
        "",
        path,
        "    ProgramFilesDir    REG_SZ    C:\\Program Files",
        "    ProductName        REG_SZ    Windows 10 Pro",
        "    CurrentBuild       REG_SZ    19045",
        "",
      ]);
    }

    case "driverquery":
      return ok(state, cwd, isEs
        ? [
            "",
            "Nombre del módulo  Nombre para mostrar           Tipo de controlador  Fecha de vínculo",
            "================== ============================ ==================== ===============",
            "ACPI               Controlador ACPI de Micro...  Kernel               11/09/2026",
            "Disk               Controlador de disco          Kernel               11/09/2026",
            "Tcpip              Controlador de TCP/IP         Kernel               11/09/2026",
            "usbhub             Concentrador USB genérico     Kernel               11/09/2026",
            "",
          ]
        : [
            "",
            "Module Name        Display Name                 Driver Type   Link Date",
            "================== ============================ ============= ===============",
            "ACPI               Microsoft ACPI Driver        Kernel        09/11/2026",
            "Disk               Disk Driver                  Kernel        09/11/2026",
            "Tcpip              TCP/IP Driver                Kernel        09/11/2026",
            "usbhub             Generic USB Hub Driver       Kernel        09/11/2026",
            "",
          ]);

    case "where": {
      const pattern = args.find((a) => !a.startsWith("/"));
      if (!pattern) return { lines: [isEs ? "Uso: WHERE programa" : "Usage: WHERE program"], state, cwd, clear: false, exit: false, error: true };
      const system32 = ["Windows", "System32"];
      const node = getNode(state, system32);
      const children = Object.values(node?.children ?? {});
      const tries = pattern.includes(".") ? [pattern] : [pattern, `${pattern}.exe`];
      const matches = children.filter((c) => c.kind === "file" && tries.some((t) => matchWildcard(c.name, t)));
      if (matches.length === 0) {
        return { lines: [`INFO: ${isEs ? "No se pudo encontrar ningún archivo para el patrón especificado." : "Could not find files for the given pattern(s)."}`], state, cwd, clear: false, exit: false, error: true };
      }
      return ok(state, cwd, matches.map((m) => pathToString([...system32, m.name])));
    }

    case "start": {
      const app = args[0]?.toLowerCase() ?? "";
      if (app === "" || app === "cmd" || app === "cmd.exe")
        return { lines: [isEs ? "Abriendo una nueva terminal CMD en una pestaña..." : "Opening a new CMD terminal in a new tab..."], state, cwd, clear: false, exit: false, openTab: { mode: "cmd" } };
      if (app === "powershell" || app === "powershell.exe")
        return { lines: [isEs ? "Abriendo PowerShell en una nueva pestaña..." : "Opening PowerShell in a new tab..."], state, cwd, clear: false, exit: false, openTab: { mode: "ps" } };
      const known: Record<string, [string, string]> = {
        notepad: [isEs ? "El Bloc de notas (simulado) se abriría ahora." : "Notepad (simulated) would open now.", ""],
        calc: [isEs ? "La Calculadora (simulada) se abriría ahora." : "Calculator (simulated) would open now.", ""],
      };
      if (known[app]) return ok(state, cwd, [known[app][0]]);
      return ok(state, cwd, [isEs ? `No se puede encontrar '${args[0] ?? ""}'. Prueba: start notepad, start calc, start cmd o start powershell.` : `Cannot find '${args[0] ?? ""}'. Try start notepad, start calc, start cmd or start powershell.`]);
    }

    case "findstr": {
      const flags = new Set<string>();
      const files: string[] = [];
      for (const a of args) {
        if (a.startsWith("/") && a.length > 1) flags.add(a.slice(1).toLowerCase());
        else files.push(a);
      }
      const patternRaw = files.shift();
      if (!patternRaw || files.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      const pattern = patternRaw.replace(/^"(.*)"$/, "$1");
      const insensitive = flags.has("i");
      const invert = flags.has("v");
      const number = flags.has("n");
      const multi = files.length > 1;
      const outLines: string[] = [];
      for (const fileRaw of files) {
        const res = readFile(state, resolvePath(cwd, fileRaw).value);
        if (!res.ok) {
          return { lines: [`FINDSTR: ${isEs ? "No se puede abrir" : "Cannot open"} ${fileRaw}`], state, cwd, clear: false, exit: false, error: true };
        }
        const lines = contentLines(res.value);
        lines.forEach((l, i) => {
          const hay = insensitive ? l.toLowerCase() : l;
          const needle = insensitive ? pattern.toLowerCase() : pattern;
          const match = hay.includes(needle);
          if (invert ? !match : match) {
            const prefix = multi ? `${fileRaw}:` : "";
            const num = number ? `${i + 1}:` : "";
            outLines.push(`${prefix}${num}${l}`);
          }
        });
      }
      return ok(state, cwd, outLines);
    }

    case "select-string":
    case "sls": {
      const rest = args.filter((a) => !a.startsWith("-"));
      const file = rest.pop();
      if (!file || rest.length === 0) {
        return { lines: [isEs ? "Uso: Select-String patrón archivo" : "Usage: Select-String pattern file"], state, cwd, clear: false, exit: false, error: true };
      }
      const pattern = rest.join(" ").replace(/^"(.*)"$/, "$1").toLowerCase();
      const res = readFile(state, resolvePath(cwd, file).value);
      if (!res.ok) {
        return { lines: [`Select-String: ${isEs ? "no se encuentra el archivo" : "cannot find file"} ${file}`], state, cwd, clear: false, exit: false, error: true };
      }
      const out: string[] = [""];
      contentLines(res.value).forEach((l, i) => {
        if (l.toLowerCase().includes(pattern)) out.push(`${file}:${i + 1}:${l}`);
      });
      return ok(state, cwd, out);
    }

    case "more": {
      if (args.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      const res = readFile(state, resolvePath(cwd, args[0]).value);
      if (!res.ok) return err(state, cwd, [], isEs, res.error);
      const content = res.value.length > 0 ? res.value.split(/\r?\n/) : [""];
      if (content.length > 20) {
        content.push(isEs
          ? "-- Más -- (simulado: el contenido completo se muestra de una vez)"
          : "-- More -- (simulated: full content is shown at once)");
      }
      return ok(state, cwd, content);
    }

    case "set": {
      if (args.length === 0) {
        const names = Object.keys(env).sort();
        return ok(state, cwd, names.map((k) => `${k}=${env[k]}`));
      }
      const flagP = args.some((a) => /^\/p$/i.test(a));
      if (flagP) {
        const rest = args.filter((a) => !/^\/p$/i.test(a)).join(" ");
        const eqPos = rest.indexOf("=");
        if (eqPos <= 0) {
          return ok(state, cwd, [isEs ? "Uso: SET /P variable=pregunta" : "Usage: SET /P variable=prompt"]);
        }
        const name = rest.slice(0, eqPos).trim();
        const promptText = rest.slice(eqPos + 1).trim();
        return { lines: [], state, cwd, clear: false, exit: false, waitInput: { variable: name, prompt: promptText } };
      }
      const joined = args.join(" ");
      const eq = joined.indexOf("=");
      if (eq < 0) {
        const prefix = joined.trim().toLowerCase();
        const names = Object.keys(env).filter((k) => k.toLowerCase().startsWith(prefix)).sort();
        if (names.length === 0) {
          return ok(state, cwd, [isEs ? `La variable de entorno ${joined.trim()} no está definida.` : `Environment variable ${joined.trim()} not defined.`]);
        }
        return ok(state, cwd, names.map((k) => `${k}=${env[k]}`));
      }
      if (eq === 0) return ok(state, cwd, [isEs ? "Uso: SET variable=valor · SET para verlas · SET variable= para borrarla" : "Usage: SET var=value · SET to list · SET var= to delete"]);
      const name = joined.slice(0, eq).trim();
      const value = joined.slice(eq + 1).trim();
      const existingKey = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
      if (existingKey) {
        if (value.length === 0) delete env[existingKey];
        else env[existingKey] = value;
      } else if (value.length > 0) {
        env[name] = value;
      }
      return withEnv(ok(state, cwd, []));
    }

    case "path": {
      if (args.length === 0) return ok(state, cwd, [`PATH=${env.PATH ?? ""}`]);
      env.PATH = args.join(" ");
      return withEnv(ok(state, cwd, []));
    }

    case "doskey": {
      if (args[0]?.toLowerCase() === "/history" || args[0]?.toLowerCase() === "/h") {
        const hist = (opts.history ?? []).slice().reverse();
        return ok(state, cwd, hist.length > 0 ? hist : [isEs ? "Historial vacío." : "History is empty."]);
      }
      return ok(state, cwd, [isEs ? "Uso: doskey /history para ver el historial de esta sesión." : "Usage: doskey /history to see this session's history."]);
    }

    case "robocopy": {
      const rest = args.filter((a) => !a.startsWith("/"));
      if (rest.length < 2) return err(state, cwd, [], isEs, "invalidPath");
      const src = resolvePath(cwd, rest[0]);
      const srcNode = getNode(state, src.value);
      if (!srcNode) return err(state, cwd, [], isEs, "notFound");
      if (srcNode.kind !== "dir") return err(state, cwd, [], isEs, "notADir");
      let st = state;
      const dst = resolvePath(cwd, rest[1]);
      if (!getNode(st, dst.value)) {
        const mk = mkdir(st, dst.value);
        if (!mk.ok) return err(st, cwd, [], isEs, mk.error);
        st = mk.value;
      }
      const children = Object.values(srcNode.children ?? {});
      let copied = 0;
      for (const child of children) {
        const res = copyPath(st, [...src.value, child.name], [...dst.value, child.name]);
        if (res.ok) {
          st = res.value;
          copied++;
        }
      }
      const summary = isEs
        ? [
            "--------------------------------------------------------------------",
            `   Carpetas copiadas: 1 · Archivos copiados: ${copied}`,
            `   Origen: ${pathToString(src.value)} · Destino: ${pathToString(dst.value)}`,
            "   Código de retorno: 1 (se copiaron archivos)",
          ]
        : [
            "--------------------------------------------------------------------",
            `   Dirs copied: 1 · Files copied: ${copied}`,
            `   Source: ${pathToString(src.value)} · Dest: ${pathToString(dst.value)}`,
            "   Return code: 1 (files were copied)",
          ];
      return ok(st, cwd, summary);
    }

    case "msg": {
      const target = Number(args[0]);
      const message = args.slice(1).join(" ");
      if (!Number.isInteger(target) || target < 1 || message.length === 0) {
        return { lines: [isEs
          ? "Uso: MSG <número de terminal> <mensaje>. Ejemplo: msg 1 Hola desde la otra terminal"
          : "Usage: MSG <terminal number> <message>. Example: msg 1 Hello from the other terminal"], state, cwd, clear: false, exit: false, error: true };
      }
      return { lines: [isEs ? `Mensaje enviado a la terminal ${target}.` : `Message sent to terminal ${target}.`], state, cwd, clear: false, exit: false, sendTo: { target, message } };
    }

    case "taskkill": {
      const imIdx = args.findIndex((a) => a.toLowerCase() === "/im");
      const name = imIdx >= 0 ? args[imIdx + 1] : undefined;
      if (!name) {
        return { lines: [isEs ? "Uso: TASKKILL /IM <proceso.exe> [/F]" : "Usage: TASKKILL /IM <process.exe> [/F]"], state, cwd, clear: false, exit: false, error: true };
      }
      return ok(state, cwd, [isEs
        ? `CORRECTO: el proceso "${name}" con PID 2112 ha finalizado.`
        : `SUCCESS: the process "${name}" with PID 2112 has been terminated.`]);
    }

    case "nslookup": {
      if (args.length === 0) return err(state, cwd, [], isEs, "invalidPath");
      const host = args[0].toLowerCase();
      const target = resolveHost(host);
      if (!target) {
        return { lines: isEs
          ? ["", "Servidor:  router.miguelacm.local", "Address:  192.168.1.1", "", `*** router.miguelacm.local no puede encontrar ${host}: Non-existent domain`, ""]
          : ["", "Server:  router.miguelacm.local", "Address:  192.168.1.1", "", `*** router.miguelacm.local can't find ${host}: Non-existent domain`, ""],
          state, cwd, clear: false, exit: false, error: true };
      }
      return ok(state, cwd, isEs
        ? [
            "",
            "Servidor:  router.miguelacm.local",
            "Address:  192.168.1.1",
            "",
            "Respuesta no autoritativa:",
            `Nombre:    ${args[0]}`,
            `Address:  ${target.ip}`,
            "",
          ]
        : [
            "",
            "Server:  router.miguelacm.local",
            "Address:  192.168.1.1",
            "",
            "Non-authoritative answer:",
            `Name:    ${args[0]}`,
            `Address:  ${target.ip}`,
            "",
          ]);
    }

    case "netstat":
      return ok(state, cwd, isEs
        ? [
            "",
            "Conexiones activas (ejemplo simulado)",
            "",
            "Proto  Dirección local      Dirección remota        Estado",
            "TCP    192.168.1.42:50123   93.184.216.34:443       ESTABLISHED",
            "TCP    192.168.1.42:50124   142.250.200.99:443      ESTABLISHED",
            "TCP    192.168.1.42:50125   192.168.1.1:53          TIME_WAIT",
            "UDP    192.168.1.42:137     *:*                     LISTENING",
            "",
          ]
        : [
            "",
            "Active connections (simulated sample)",
            "",
            "Proto  Local address        Foreign address       State",
            "TCP    192.168.1.42:50123   93.184.216.34:443     ESTABLISHED",
            "TCP    192.168.1.42:50124   142.250.200.99:443    ESTABLISHED",
            "TCP    192.168.1.42:50125   192.168.1.1:53        TIME_WAIT",
            "UDP    192.168.1.42:137     *:*                   LISTENING",
            "",
          ]);

    case "tracert": {
      const host = args.find((a) => !a.startsWith("-"));
      if (!host) return err(state, cwd, [], isEs, "invalidPath");
      const target = resolveHost(host);
      if (!target) {
        return { lines: [isEs ? `No se puede resolver el nombre del sistema de destino ${host}.` : `Unable to resolve target system name ${host}.`], state, cwd, clear: false, exit: false, error: true };
      }
      return ok(state, cwd, isEs
        ? [
            `Calculando ruta hacia ${host} [${target.ip}]`,
            "con un máximo de 30 saltos:",
            "",
            "  1    2 ms    1 ms    2 ms   192.168.1.1 [router.miguelacm.local]",
            "  2   11 ms   10 ms   12 ms   10.10.0.1",
            "  3   19 ms   20 ms   18 ms   80.58.32.1",
            `  4   24 ms   23 ms   25 ms   ${target.ip}`,
            "",
            "Trazado completado (4 saltos).",
          ]
        : [
            `Tracing route to ${host} [${target.ip}]`,
            "over a maximum of 30 hops:",
            "",
            "  1    2 ms    1 ms    2 ms   192.168.1.1 [router.miguelacm.local]",
            "  2   11 ms   10 ms   12 ms   10.10.0.1",
            "  3   19 ms   20 ms   18 ms   80.58.32.1",
            `  4   24 ms   23 ms   25 ms   ${target.ip}`,
            "",
            "Trace complete (4 hops).",
          ]);
    }

    case "get-childitem":
    case "gci": {
      const recurse = args.some((a) => a.toLowerCase().startsWith("-recurse"));
      const rest = args.filter((a) => !a.startsWith("-"));
      const line2 = rest.join(" ");
      return executeLine(state, cwd, line2.length > 0 ? `dir ${recurse ? "/s " : ""}${line2}` : `dir${recurse ? " /s" : ""}`, opts);
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

    case "set-location":
    case "sl": {
      const rest = args.filter((a) => !a.startsWith("-"));
      return executeLine(state, cwd, `cd ${rest.join(" ")}`, opts);
    }

    case "get-help":
      return executeLine(state, cwd, "help", opts);

    default:
      return { lines: [isEs
        ? `'${tokens[0]}' no se reconoce como un comando interno o externo. Escribe help para ver los disponibles.`
        : `'${tokens[0]}' is not recognized as an internal command. Type help to see available ones.`], state, cwd, clear: false, exit: false, error: true };
  }
}
