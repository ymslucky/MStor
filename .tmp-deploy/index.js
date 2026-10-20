var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now2 = Date.now();
  const seconds = Math.trunc(now2 / 1e3);
  const nanos = now2 % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context2, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context2.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context2, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context2.error = err;
            res = await onError(err, context2);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context2.finalized === false && onNotFound) {
          res = await onNotFound(context2);
        }
      }
      if (res && (context2.finalized === false || isError)) {
        context2.res = res;
      }
      return context2;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var MAX_NESTING_DEPTH = 32;
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value, nestingState);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".", MAX_NESTING_DEPTH + 2);
  if (keys.length > MAX_NESTING_DEPTH + 1) {
    throwNestingLimitExceeded();
  }
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) {
          throwNestingLimitExceeded();
        }
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");
var throwNestingLimitExceeded = /* @__PURE__ */ __name(() => {
  throw new Error("Nesting limit exceeded");
}, "throwNestingLimitExceeded");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder2) => {
  try {
    return decoder2(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder2(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str, "tryDecodeURIComponent");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return tryDecodeURIComponent(value);
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) {
    url = url.slice(0, hashIndex);
  }
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = tryDecodeURIComponent(value);
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    for (const anyCachedKey in bodyCache) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        const contentType = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
        return new Response(body, {
          headers: contentType ? { "Content-Type": contentType } : void 0
        })[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    ;
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context2, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context: context2 }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context2, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   // Append multiple headers using the append option (e.g. Vary)
   *   c.header('Vary', 'Accept-Encoding', { append: true })
   *   c.header('Vary', 'User-Agent', { append: true })
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) {
        if (key === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      if (!responseHeaders) {
        let count3 = 0;
        for (const k in headers) {
          if (++count3 > 1 || typeof headers[k] !== "string") {
            responseHeaders = new Headers();
            break;
          }
        }
      }
      if (responseHeaders) {
        for (const k in headers) {
          const v = headers[k];
          if (typeof v === "string") {
            responseHeaders.set(k, v);
          } else {
            responseHeaders.delete(k);
            for (const v2 of v) {
              responseHeaders.append(k, v2);
            }
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibytes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch", "query"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(methodName, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) {
            this.#addRoute(methodName, this.#path, handler);
          }
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env2, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env2, "GET")))();
    }
    const path = this.getPath(request, { env: env2 });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env: env2,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context2 = await composed(c);
        if (!context2.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context2.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} env - env Object
   * @param {ExecutionContext} executionCtx - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/utils.js
var createNullObject = /* @__PURE__ */ __name(() => /* @__PURE__ */ Object.create(null), "createNullObject");

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return b === TAIL_WILDCARD_REG_EXP_STR ? -1 : 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  // handler index of a dynamic path, or -1 for a static path terminal
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context2, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : null : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
        if (name && pattern[2]) {
          if (regexpStr === ".*") {
            throw PATH_ERROR;
          }
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) {
            throw PATH_ERROR;
          }
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) {
            throw PATH_ERROR;
          }
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ONLY_WILDCARD_REG_EXP_STR && regexpStr !== TAIL_WILDCARD_REG_EXP_STR) {
            for (const k in node.#children) {
              if (
                // a single-char pattern coexists with single-char literals as a literal does
                (regexpStr.length > 1 || k.length > 1) && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
              ) {
                throw PATH_ERROR;
              }
            }
          }
          nextNode = node.#children[regexpStr] = new _Node();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context2.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) {
            if (k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR) {
              throw PATH_ERROR;
            }
          }
          nextNode = node.#children[token] = new _Node();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) {
      throw PATH_ERROR;
    }
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  // dynamic path -> [handler index, param assoc]; static paths are not registered
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    `^${path.replace(
      /\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g,
      (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ONLY_WILDCARD_REG_EXP_STR : `/:${LABEL_REG_EXP_STR}`
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: createNullObject() };
    this.#routes = { [METHOD_NAME_ALL]: createNullObject() };
    this.#tries = { [METHOD_NAME_ALL]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap[METHOD_NAME_ALL]) {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path === "/*") {
      path = "*";
    }
    const methods = method === METHOD_NAME_ALL ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) {
        if (!middleware[m][path]) {
          this.#insertPath(m, path);
          middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        }
      }
      for (const handlerMap of [middleware, routes]) {
        for (const m of methods) {
          for (const p in handlerMap[m]) {
            re.test(p) && handlerMap[m][p].push([handler, path]);
          }
        }
      }
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) {
      for (const m of methods) {
        if (!routes[m][path2]) {
          this.#insertPath(m, path2);
          routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || [];
        }
        routes[m][path2].push([handler, path2]);
      }
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) {
      matchers[method] = this.#buildMatcher(method);
    }
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) {
      for (const path in r) {
        const handlers = r[path];
        const pathData = trie.paths[path];
        if (!pathData) {
          staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
          continue;
        }
        handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [
          h,
          trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
            map[key] = paramReplacementMap[pathData[1][i][1]];
            return map;
          }, createNullObject())
        ]);
      }
    }
    return [regexp, indexReplacementMap.map((i) => handlerData[i]), staticMap];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new _Node2();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) {
        possibleKeys.add(pattern[1]);
      }
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: [...possibleKeys],
        score: ++order
      }
    });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) {
            continue;
          }
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node = new Node2();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) {
      this.#node.insert(method, result, handler);
    }
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// server/lib/logger.ts
function emit2(level, message2, fields) {
  const line = JSON.stringify({ level, message: message2, ...fields });
  if (level === "error") console.error(line);
  else console.warn(line);
}
__name(emit2, "emit");
function baseFields(c) {
  const fields = {
    requestId: c.req.header("cf-ray") ?? void 0,
    route: `${c.req.method} ${new URL(c.req.url).pathname}`
  };
  try {
    const user = c.get("user");
    if (user) fields.userId = user.id;
  } catch {
  }
  return fields;
}
__name(baseFields, "baseFields");
var logger = {
  error(message2, c, fields = {}) {
    emit2("error", message2, { ...baseFields(c), ...fields });
  },
  warn(message2, c, fields = {}) {
    emit2("warn", message2, { ...baseFields(c), ...fields });
  }
};

// server/lib/errors.ts
var HttpError = class extends Error {
  constructor(status, code, message2) {
    super(message2);
    this.status = status;
    this.code = code;
    this.name = "HttpError";
  }
  status;
  code;
  static {
    __name(this, "HttpError");
  }
};
var errors = {
  unauthorized: /* @__PURE__ */ __name(() => new HttpError(401, "UNAUTHORIZED", "\u8BF7\u5148\u767B\u5F55"), "unauthorized"),
  forbidden: /* @__PURE__ */ __name((m = "\u65E0\u6743\u8BBF\u95EE") => new HttpError(403, "FORBIDDEN", m), "forbidden"),
  quotaExceeded: /* @__PURE__ */ __name(() => new HttpError(403, "QUOTA_EXCEEDED", "\u7A7A\u95F4\u914D\u989D\u4E0D\u8DB3"), "quotaExceeded"),
  notFound: /* @__PURE__ */ __name(() => new HttpError(404, "NOT_FOUND", "\u8D44\u6E90\u4E0D\u5B58\u5728"), "notFound"),
  conflict: /* @__PURE__ */ __name((m = "\u540D\u79F0\u5DF2\u5B58\u5728") => new HttpError(409, "CONFLICT", m), "conflict"),
  badRequest: /* @__PURE__ */ __name((m = "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF") => new HttpError(400, "BAD_REQUEST", m), "badRequest"),
  rateLimited: /* @__PURE__ */ __name((m = "\u64CD\u4F5C\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5") => new HttpError(429, "RATE_LIMITED", m), "rateLimited"),
  badGateway: /* @__PURE__ */ __name((m = "\u4E0A\u6E38\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5") => new HttpError(502, "BAD_GATEWAY", m), "badGateway"),
  // 整站存储满：与「个人配额不足 403」区分（507 语义见 RFC 4918）
  storageFull: /* @__PURE__ */ __name((m = "\u7AD9\u70B9\u5B58\u50A8\u5DF2\u6EE1\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458") => new HttpError(507, "STORAGE_FULL", m), "storageFull")
};
async function errorHandler2(e, c) {
  if (e instanceof HttpError) {
    if (e.status >= 500) logger.error("request failed", c, { code: e.code, status: e.status, error: e.message });
    return c.json({ error: { code: e.code, message: e.message } }, e.status);
  }
  if (e instanceof SyntaxError) {
    return c.json({ error: { code: "BAD_REQUEST", message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON" } }, 400);
  }
  logger.error("unhandled error", c, { code: "INTERNAL", status: 500, error: e.message, stack: e.stack });
  return c.json({ error: { code: "INTERNAL", message: "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF" } }, 500);
}
__name(errorHandler2, "errorHandler");

// node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: true });
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers)
    buf.set(buffer, i), i += buffer.length;
  return buf;
}
__name(concat, "concat");
var NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
  if (typeof string == "string" && string.length >= 128) {
    if (NON_ASCII.test(string))
      throw new TypeError("non-ASCII string encountered in encode()");
    return encoder.encode(string);
  }
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127)
      throw new TypeError("non-ASCII string encountered in encode()");
    bytes[i] = code;
  }
  return bytes;
}
__name(encode, "encode");
function decodeBase64(encoded, url = false) {
  if (Uint8Array.fromBase64)
    return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
  if (url) {
    if (encoded.includes("+") || encoded.includes("/"))
      throw new TypeError("Invalid base64url");
    encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  }
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(decodeBase64, "decodeBase64");

// node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
  static {
    __name(this, "JOSEError");
  }
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
  }
};
var JWTClaimValidationFailed = class extends JOSEError {
  static {
    __name(this, "JWTClaimValidationFailed");
  }
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JWTExpired = class extends JOSEError {
  static {
    __name(this, "JWTExpired");
  }
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JOSEAlgNotAllowed = class extends JOSEError {
  static {
    __name(this, "JOSEAlgNotAllowed");
  }
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
  static {
    __name(this, "JOSENotSupported");
  }
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
  static {
    __name(this, "JWSInvalid");
  }
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static {
    __name(this, "JWTInvalid");
  }
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWKSInvalid = class extends JOSEError {
  static {
    __name(this, "JWKSInvalid");
  }
  static code = "ERR_JWKS_INVALID";
  code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
  static {
    __name(this, "JWKSNoMatchingKey");
  }
  static code = "ERR_JWKS_NO_MATCHING_KEY";
  code = "ERR_JWKS_NO_MATCHING_KEY";
  constructor(message2 = "no applicable key found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
  static {
    __name(this, "JWKSMultipleMatchingKeys");
  }
  [Symbol.asyncIterator] = async function* () {
  };
  static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  constructor(message2 = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSTimeout = class extends JOSEError {
  static {
    __name(this, "JWKSTimeout");
  }
  static code = "ERR_JWKS_TIMEOUT";
  code = "ERR_JWKS_TIMEOUT";
  constructor(message2 = "request timed out", options) {
    super(message2, options);
  }
};
var JWSSignatureVerificationFailed = class extends JOSEError {
  static {
    __name(this, "JWSSignatureVerificationFailed");
  }
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
  }
};

// node_modules/jose/dist/webapi/util/base64url.js
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
  try {
    return decodeBase64(typeof input == "string" ? input : decoder.decode(input), true);
  } catch (cause) {
    throw new TypeError(invalid, { cause });
  }
}
__name(decode, "decode");

// node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
  if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]")
    return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
__name(isObject, "isObject");
function isJwkSet(input) {
  return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
__name(isJwkSet, "isJwkSet");
function isDisjoint(...headers) {
  const parameters = /* @__PURE__ */ new Set();
  for (const header of headers)
    if (header)
      for (const parameter of Object.keys(header)) {
        if (parameters.has(parameter))
          return false;
        parameters.add(parameter);
      }
  return true;
}
__name(isDisjoint, "isDisjoint");
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch {
    throw new ErrorClass(`Failed to base64url decode the ${label}`);
  }
}
__name(decodeBase64url, "decodeBase64url");
function encodeBase64url(value, label, ErrorClass) {
  try {
    return encode(value);
  } catch {
    throw new ErrorClass(`The ${label} is not a valid base64url string`);
  }
}
__name(encodeBase64url, "encodeBase64url");
function parseJoseHeader(b642, ErrorClass, message2) {
  let parsed;
  try {
    parsed = JSON.parse(strictDecoder.decode(decode(b642)));
  } catch {
    throw new ErrorClass(message2);
  }
  if (!isObject(parsed))
    throw new ErrorClass(message2);
  return parsed;
}
__name(parseJoseHeader, "parseJoseHeader");
var JWS_RECOGNIZED = { __proto__: null, b64: true };
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string")))
    throw new TypeError(`"${option}" option must be an array of strings`);
  return algorithms === void 0 ? void 0 : new Set(algorithms);
}
__name(validateAlgorithms, "validateAlgorithms");
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0)
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  if (!protectedHeader || protectedHeader.crit === void 0)
    return [];
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0))
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  const recognized = recognizedOption === void 0 ? recognizedDefault : { __proto__: null, ...recognizedOption, ...recognizedDefault };
  for (const parameter of protectedHeader.crit) {
    if (!(parameter in recognized))
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0)
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0))
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
  }
  return protectedHeader.crit;
}
__name(validateCrit, "validateCrit");
function validateB64(protectedHeader, extensions) {
  if (extensions.includes("b64")) {
    const b642 = protectedHeader.b64;
    if (typeof b642 != "boolean")
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    return b642;
  }
  return true;
}
__name(validateB64, "validateB64");

// node_modules/jose/dist/webapi/lib/key.js
var tag = /* @__PURE__ */ __name((key) => key[Symbol.toStringTag], "tag");
var jwkMatchesOp = /* @__PURE__ */ __name((entry, key, usage) => {
  const { alg } = entry;
  if (key.use !== void 0) {
    const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
    if (key.use !== expected)
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
  }
  if (key.alg !== void 0 && key.alg !== alg)
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  if (Array.isArray(key.key_ops)) {
    const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
    if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp))
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
  }
}, "jwkMatchesOp");
async function prepareKey(entry, key, usage) {
  const { alg, secret } = entry, privateKey = usage === "decrypt" || usage === "sign";
  if (secret && key instanceof Uint8Array)
    return key;
  let normalized, keyObject;
  if (isObject(key)) {
    if (normalized = normalizeJwk(key), typeof normalized.kty != "string")
      throw invalidKeyType(alg, key, secret);
    if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (privateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0)))
      throw new TypeError(secret ? 'JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present' : `JSON Web Key for this operation must be a ${privateKey ? "private" : "public"} JWK`);
    if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct")
      return decode(normalized.k);
    if (!Object.isFrozen(key)) {
      const { key_ops } = key;
      Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
    }
  } else {
    if (!isKeyLike(key))
      throw invalidKeyType(alg, key, secret);
    const expectedType = secret ? "secret" : privateKey ? "private" : "public";
    if (key.type !== expectedType && (secret || ["secret", "public", "private"].includes(key.type)))
      throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
    if (isCryptoKey(key))
      return key;
    if (keyObject = key, keyObject.type === "secret")
      return keyObject.export();
  }
  cache ||= /* @__PURE__ */ new WeakMap();
  const cacheKey = key;
  let cached2 = cache.get(cacheKey);
  if (cached2?.[alg])
    return cached2[alg];
  if (cached2 || cache.set(cacheKey, cached2 = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
    const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({ crv, asymmetricKeyType: keyObject.asymmetricKeyType }) ?? entry.subtle;
    return cached2[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
  }
  return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached2[alg] = await jwkToKey(entry, normalized);
}
__name(prepareKey, "prepareKey");
var cache;
var nist = {
  __proto__: null,
  prime256v1: "P-256",
  secp384r1: "P-384",
  secp521r1: "P-521"
};
var isCryptoKey = /* @__PURE__ */ __name((key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
}, "isCryptoKey");
var isKeyObject = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag] === "KeyObject", "isKeyObject");
var isKeyLike = /* @__PURE__ */ __name((key) => isCryptoKey(key) || isKeyObject(key), "isKeyLike");
function message(msg, actual, ...types) {
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
  return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
__name(message, "message");
function invalidKeyType(alg, actual, secret) {
  const types = ["CryptoKey", "KeyObject", "JSON Web Key"];
  return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
__name(invalidKeyType, "invalidKeyType");
var unusable = /* @__PURE__ */ __name((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage))
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
__name(checkUsage, "checkUsage");
function checkModulusLength(alg, key) {
  const { modulusLength } = key.algorithm;
  if (typeof modulusLength != "number" || modulusLength < 2048)
    throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
__name(checkModulusLength, "checkModulusLength");
function checkCryptoKey(key, expected, usage) {
  const algorithm = key.algorithm;
  if (algorithm.name !== expected.name)
    throw unusable(expected.name);
  if (expected.hash && algorithm.hash?.name !== expected.hash)
    throw unusable(expected.hash, "algorithm.hash");
  if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve)
    throw unusable(expected.namedCurve, "algorithm.namedCurve");
  if (expected.length !== void 0 && algorithm.length !== expected.length)
    throw unusable(expected.length, "algorithm.length");
  checkUsage(key, usage);
}
__name(checkCryptoKey, "checkCryptoKey");
function snapshotJwk(jwk) {
  return { __proto__: null, ...jwk };
}
__name(snapshotJwk, "snapshotJwk");
function normalizeJwk(jwk) {
  const normalized = snapshotJwk(jwk);
  if (normalized.ext !== void 0 && typeof normalized.ext != "boolean")
    throw new TypeError('"ext" (Extractable) Parameter must be a boolean');
  if (normalized.key_ops !== void 0) {
    const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
    if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length)
      throw new TypeError('"key_ops" (Key Operations) Parameter must be an array of unique strings');
    normalized.key_ops = keyOps;
  }
  return normalized;
}
__name(normalizeJwk, "normalizeJwk");
async function jwkToKey(entry, jwk, extractable) {
  if (!entry.kty.includes(jwk.kty))
    throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
  const algorithm = entry.resolve?.({ kty: jwk.kty, crv: jwk.crv }) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = { ...jwk, ext: extractable ?? jwk.ext };
  return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
__name(jwkToKey, "jwkToKey");
async function rawKey(key, expected, usage, extractable = false) {
  return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}
__name(rawKey, "rawKey");

// node_modules/jose/dist/webapi/lib/key_descriptor.js
function table3(entries) {
  const out = { __proto__: null };
  for (const alg in entries)
    out[alg] = { ...entries[alg], alg };
  return out;
}
__name(table3, "table");

// node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
  const subtle = { name: "HMAC", hash: `SHA-${bits}` };
  return { kty: ["oct"], secret: true, subtle, signing: subtle, usages: sig };
}
__name(hmac, "hmac");
function rsa(bits, saltLength) {
  const subtle = { name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", hash: `SHA-${bits}` };
  return {
    kty: ["RSA"],
    subtle,
    signing: saltLength ? { ...subtle, saltLength } : subtle,
    usages: sig,
    minRsaBits: 2048
  };
}
__name(rsa, "rsa");
function ecdsa(crv, bits) {
  return {
    kty: ["EC"],
    crv,
    subtle: { name: "ECDSA", namedCurve: crv },
    signing: { name: "ECDSA", hash: `SHA-${bits}` },
    usages: sig
  };
}
__name(ecdsa, "ecdsa");
function eddsa() {
  const subtle = { name: "Ed25519" };
  return {
    kty: ["OKP"],
    crv: "Ed25519",
    subtle,
    signing: subtle,
    usages: sig
  };
}
__name(eddsa, "eddsa");
function mldsa(bits) {
  const subtle = { name: `ML-DSA-${bits}` };
  return {
    kty: ["AKP"],
    subtle,
    signing: subtle,
    usages: sig
  };
}
__name(mldsa, "mldsa");
var JWS = table3({
  HS256: hmac(256),
  HS384: hmac(384),
  HS512: hmac(512),
  RS256: rsa(256),
  RS384: rsa(384),
  RS512: rsa(512),
  PS256: rsa(256, 32),
  PS384: rsa(384, 48),
  PS512: rsa(512, 64),
  ES256: ecdsa("P-256", 256),
  ES384: ecdsa("P-384", 384),
  ES512: ecdsa("P-521", 512),
  EdDSA: eddsa(),
  Ed25519: eddsa(),
  "ML-DSA-44": mldsa(44),
  "ML-DSA-65": mldsa(65),
  "ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
  const entry = typeof alg == "string" ? JWS[alg] : void 0;
  if (!entry)
    throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  return entry;
}
__name(jwsAlgorithm, "jwsAlgorithm");

// node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
  return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
__name(prepareVerify, "prepareVerify");
function parseProtectedHeader(encodedProtected) {
  return encodedProtected === void 0 ? {} : parseJoseHeader(encodedProtected, JWSInvalid, "JWS Protected Header is invalid");
}
__name(parseProtectedHeader, "parseProtectedHeader");
function encodeCompactUnencodedPayload(payload) {
  try {
    return encode(payload);
  } catch {
    throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters");
  }
}
__name(encodeCompactUnencodedPayload, "encodeCompactUnencodedPayload");
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
  const { protected: encodedProtected, header, payload: inputPayload } = jws, parsedProt = parsedProtected ?? parseProtectedHeader(encodedProtected);
  if (!isDisjoint(parsedProt, header))
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  const joseHeader = { ...parsedProt, ...header }, b642 = validateB64(parsedProt, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], parsedProt, joseHeader)), { alg } = joseHeader;
  if (typeof alg != "string" || !alg)
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  if (shared[0] && !shared[0].has(alg))
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  if (b642) {
    if (typeof inputPayload != "string")
      throw new JWSInvalid("JWS Payload must be a string");
  } else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array))
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  const signingPayload = b642 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
  let resolvedKey = false;
  typeof key == "function" && (key = await key(parsedProt, jws), resolvedKey = true);
  const entry = jwsAlgorithm(alg), data = concat(encodedProtected !== void 0 ? encode(encodedProtected) : new Uint8Array(), encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), k = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(k, entry.subtle, "verify");
  entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
  let verified = false;
  try {
    verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, data);
  } catch {
  }
  if (!verified)
    throw new JWSSignatureVerificationFailed();
  const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
  return encodedProtected !== void 0 && (result.protectedHeader = parsedProt), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{ ...result, key: k }, b642] : [result, b642];
}
__name(verifySignature, "verifySignature");
async function verifyCompact(jws, shared, key) {
  if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string")
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3)
    throw new JWSInvalid("Invalid Compact JWS");
  return verifySignature({ payload, protected: protectedHeader, signature }, shared, key, encodeCompactUnencodedPayload);
}
__name(verifyCompact, "verifyCompact");

// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = /* @__PURE__ */ __name((date) => Math.floor(date.getTime() / 1e3), "epoch");
var multipliers = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function invalidDuration() {
  throw new TypeError("Invalid time period format");
}
__name(invalidDuration, "invalidDuration");
function secs(str) {
  typeof str != "string" && invalidDuration();
  const matched = REGEX.exec(str);
  (!matched || matched[4] && matched[1]) && invalidDuration();
  const value = parseFloat(matched[2]), numericDate2 = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
  return Number.isFinite(numericDate2) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -numericDate2 : numericDate2;
}
__name(secs, "secs");
function validateInput(label, input) {
  if (!Number.isFinite(input))
    throw new TypeError(`Invalid ${label} input`);
  return input;
}
__name(validateInput, "validateInput");
var normalizeTyp = /* @__PURE__ */ __name((value) => {
  const normalized = value.toLowerCase();
  return value.includes("/") ? normalized : `application/${normalized}`;
}, "normalizeTyp");
var checkAudiencePresence = /* @__PURE__ */ __name((audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : false, "checkAudiencePresence");
function validateNumericDate(payload, claim, required = false) {
  const value = payload[claim];
  if (!(value === void 0 && !required)) {
    if (typeof value != "number")
      throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, payload, claim, "invalid");
    return value;
  }
}
__name(validateNumericDate, "validateNumericDate");
function unexpectedClaim(payload, claim) {
  throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, payload, claim, checkFailed);
}
__name(unexpectedClaim, "unexpectedClaim");
function validateClaimsSet(protectedHeader, encodedPayload, options = {}) {
  let payload;
  try {
    payload = JSON.parse(strictDecoder.decode(encodedPayload));
  } catch {
  }
  if (!isObject(payload))
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  const { typ } = options;
  if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ)))
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", checkFailed);
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
  maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse()))
    if (!Object.hasOwn(payload, claim))
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
  issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss) && unexpectedClaim(payload, "iss"), subject !== void 0 && payload.sub !== subject && unexpectedClaim(payload, "sub"), audience !== void 0 && !checkAudiencePresence(payload.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(payload, "aud");
  const { clockTolerance } = options;
  let tolerance = 0;
  if (typeof clockTolerance == "string")
    tolerance = secs(clockTolerance);
  else if (clockTolerance !== void 0) {
    if (typeof clockTolerance != "number")
      throw new TypeError("Invalid clockTolerance option type");
    tolerance = clockTolerance;
  }
  validateInput("clockTolerance option", tolerance);
  const { currentDate } = options, now2 = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(payload, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(payload, "nbf");
  if (nbf !== void 0 && nbf > now2 + tolerance)
    throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", checkFailed);
  const exp = validateNumericDate(payload, "exp");
  if (exp !== void 0 && exp <= now2 - tolerance)
    throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", checkFailed);
  if (maxTokenAge !== void 0) {
    const age = now2 - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
    if (age - tolerance > max)
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", checkFailed);
    if (age < -tolerance)
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", checkFailed);
  }
  return payload;
}
__name(validateClaimsSet, "validateClaimsSet");

// node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
  const [verified, b642] = await verifyCompact(jwt, prepareVerify(options), key);
  if (!b642)
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  return { ...verified, payload };
}
__name(jwtVerify, "jwtVerify");

// node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
  const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
  return (ext === void 0 || typeof ext == "boolean") && (keyOps === void 0 || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === void 0 || typeof kid == "string" && kid === jwkKid) && (jwkAlg === void 0 ? kty !== "AKP" : alg === jwkAlg) && (use === void 0 || use === "sig") && (!entry.crv || crv === entry.crv);
}
__name(isUsableJWK, "isUsableJWK");
async function importWithAlgCache(cache2, jwk, entry) {
  const cached2 = cache2.get(jwk) || cache2.set(jwk, {}).get(jwk), { alg } = entry;
  if (cached2[alg] === void 0) {
    const pending = jwkToKey(entry, jwk, true).then((key) => {
      if (key.type !== "public")
        throw new JWKSInvalid("JSON Web Key Set members must be public keys");
      return cached2[alg] = key, key;
    }).catch((error3) => {
      throw cached2[alg] === pending && delete cached2[alg], error3;
    });
    cached2[alg] = pending;
  }
  return cached2[alg];
}
__name(importWithAlgCache, "importWithAlgCache");
function createLocalJWKSet(jwks) {
  let snapshot;
  try {
    snapshot = structuredClone(jwks);
  } catch {
  }
  if (!isJwkSet(snapshot))
    throw new JWKSInvalid("JSON Web Key Set malformed");
  const metadata = snapshot.keys.map((jwk) => {
    const normalized = snapshotJwk(jwk);
    return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
  }), cached2 = /* @__PURE__ */ new WeakMap();
  return Object.defineProperty(async (protectedHeader, token) => {
    const { alg, kid } = { ...protectedHeader, ...token?.header }, entry = typeof alg == "string" ? JWS[alg] : void 0;
    if (!entry || entry.secret)
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
    const candidates = snapshot.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
    if (!length)
      throw new JWKSNoMatchingKey();
    if (length !== 1) {
      const error3 = new JWKSMultipleMatchingKeys();
      throw error3[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates)
          try {
            yield await importWithAlgCache(cached2, jwk2, entry);
          } catch {
          }
      }, error3;
    }
    return importWithAlgCache(cached2, jwk, entry);
  }, "jwks", {
    value: /* @__PURE__ */ __name(() => structuredClone(snapshot), "value")
  });
}
__name(createLocalJWKSet, "createLocalJWKSet");

// node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
  return typeof WebSocketPair < "u" || typeof navigator < "u" && true || typeof EdgeRuntime < "u" && EdgeRuntime === "vercel";
}
__name(isCloudflareWorkers, "isCloudflareWorkers");
var USER_AGENT;
(typeof navigator > "u" || !"Cloudflare-Workers"?.startsWith?.("Mozilla/5.0 ")) && (USER_AGENT = "jose/v6.2.12");
var customFetch = /* @__PURE__ */ Symbol();
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "manual",
    headers
  }).catch((err) => {
    throw err.name === "TimeoutError" ? new JWKSTimeout() : err;
  });
  if (response.status !== 200)
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  try {
    return await response.json();
  } catch {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON");
  }
}
__name(fetchJwks, "fetchJwks");
var jwksCache = /* @__PURE__ */ Symbol();
function isFreshFor(timestamp, duration) {
  return Number.isFinite(timestamp) && Date.now() < timestamp + duration;
}
__name(isFreshFor, "isFreshFor");
function validateDuration(value, fallback, option) {
  if (Number.isNaN(value))
    throw new TypeError(`"${option}" option must not be NaN`);
  return typeof value == "number" ? value : fallback;
}
__name(validateDuration, "validateDuration");
function createRemoteJWKSet(url, options) {
  if (!(url instanceof URL))
    throw new TypeError("url must be an instance of URL");
  const href = new URL(url.href).href, opts = options ?? {}, timeoutOption = opts.timeoutDuration;
  if (typeof timeoutOption == "number" && (!Number.isInteger(timeoutOption) || timeoutOption < 0))
    throw new TypeError('"timeoutDuration" option must be a non-negative integer');
  const timeoutDuration = typeof timeoutOption == "number" ? timeoutOption : 5e3, cooldownDuration = validateDuration(opts.cooldownDuration, 3e4, "cooldownDuration"), cacheMaxAge = validateDuration(opts.cacheMaxAge, 6e5, "cacheMaxAge"), headers = new Headers(opts.headers);
  USER_AGENT && !headers.has("User-Agent") && headers.set("User-Agent", USER_AGENT), headers.has("accept") || headers.set("accept", "application/json, application/jwk-set+json");
  const fetchImpl = opts[customFetch], cache2 = opts[jwksCache];
  let jwksTimestamp, pendingFetch, reloadSequence = 0, appliedSequence = 0, local;
  if (cache2 && typeof cache2 == "object") {
    const { uat, jwks } = cache2;
    isFreshFor(uat, cacheMaxAge) && isJwkSet(jwks) && (jwksTimestamp = uat, local = createLocalJWKSet(jwks));
  }
  const reload = /* @__PURE__ */ __name(async () => {
    if (pendingFetch && isCloudflareWorkers() && (pendingFetch = void 0), !pendingFetch) {
      const sequence = ++reloadSequence, current = pendingFetch = fetchJwks(href, headers, AbortSignal.timeout(timeoutDuration), fetchImpl).then((json) => {
        const next = createLocalJWKSet(json);
        if (sequence <= appliedSequence)
          return;
        local = next;
        const updatedAt = Date.now();
        cache2 && (cache2.uat = updatedAt, cache2.jwks = json), jwksTimestamp = updatedAt, appliedSequence = sequence;
      }).finally(() => {
        pendingFetch === current && (pendingFetch = void 0);
      });
    }
    await pendingFetch;
  }, "reload");
  return Object.defineProperties(async (protectedHeader, token) => {
    (!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload();
    try {
      return await local(protectedHeader, token);
    } catch (err) {
      if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration))
        return await reload(), local(protectedHeader, token);
      throw err;
    }
  }, {
    coolingDown: {
      get: /* @__PURE__ */ __name(() => isFreshFor(jwksTimestamp, cooldownDuration), "get"),
      enumerable: true
    },
    fresh: {
      get: /* @__PURE__ */ __name(() => isFreshFor(jwksTimestamp, cacheMaxAge), "get"),
      enumerable: true
    },
    reload: {
      value: reload,
      enumerable: true
    },
    reloading: {
      get: /* @__PURE__ */ __name(() => !!pendingFetch, "get"),
      enumerable: true
    },
    jwks: {
      value: /* @__PURE__ */ __name(() => local?.jwks(), "value"),
      enumerable: true
    }
  });
}
__name(createRemoteJWKSet, "createRemoteJWKSet");

// server/lib/sql.ts
var DIRS_PER_STMT = 32;
function jsonList(values) {
  return JSON.stringify(values);
}
__name(jsonList, "jsonList");
function jsonSet() {
  return "(SELECT value FROM json_each(?))";
}
__name(jsonSet, "jsonSet");
function isUniqueViolation(e) {
  return e instanceof Error && e.message.includes("UNIQUE constraint failed");
}
__name(isUniqueViolation, "isUniqueViolation");
function chunk(arr, n) {
  const batches = [];
  for (let i = 0; i < arr.length; i += n) batches.push(arr.slice(i, n + i));
  return batches;
}
__name(chunk, "chunk");

// server/data/workspaces.ts
var DEFAULT_QUOTA = 10737418240;
function personalSlug(userId) {
  return `u-${userId}`;
}
__name(personalSlug, "personalSlug");
function rowToWorkspace(row) {
  return row;
}
__name(rowToWorkspace, "rowToWorkspace");
async function ensurePersonalWorkspace(db, userId, opts = {}) {
  const slug = personalSlug(userId);
  const existing = await db.prepare("SELECT * FROM workspaces WHERE slug = ?1").bind(slug).first();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const now2 = Date.now();
  const quota = opts.quotaBytes ?? DEFAULT_QUOTA;
  try {
    await db.batch([
      db.prepare("INSERT INTO workspaces (id, name, slug, quota_bytes, used_bytes, created_at) VALUES (?1,?2,?3,?4,0,?5)").bind(id, opts.name ?? "\u6211\u7684\u7A7A\u95F4", slug, quota, now2),
      db.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?1,?2,'owner',?3)").bind(id, userId, now2),
      db.prepare("INSERT INTO storage_stats (workspace_id, updated_at) VALUES (?1,?2)").bind(id, now2)
    ]);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const raced = await db.prepare("SELECT * FROM workspaces WHERE slug = ?1").bind(slug).first();
    if (raced) return raced;
    throw e;
  }
  const created = await db.prepare("SELECT * FROM workspaces WHERE id = ?1").bind(id).first();
  if (!created) throw new Error("workspace \u521B\u5EFA\u540E\u4E0D\u53EF\u8BFB");
  return created;
}
__name(ensurePersonalWorkspace, "ensurePersonalWorkspace");
async function resolveWorkspace(db, userId, requestedId) {
  if (requestedId) {
    const { results: results2 } = await db.prepare(
      "SELECT w.*, m.role AS role FROM workspaces w JOIN memberships m ON m.workspace_id = w.id WHERE w.id = ?1 AND m.user_id = ?2"
    ).bind(requestedId, userId).all();
    const row2 = results2[0];
    if (!row2) {
      const exists = await db.prepare("SELECT 1 AS hit FROM workspaces WHERE id = ?1").bind(requestedId).first();
      throw exists ? errors.forbidden("\u65E0\u6743\u8BBF\u95EE\u8BE5\u7A7A\u95F4") : errors.notFound();
    }
    const workspace2 = rowToWorkspace(row2);
    return { workspace: workspace2, role: row2.role };
  }
  const { results } = await db.prepare(
    "SELECT w.*, m.role AS role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ?1 ORDER BY m.created_at ASC, w.id ASC LIMIT 1"
  ).bind(userId).all();
  const row = results[0];
  if (!row) throw errors.notFound();
  const workspace = rowToWorkspace(row);
  return { workspace, role: row.role };
}
__name(resolveWorkspace, "resolveWorkspace");
async function listMemberships(db, userId) {
  const { results } = await db.prepare(
    // 同毫秒加入时用 id 兜底排序，避免列表顺序抖动
    "SELECT w.*, m.role AS role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ?1 ORDER BY m.created_at ASC, w.id ASC"
  ).bind(userId).all();
  return results.map((row) => ({ workspace: rowToWorkspace(row), role: row.role }));
}
__name(listMemberships, "listMemberships");

// server/data/notifications.ts
var DEDUPE_WINDOW_MS = 24 * 36e5;
function notificationStmt(db, input) {
  return db.prepare(
    "INSERT INTO notifications (id, workspace_id, user_id, kind, title, body, link, read_at, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8)"
  ).bind(
    crypto.randomUUID(),
    input.workspaceId,
    input.userId,
    input.kind,
    input.title,
    input.body ?? null,
    input.link ?? null,
    Date.now()
  );
}
__name(notificationStmt, "notificationStmt");
async function workspaceManagerIds(db, workspaceId) {
  const { results } = await db.prepare("SELECT user_id FROM memberships WHERE workspace_id = ?1 AND role IN ('owner','admin')").bind(workspaceId).all();
  return results.map((r) => r.user_id);
}
__name(workspaceManagerIds, "workspaceManagerIds");
async function notifyManagers(db, input) {
  const managers = await workspaceManagerIds(db, input.workspaceId);
  if (!managers.length) return 0;
  if (input.dedupe) {
    const recent = await db.prepare(
      "SELECT 1 AS hit FROM notifications WHERE workspace_id = ?1 AND kind = ?2 AND read_at IS NULL AND created_at > ?3 LIMIT 1"
    ).bind(input.workspaceId, input.kind, Date.now() - DEDUPE_WINDOW_MS).first();
    if (recent) return 0;
  }
  await db.batch(
    managers.map(
      (userId) => notificationStmt(db, { ...input, userId })
    )
  );
  return managers.length;
}
__name(notifyManagers, "notifyManagers");
async function listNotifications(db, userId, limit = 30) {
  const [rows, unread] = await db.batch([
    db.prepare(
      "SELECT * FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    ).bind(userId, limit),
    db.prepare("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ?1 AND read_at IS NULL").bind(userId)
  ]);
  return {
    items: rows.results,
    unread: unread.results[0]?.unread ?? 0
  };
}
__name(listNotifications, "listNotifications");
async function markNotificationRead(db, userId, id) {
  const res = await db.prepare("UPDATE notifications SET read_at = ?1 WHERE id = ?2 AND user_id = ?3 AND read_at IS NULL").bind(Date.now(), id, userId).run();
  if (!res.meta.changes) {
    const exists = await db.prepare("SELECT 1 AS hit FROM notifications WHERE id = ?1 AND user_id = ?2").bind(id, userId).first();
    if (!exists) throw errors.notFound();
  }
}
__name(markNotificationRead, "markNotificationRead");
async function markAllRead(db, userId) {
  const res = await db.prepare("UPDATE notifications SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL").bind(Date.now(), userId).run();
  return res.meta.changes;
}
__name(markAllRead, "markAllRead");
async function unreadCount(db, userId) {
  const row = await db.prepare("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ?1 AND read_at IS NULL").bind(userId).first();
  return row?.unread ?? 0;
}
__name(unreadCount, "unreadCount");

// server/data/invitations.ts
var INVITE_TTL_MS = 7 * 864e5;
async function hashInviteToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashInviteToken, "hashInviteToken");
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
__name(normalizeEmail, "normalizeEmail");
async function createInvitation(db, workspaceId, rawEmail, role, actorId) {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw errors.badRequest("\u90AE\u7BB1\u683C\u5F0F\u4E0D\u5408\u6CD5");
  if (role === "owner") throw errors.badRequest("\u4E0D\u80FD\u9080\u8BF7 owner");
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashInviteToken(token);
  const now2 = Date.now();
  const expiresAt = now2 + INVITE_TTL_MS;
  try {
    await db.batch([
      // 旧邀请作废（同 workspace + email 且未被接受的）
      db.prepare("DELETE FROM invitations WHERE workspace_id = ?1 AND email = ?2 AND accepted_at IS NULL").bind(workspaceId, email),
      db.prepare(
        "INSERT INTO invitations (token_hash, workspace_id, email, role, created_at, expires_at, accepted_at) VALUES (?1,?2,?3,?4,?5,?6,NULL)"
      ).bind(tokenHash, workspaceId, email, role, now2, expiresAt),
      // 审计与业务写同 batch
      db.prepare(
        "INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, meta, created_at) VALUES (?1,?2,?3,'invitation.create',?4,?5,?6)"
      ).bind(crypto.randomUUID(), workspaceId, actorId, email, JSON.stringify({ role }), now2)
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("\u9080\u8BF7\u5DF2\u5B58\u5728\uFF0C\u8BF7\u91CD\u8BD5");
    throw e;
  }
  return { token, expiresAt };
}
__name(createInvitation, "createInvitation");
async function listInvitations(db, workspaceId) {
  const { results } = await db.prepare(
    `SELECT email, role, created_at, expires_at, accepted_at FROM invitations
     WHERE workspace_id = ?1 AND accepted_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC`
  ).bind(workspaceId, Date.now()).all();
  return results;
}
__name(listInvitations, "listInvitations");
async function revokeInvitation(db, workspaceId, token, actorId) {
  const tokenHash = await hashInviteToken(token);
  const res = await db.prepare("DELETE FROM invitations WHERE token_hash = ?1 AND workspace_id = ?2 AND accepted_at IS NULL").bind(tokenHash, workspaceId).run();
  if (!res.meta.changes) throw errors.notFound();
  await db.prepare(
    "INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, created_at) VALUES (?1,?2,?3,'invitation.revoke',?4,?5)"
  ).bind(crypto.randomUUID(), workspaceId, actorId, tokenHash, Date.now()).run();
}
__name(revokeInvitation, "revokeInvitation");
async function acceptPendingInvitations(db, userId, rawEmail) {
  if (!rawEmail) return [];
  const email = normalizeEmail(rawEmail);
  const now2 = Date.now();
  const { results } = await db.prepare(
    "SELECT token_hash, workspace_id, role FROM invitations WHERE email = ?1 AND accepted_at IS NULL AND expires_at > ?2"
  ).bind(email, now2).all();
  if (!results.length) return [];
  const stmts = results.flatMap((inv) => [
    db.prepare("INSERT OR IGNORE INTO memberships (workspace_id, user_id, role, created_at) VALUES (?1,?2,?3,?4)").bind(inv.workspace_id, userId, inv.role, now2),
    db.prepare("UPDATE invitations SET accepted_at = ?1 WHERE token_hash = ?2").bind(now2, inv.token_hash),
    db.prepare("INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, created_at) VALUES (?1,?2,?3,'invitation.accept',?2,?4)").bind(crypto.randomUUID(), inv.workspace_id, userId, now2)
  ]);
  await db.batch(stmts);
  for (const inv of results) {
    await notifyManagers(db, {
      workspaceId: inv.workspace_id,
      kind: "member.joined",
      title: `${email} \u52A0\u5165\u4E86\u7A7A\u95F4`,
      body: "\u901A\u8FC7\u9080\u8BF7\u94FE\u63A5\u52A0\u5165\uFF08Access \u8EAB\u4EFD\u8BA4\u9886\uFF09",
      link: "/settings?tab=members"
    });
  }
  return results.map((r) => r.workspace_id);
}
__name(acceptPendingInvitations, "acceptPendingInvitations");
async function listUnboundUsers(db) {
  const { results } = await db.prepare(
    `SELECT u.id, u.name, u.email, u.created_at FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
     ORDER BY u.created_at DESC LIMIT 200`
  ).all();
  return results;
}
__name(listUnboundUsers, "listUnboundUsers");
async function listMembers(db, workspaceId) {
  const { results } = await db.prepare(
    `SELECT m.user_id, u.name, u.email, m.role, m.created_at FROM memberships m
     JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?1 ORDER BY m.created_at`
  ).bind(workspaceId).all();
  return results;
}
__name(listMembers, "listMembers");

// server/lib/crypto.ts
var enc = new TextEncoder();
function randomId() {
  return crypto.randomUUID();
}
__name(randomId, "randomId");
function randomToken(bytes = 16) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(randomToken, "randomToken");
function b64(d) {
  let s = "";
  for (const c of d) s += String.fromCharCode(c);
  return btoa(s);
}
__name(b64, "b64");
function unb64(s) {
  let std = s.replace(/-/g, "+").replace(/_/g, "/");
  const rem = std.length % 4;
  if (rem === 2) std += "==";
  else if (rem === 3) std += "=";
  return Uint8Array.from(atob(std), (c) => c.charCodeAt(0));
}
__name(unb64, "unb64");
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
__name(derive, "derive");
async function pbkdf2Hash(password, iterations = 1e5) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}
__name(pbkdf2Hash, "pbkdf2Hash");
async function pbkdf2Verify(password, stored) {
  try {
    const [, iters, saltB64, hashB64] = stored.split("$");
    if (!iters || !saltB64 || !hashB64) return false;
    const hash2 = b64(await derive(password, unb64(saltB64), Number(iters)));
    if (hash2.length !== hashB64.length) return false;
    let diff = 0;
    for (let i = 0; i < hash2.length; i++) diff |= hash2.charCodeAt(i) ^ hashB64.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
__name(pbkdf2Verify, "pbkdf2Verify");

// server/lib/nodes.ts
var now = /* @__PURE__ */ __name(() => Date.now(), "now");
function childPath(parent) {
  return `${parent.path}${parent.id}/`;
}
__name(childPath, "childPath");
function subtreePrefix(node) {
  return `${node.path}${node.id}/`;
}
__name(subtreePrefix, "subtreePrefix");
function subtreeRange(prefix) {
  return { lo: prefix, hi: `${prefix}g` };
}
__name(subtreeRange, "subtreeRange");
async function ensureRootDir(db, workspaceId) {
  const found = await db.prepare("SELECT * FROM nodes WHERE workspace_id = ?1 AND parent_id = '' AND name = '' LIMIT 1").bind(workspaceId).first();
  if (found) return found;
  const id = randomId();
  try {
    await db.prepare(
      "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,'','/','',1,NULL,NULL,NULL,?3,?3,NULL)"
    ).bind(id, workspaceId, now()).run();
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await db.prepare("SELECT * FROM nodes WHERE workspace_id = ?1 AND parent_id = '' AND name = '' LIMIT 1").bind(workspaceId).first();
      if (existing) return existing;
    }
    throw e;
  }
  return await db.prepare("SELECT * FROM nodes WHERE id = ?1").bind(id).first();
}
__name(ensureRootDir, "ensureRootDir");
async function resolveParent(db, workspaceId, parentId) {
  return parentId === "" ? ensureRootDir(db, workspaceId) : getNode(db, workspaceId, parentId);
}
__name(resolveParent, "resolveParent");
async function getNode(db, workspaceId, id) {
  return db.prepare("SELECT * FROM nodes WHERE id = ?1 AND workspace_id = ?2").bind(id, workspaceId).first();
}
__name(getNode, "getNode");
async function childByName(db, workspaceId, parentId, name, excludeId) {
  if (excludeId !== void 0) {
    return db.prepare("SELECT * FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2 AND name = ?3 AND deleted_at IS NULL AND id != ?4").bind(workspaceId, parentId, name, excludeId).first();
  }
  return db.prepare("SELECT * FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2 AND name = ?3 AND deleted_at IS NULL").bind(workspaceId, parentId, name).first();
}
__name(childByName, "childByName");
function validateNodeName(name) {
  if (typeof name !== "string" || !name.trim()) throw errors.badRequest("\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
  const n = name.trim();
  if (n.length > 255 || n === "." || n === ".." || /[\\/\x00-\x1f]/.test(n)) throw errors.badRequest("\u540D\u79F0\u4E0D\u5408\u6CD5");
  return n;
}
__name(validateNodeName, "validateNodeName");
async function createDir(db, workspaceId, parentId, name, parentHint) {
  const parent = parentHint ?? (parentId === "" ? await ensureRootDir(db, workspaceId) : await getNode(db, workspaceId, parentId));
  if (!parent || !parent.is_dir) throw errors.badRequest("\u76EE\u6807\u76EE\u5F55\u4E0D\u5B58\u5728");
  if (await childByName(db, workspaceId, parent.id, name)) throw errors.conflict();
  const id = randomId();
  try {
    await db.prepare(
      "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,1,NULL,NULL,NULL,?6,?6,NULL)"
    ).bind(id, workspaceId, parent.id, childPath(parent), name, now()).run();
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict();
    throw e;
  }
  return await db.prepare("SELECT * FROM nodes WHERE id = ?1").bind(id).first();
}
__name(createDir, "createDir");
async function listChildren(db, workspaceId, parentId) {
  const { results } = await db.prepare(
    "SELECT * FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2 AND deleted_at IS NULL ORDER BY is_dir DESC, name"
  ).bind(workspaceId, parentId).all();
  return results;
}
__name(listChildren, "listChildren");
async function breadcrumb(db, workspaceId, dirId) {
  const node = await getNode(db, workspaceId, dirId);
  if (!node) return [];
  const ids = [...node.path.split("/").filter(Boolean), node.id];
  const byId = /* @__PURE__ */ new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const ph = part.map(() => "?").join(",");
    const { results } = await db.prepare(`SELECT * FROM nodes WHERE id IN (${ph})`).bind(...part).all();
    for (const r of results) if (r.workspace_id === workspaceId) byId.set(r.id, r);
  }
  return ids.map((id) => byId.get(id)).filter((n) => !!n && n.name !== "");
}
__name(breadcrumb, "breadcrumb");
async function uniqueName(db, workspaceId, parentId, name, excludeId) {
  if (!await childByName(db, workspaceId, parentId, name, excludeId)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!await childByName(db, workspaceId, parentId, candidate, excludeId)) return candidate;
  }
}
__name(uniqueName, "uniqueName");
async function isDescendant(db, workspaceId, ancestorId, nodeId) {
  if (ancestorId === nodeId) return true;
  const { results } = await db.prepare(
    "SELECT id, path FROM nodes WHERE workspace_id = ?1 AND id IN (?2, ?3)"
  ).bind(workspaceId, ancestorId, nodeId).all();
  const a = results.find((r) => r.id === ancestorId);
  const n = results.find((r) => r.id === nodeId);
  if (!a || !n) return false;
  return n.path.startsWith(subtreePrefix(a));
}
__name(isDescendant, "isDescendant");
async function moveNode(db, workspaceId, id, newParentId, newName) {
  const node = await getNode(db, workspaceId, id);
  if (!node) throw errors.notFound();
  const parent = newParentId === "" ? await ensureRootDir(db, workspaceId) : await getNode(db, workspaceId, newParentId);
  if (!parent || !parent.is_dir) throw errors.badRequest("\u76EE\u6807\u76EE\u5F55\u4E0D\u5B58\u5728");
  const targetParentId = parent.id;
  if (node.is_dir && await isDescendant(db, workspaceId, id, targetParentId)) throw errors.badRequest("\u4E0D\u80FD\u79FB\u52A8\u5230\u81EA\u8EAB\u5B50\u76EE\u5F55");
  if (await childByName(db, workspaceId, targetParentId, newName, id)) throw errors.conflict();
  const newSelfPath = childPath(parent);
  const oldPrefix = subtreePrefix(node);
  const newPrefix = `${newSelfPath}${node.id}/`;
  const stmts = [
    db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2, updated_at = ?3, path = ?4 WHERE id = ?5 AND workspace_id = ?6").bind(targetParentId, newName, now(), newSelfPath, id, workspaceId)
  ];
  if (node.is_dir && oldPrefix !== newPrefix) {
    const { lo, hi } = subtreeRange(oldPrefix);
    stmts.push(
      db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE workspace_id = ?3 AND path >= ?4 AND path < ?5").bind(newPrefix, oldPrefix.length + 1, workspaceId, lo, hi)
    );
  }
  await db.batch(stmts);
}
__name(moveNode, "moveNode");
async function usedBytes(db, workspaceId) {
  const row = await db.prepare("SELECT used_bytes FROM workspaces WHERE id = ?1").bind(workspaceId).first();
  return row?.used_bytes ?? 0;
}
__name(usedBytes, "usedBytes");
async function adjustUsedBytes(db, workspaceId, delta) {
  if (!delta) return;
  await db.prepare("UPDATE workspaces SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(delta, workspaceId).run();
}
__name(adjustUsedBytes, "adjustUsedBytes");
async function assertQuota(db, workspaceId, extraBytes, defaultQuota = 10737418240) {
  const ws = await db.prepare("SELECT quota_bytes, used_bytes FROM workspaces WHERE id = ?1").bind(workspaceId).first();
  if ((ws?.used_bytes ?? 0) + extraBytes > (ws?.quota_bytes ?? defaultQuota)) throw errors.quotaExceeded();
}
__name(assertQuota, "assertQuota");

// server/lib/audit.ts
function auditStmt(db, ev) {
  return db.prepare(
    "INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, meta, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(
    crypto.randomUUID(),
    ev.workspaceId ?? null,
    ev.actorId,
    ev.action,
    ev.targetId ?? null,
    ev.meta === void 0 ? null : JSON.stringify(ev.meta),
    Date.now()
  );
}
__name(auditStmt, "auditStmt");
async function recordAudit(db, ev) {
  await auditStmt(db, ev).run();
}
__name(recordAudit, "recordAudit");

// server/lib/users.ts
function structuredWarn(message2, fields) {
  console.warn(JSON.stringify({ level: "warn", message: message2, ...fields }));
}
__name(structuredWarn, "structuredWarn");
async function bindOrProvision(env2, ident) {
  const db = env2.DB;
  if (ident.email) {
    const byEmail = await db.prepare("SELECT * FROM users WHERE email = ?1").bind(ident.email).first();
    if (byEmail) {
      if (byEmail.access_sub === ident.sub) {
        if (byEmail.access_bound_at === null) {
          const confirmedAt = Date.now();
          await db.prepare("UPDATE users SET access_bound_at = ?1 WHERE id = ?2").bind(confirmedAt, byEmail.id).run();
          return { ...byEmail, access_bound_at: confirmedAt };
        }
        return byEmail;
      }
      if (byEmail.access_bound_at !== null)
        throw new HttpError(409, "IDENTITY_CONFLICT", "\u8BE5\u90AE\u7BB1\u5DF2\u7ED1\u5B9A\u5176\u4ED6 Access \u8EAB\u4EFD");
      const subOwner = await db.prepare("SELECT id FROM users WHERE access_sub = ?1").bind(ident.sub).first();
      if (subOwner) throw new HttpError(409, "IDENTITY_CONFLICT", "\u8BE5 Access \u8EAB\u4EFD\u5DF2\u7ED1\u5B9A\u5176\u4ED6\u8D26\u53F7");
      const boundAt2 = Date.now();
      await db.prepare("UPDATE users SET access_sub = ?1, access_bound_at = ?2 WHERE id = ?3").bind(ident.sub, boundAt2, byEmail.id).run();
      structuredWarn("access_bind", { userId: byEmail.id, email: ident.email });
      return { ...byEmail, access_sub: ident.sub, access_bound_at: boundAt2 };
    }
  }
  const bySub = await db.prepare("SELECT * FROM users WHERE access_sub = ?1").bind(ident.sub).first();
  if (bySub) {
    if (bySub.access_bound_at === null) {
      const confirmedAt = Date.now();
      await db.prepare("UPDATE users SET access_bound_at = ?1 WHERE id = ?2").bind(confirmedAt, bySub.id).run();
      return { ...bySub, access_bound_at: confirmedAt };
    }
    return bySub;
  }
  if (env2.ACCESS_PROVISION !== "on") {
    structuredWarn("access_unknown_identity", { sub: ident.sub, email: ident.email });
    throw new HttpError(403, "ACCOUNT_NOT_PROVISIONED", "\u8D26\u53F7\u672A\u5F00\u901A\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458");
  }
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM users").first();
  const isFirstUser = n === 0;
  const id = randomToken(12);
  const name = ident.email ? ident.email.split("@")[0] : "user";
  const createdAt = Date.now();
  const boundAt = Date.now();
  try {
    await db.prepare(
      "INSERT INTO users (id, access_sub, email, access_bound_at, name, platform_admin, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
    ).bind(id, ident.sub, ident.email, boundAt, name, isFirstUser ? 1 : 0, createdAt).run();
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = ident.email ? await db.prepare("SELECT * FROM users WHERE access_sub = ?1 OR email = ?2").bind(ident.sub, ident.email).first() : await db.prepare("SELECT * FROM users WHERE access_sub = ?1").bind(ident.sub).first();
      if (existing) {
        if (existing.access_sub === ident.sub) return existing;
        throw new HttpError(409, "IDENTITY_CONFLICT", "\u8BE5\u90AE\u7BB1\u5DF2\u7ED1\u5B9A\u5176\u4ED6 Access \u8EAB\u4EFD");
      }
    }
    throw e;
  }
  return {
    id,
    access_sub: ident.sub,
    email: ident.email,
    access_bound_at: boundAt,
    name,
    platform_admin: isFirstUser ? 1 : 0,
    created_at: createdAt,
    disabled_at: null
  };
}
__name(bindOrProvision, "bindOrProvision");

// server/middleware/access.ts
var cached = null;
function jwksFor(env2) {
  if (env2.ACCESS_CERTS_JSON) return createLocalJWKSet(JSON.parse(env2.ACCESS_CERTS_JSON));
  if (!cached || cached.domain !== env2.ACCESS_TEAM_DOMAIN) {
    cached = {
      domain: env2.ACCESS_TEAM_DOMAIN,
      jwks: createRemoteJWKSet(new URL(`${env2.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`))
    };
  }
  return cached.jwks;
}
__name(jwksFor, "jwksFor");
async function resolveIdentity(c) {
  if (c.env.AUTH_MODE === "dev") {
    if (c.req.header("cf-ray")) throw errors.forbidden("dev \u8BA4\u8BC1\u6A21\u5F0F\u4E0D\u80FD\u5728\u771F\u5B9E\u8FB9\u7F18\u8FD0\u884C");
    const email2 = (c.req.header("x-dev-email") ?? c.env.DEV_AUTH_EMAIL ?? "").trim().toLowerCase();
    if (!email2) throw errors.unauthorized();
    return { sub: `dev:${email2}`, email: email2 };
  }
  if (c.env.ACCESS_CERTS_JSON && c.req.header("cf-ray")) {
    throw errors.forbidden("\u6D4B\u8BD5 JWKS \u4E0D\u80FD\u5728\u771F\u5B9E\u8FB9\u7F18\u8FD0\u884C");
  }
  const token = c.req.header("cf-access-jwt-assertion");
  if (!token) throw errors.unauthorized();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwksFor(c.env), {
      issuer: c.env.ACCESS_TEAM_DOMAIN,
      audience: c.env.ACCESS_AUD,
      algorithms: ["RS256"],
      // 显式限定防算法混淆；requiredClaims 强制 exp 存在，存在时 jose 自动校验时效
      requiredClaims: ["exp"]
    }));
  } catch {
    throw errors.unauthorized();
  }
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw errors.unauthorized();
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  return { sub, email };
}
__name(resolveIdentity, "resolveIdentity");
function csrfGuard(c) {
  if (c.req.method === "GET" || c.req.method === "HEAD") return;
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw errors.forbidden("\u8DE8\u7AD9\u8BF7\u6C42\u88AB\u62D2\u7EDD");
  const origin = c.req.header("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).origin === new URL(c.req.url).origin;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) throw errors.forbidden("\u8DE8\u7AD9\u8BF7\u6C42\u88AB\u62D2\u7EDD");
  }
}
__name(csrfGuard, "csrfGuard");
async function accessMiddleware(c, next) {
  const ident = await resolveIdentity(c);
  csrfGuard(c);
  let user = await bindOrProvision(c.env, ident);
  if (user.disabled_at) throw errors.forbidden("\u8D26\u53F7\u5DF2\u88AB\u505C\u7528");
  c.set("selfId", user.id);
  c.set("selfUser", user);
  const actAs = c.req.header("x-act-as");
  if (actAs && user.platform_admin === 1) {
    const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(actAs).first();
    if (!target) throw errors.notFound();
    if (target.disabled_at) throw errors.forbidden("\u76EE\u6807\u7528\u6237\u5DF2\u505C\u7528");
    user = target;
    await recordAudit(c.env.DB, { actorId: c.get("selfId"), action: "admin.act_as", targetId: target.id });
  }
  c.set("user", user);
  const requested = c.req.header("x-workspace") ?? null;
  let resolved;
  try {
    resolved = await resolveWorkspace(c.env.DB, user.id, requested);
  } catch (e) {
    if (requested || !(e instanceof HttpError) || e.status !== 404) throw e;
    const joined = await acceptPendingInvitations(c.env.DB, user.id, user.email);
    if (joined.length) {
      resolved = await resolveWorkspace(c.env.DB, user.id, null);
    } else {
      const created = await ensurePersonalWorkspace(c.env.DB, user.id);
      await ensureRootDir(c.env.DB, created.id);
      resolved = { workspace: created, role: "owner" };
    }
  }
  c.set("workspace", resolved.workspace);
  c.set("role", resolved.role);
  await next();
}
__name(accessMiddleware, "accessMiddleware");

// server/lib/settings.ts
async function getSetting(env2, key) {
  const row = await env2.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first();
  return row?.value ?? null;
}
__name(getSetting, "getSetting");

// server/data/storage.ts
function storageDeltaStmt(db, workspaceId, delta) {
  const active = delta.active ?? 0;
  const trash2 = delta.trash ?? 0;
  const thumb = delta.thumb ?? 0;
  return db.prepare(
    `INSERT INTO storage_stats (workspace_id, active_bytes, trash_bytes, thumb_bytes, updated_at)
       VALUES (?1, MAX(0, ?2), MAX(0, ?3), MAX(0, ?5), ?4)
       ON CONFLICT (workspace_id) DO UPDATE SET
         active_bytes = MAX(0, storage_stats.active_bytes + ?2),
         trash_bytes  = MAX(0, storage_stats.trash_bytes + ?3),
         thumb_bytes  = MAX(0, storage_stats.thumb_bytes + ?5),
         updated_at   = excluded.updated_at`
  ).bind(workspaceId, active, trash2, Date.now(), thumb);
}
__name(storageDeltaStmt, "storageDeltaStmt");
function recomputeStorageStatsStmt(db, workspaceId) {
  return db.prepare(
    `INSERT INTO storage_stats (workspace_id, active_bytes, trash_bytes, updated_at)
       SELECT ?1,
         (SELECT COALESCE(SUM(size), 0) FROM nodes WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NULL),
         (SELECT COALESCE(SUM(size), 0) FROM nodes WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NOT NULL),
         ?2
       WHERE true
       ON CONFLICT (workspace_id) DO UPDATE SET
         active_bytes = excluded.active_bytes,
         trash_bytes  = excluded.trash_bytes,
         updated_at   = excluded.updated_at`
  ).bind(workspaceId, Date.now());
}
__name(recomputeStorageStatsStmt, "recomputeStorageStatsStmt");
async function recomputeStorageStats(db, workspaceId) {
  await recomputeStorageStatsStmt(db, workspaceId).run();
}
__name(recomputeStorageStats, "recomputeStorageStats");
async function readStorageStats(db, workspaceId) {
  const row = await db.prepare("SELECT active_bytes, trash_bytes, version_bytes, thumb_bytes FROM storage_stats WHERE workspace_id = ?1").bind(workspaceId).first();
  return row ?? { active_bytes: 0, trash_bytes: 0, version_bytes: 0, thumb_bytes: 0 };
}
__name(readStorageStats, "readStorageStats");
var DEFAULT_GLOBAL_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
async function globalQuotaBytes(env2) {
  const configured = await getSetting(env2, "global_quota_bytes");
  const parsed = configured === null ? NaN : Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GLOBAL_QUOTA_BYTES;
}
__name(globalQuotaBytes, "globalQuotaBytes");
function storageFullError(used, quota) {
  return new HttpError(507, "STORAGE_FULL", `\u7AD9\u70B9\u5B58\u50A8\u5DF2\u6EE1\uFF08${used}/${quota} \u5B57\u8282\uFF09\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u6269\u5BB9\u6216\u6E05\u7406\u56DE\u6536\u7AD9`);
}
__name(storageFullError, "storageFullError");
async function assertGlobalBudget(env2, extraBytes) {
  const quota = await globalQuotaBytes(env2);
  const row = await env2.DB.prepare("SELECT COALESCE(SUM(used_bytes), 0) AS total FROM workspaces").first();
  const used = row?.total ?? 0;
  if (used + extraBytes > quota) throw storageFullError(used, quota);
}
__name(assertGlobalBudget, "assertGlobalBudget");
async function notifyIfStorageLevelHigh(env2, workspaceId) {
  const ws = await env2.DB.prepare("SELECT used_bytes, quota_bytes FROM workspaces WHERE id = ?1").bind(workspaceId).first();
  if (!ws || ws.quota_bytes <= 0) return;
  const level = storageLevel(ws.used_bytes, ws.quota_bytes);
  if (level !== "critical" && level !== "full") return;
  const pct = Math.round(ws.used_bytes / ws.quota_bytes * 100);
  await notifyManagers(env2.DB, {
    workspaceId,
    kind: "storage.high",
    title: pct >= 100 ? "\u7A7A\u95F4\u5DF2\u6EE1" : `\u7A7A\u95F4\u4F7F\u7528\u5DF2\u8FBE ${pct}%`,
    body: "\u6E05\u7406\u56DE\u6536\u7AD9\u6216\u8C03\u6574\u914D\u989D\u540E\u53EF\u7EE7\u7EED\u4E0A\u4F20",
    link: "/settings",
    dedupe: true
  });
}
__name(notifyIfStorageLevelHigh, "notifyIfStorageLevelHigh");
function storageLevel(usedBytes2, quotaBytes) {
  if (quotaBytes <= 0) return "ok";
  const ratio = usedBytes2 / quotaBytes;
  if (ratio >= 1) return "full";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "warn";
  return "ok";
}
__name(storageLevel, "storageLevel");

// server/data/trash.ts
async function subtreeFileSizeSum(db, workspaceId, node, phase) {
  const { lo, hi } = subtreeRange(subtreePrefix(node));
  const { results } = await db.prepare(`
    SELECT COALESCE(SUM(size), 0) AS total FROM nodes
    WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL
    AND deleted_at IS ${phase === "soft" ? "NULL" : "NOT NULL"}
    AND (id = ?2 OR (path >= ?3 AND path < ?4))
  `).bind(workspaceId, node.id, lo, hi).all();
  return results[0]?.total ?? 0;
}
__name(subtreeFileSizeSum, "subtreeFileSizeSum");
async function softDeleteNode(db, workspaceId, id) {
  const node = await getNode(db, workspaceId, id);
  if (!node || node.deleted_at) throw errors.notFound();
  if (node.name === "") throw errors.badRequest("\u4E0D\u80FD\u5220\u9664\u6839\u76EE\u5F55");
  const now2 = Date.now();
  const { lo, hi } = subtreeRange(subtreePrefix(node));
  await db.batch([
    db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE workspace_id = ?2 AND deleted_at IS NULL AND (id = ?3 OR (path >= ?4 AND path < ?5))`).bind(now2, workspaceId, node.id, lo, hi),
    db.prepare("UPDATE workspaces SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(
      -await subtreeFileSizeSum(db, workspaceId, node, "soft"),
      workspaceId
    )
  ]);
}
__name(softDeleteNode, "softDeleteNode");
async function permanentDeleteNode(env2, workspaceId, id) {
  await permanentDeleteMany(env2, workspaceId, [id]);
}
__name(permanentDeleteNode, "permanentDeleteNode");
async function permanentDeleteMany(env2, workspaceId, ids) {
  if (!ids.length) return 0;
  const { results: roots } = await env2.DB.prepare(
    `SELECT id, path, is_dir FROM nodes WHERE workspace_id = ?1 AND deleted_at IS NOT NULL AND id IN ${jsonSet()}`
  ).bind(workspaceId, jsonList(ids)).all();
  if (!roots.length) return 0;
  const selects = [
    env2.DB.prepare(
      `SELECT id, r2_key FROM nodes WHERE workspace_id = ?1 AND id IN ${jsonSet()}`
    ).bind(workspaceId, jsonList(roots.map((r) => r.id)))
  ];
  for (const part of chunk(roots.filter((r) => r.is_dir), DIRS_PER_STMT)) {
    const ranges = part.flatMap((d) => {
      const { lo, hi } = subtreeRange(subtreePrefix(d));
      return [lo, hi];
    });
    const clause = `id IN ${jsonSet()} OR ${part.map(() => "(path >= ? AND path < ?)").join(" OR ")}`;
    selects.push(
      env2.DB.prepare(`SELECT id, r2_key FROM nodes WHERE workspace_id = ?1 AND (${clause})`).bind(workspaceId, jsonList(part.map((d) => d.id)), ...ranges)
    );
  }
  const readResults = await env2.DB.batch(selects);
  const all = [];
  const r2Keys = /* @__PURE__ */ new Set();
  for (const result of readResults) {
    for (const row of result.results) {
      all.push(row.id);
      if (row.r2_key) r2Keys.add(row.r2_key);
    }
  }
  const now2 = Date.now();
  const writes = [];
  for (const part of chunk([...new Set(all)], 5e3)) {
    const partJson = jsonList(part);
    writes.push(
      env2.DB.prepare(`DELETE FROM shares WHERE node_id IN ${jsonSet()}`).bind(partJson),
      env2.DB.prepare(`DELETE FROM nodes WHERE id IN ${jsonSet()}`).bind(partJson)
    );
  }
  if (r2Keys.size) {
    for (const part of chunk([...r2Keys], 5e3)) {
      writes.push(
        env2.DB.prepare("INSERT OR REPLACE INTO orphan_objects (r2_key, queued_at) SELECT value, ? FROM json_each(?)").bind(now2, jsonList(part))
      );
    }
  }
  await env2.DB.batch(writes);
  return roots.length;
}
__name(permanentDeleteMany, "permanentDeleteMany");
var ORPHAN_GRACE_MS = 60 * 60 * 1e3;
async function sweepOrphanObjects(env2, graceMs = ORPHAN_GRACE_MS) {
  const cutoff = Date.now() - graceMs;
  const { results } = await env2.DB.prepare(`
    SELECT o.r2_key, (SELECT COUNT(*) FROM nodes n WHERE n.r2_key = o.r2_key) AS refs
    FROM orphan_objects o WHERE o.queued_at < ?1 LIMIT 500
  `).bind(cutoff).all();
  if (!results.length) return 0;
  const dead = results.filter((r) => r.refs === 0).map((r) => r.r2_key);
  if (dead.length) await env2.BUCKET.delete(dead);
  await env2.DB.prepare(`DELETE FROM orphan_objects WHERE r2_key IN ${jsonSet()}`).bind(jsonList(results.map((r) => r.r2_key))).run();
  return dead.length;
}
__name(sweepOrphanObjects, "sweepOrphanObjects");
async function softDeleteMany(db, workspaceId, ids) {
  if (!ids.length) return 0;
  const { results: rows } = await db.prepare(
    `SELECT id, name, is_dir, path FROM nodes WHERE workspace_id = ?1 AND deleted_at IS NULL AND id IN ${jsonSet()}`
  ).bind(workspaceId, jsonList(ids)).all();
  const valid = rows.filter((r) => r.name !== "");
  if (!valid.length) return 0;
  const now2 = Date.now();
  const dirPrefixes = valid.filter((r) => r.is_dir).map((r) => subtreePrefix(r));
  const own = valid.filter((n) => !dirPrefixes.some((p) => n.path.startsWith(p)));
  const ownJson = jsonList(own.map((n) => n.id));
  const ownedDirs = own.filter((n) => n.is_dir);
  const quotaStmt = /* @__PURE__ */ __name((predicate) => db.prepare(`UPDATE workspaces SET used_bytes = MAX(0, used_bytes - (
        SELECT COALESCE(SUM(size), 0) FROM nodes
        WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NULL AND (${predicate})
      )) WHERE id = ?1`), "quotaStmt");
  const stmts = [
    quotaStmt(`id IN ${jsonSet()}`).bind(workspaceId, ownJson),
    db.prepare(`UPDATE nodes SET deleted_at = ? WHERE workspace_id = ? AND deleted_at IS NULL AND id IN ${jsonSet()}`).bind(now2, workspaceId, ownJson)
  ];
  for (const part of chunk(ownedDirs, DIRS_PER_STMT)) {
    const ranges = part.flatMap((d) => {
      const { lo, hi } = subtreeRange(subtreePrefix(d));
      return [lo, hi];
    });
    const clause = `id IN ${jsonSet()} OR ${part.map(() => "(path >= ? AND path < ?)").join(" OR ")}`;
    const partJson = jsonList(part.map((d) => d.id));
    stmts.push(
      quotaStmt(clause).bind(workspaceId, partJson, ...ranges),
      db.prepare(`UPDATE nodes SET deleted_at = ? WHERE workspace_id = ? AND deleted_at IS NULL AND (${clause})`).bind(now2, workspaceId, partJson, ...ranges)
    );
  }
  await db.batch(stmts);
  return valid.length;
}
__name(softDeleteMany, "softDeleteMany");
async function moveMany(db, workspaceId, ids, newParentId) {
  if (!ids.length) return 0;
  const parent = await resolveParent(db, workspaceId, newParentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const targetParentId = parent.id;
  const { results: sel } = await db.prepare(
    `SELECT * FROM nodes WHERE workspace_id = ?1 AND deleted_at IS NULL AND id IN ${jsonSet()}`
  ).bind(workspaceId, jsonList(ids)).all();
  if (!sel.length) return 0;
  for (const dir3 of sel.filter((s) => s.is_dir)) {
    if (await isDescendant(db, workspaceId, dir3.id, targetParentId)) throw errors.badRequest("\u4E0D\u80FD\u79FB\u52A8\u5230\u81EA\u8EAB\u5B50\u76EE\u5F55");
  }
  const idSet = new Set(sel.map((s) => s.id));
  {
    const { results } = await db.prepare(
      `SELECT id FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2 AND deleted_at IS NULL AND name IN ${jsonSet()}`
    ).bind(workspaceId, targetParentId, jsonList(sel.map((s) => s.name))).all();
    if (results.some((r) => !idSet.has(r.id))) throw errors.conflict();
  }
  const now2 = Date.now();
  const parentPath = childPath(parent);
  const stmts = sel.map(
    (s) => db.prepare("UPDATE nodes SET parent_id = ?1, updated_at = ?2, path = ?3 WHERE workspace_id = ?4 AND id = ?5").bind(targetParentId, now2, parentPath, workspaceId, s.id)
  );
  for (const dir3 of sel.filter((s) => s.is_dir)) {
    const oldPrefix = subtreePrefix(dir3);
    const newPrefix = `${parentPath}${dir3.id}/`;
    if (oldPrefix !== newPrefix) {
      const { lo, hi } = subtreeRange(oldPrefix);
      stmts.push(db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE workspace_id = ?3 AND path >= ?4 AND path < ?5").bind(newPrefix, oldPrefix.length + 1, workspaceId, lo, hi));
    }
  }
  await db.batch(stmts);
  return sel.length;
}
__name(moveMany, "moveMany");
async function purgeExpiredTrash(env2) {
  const configured = await getSetting(env2, "trash_retention_days");
  const days = Number(configured ?? env2.TRASH_RETENTION_DAYS);
  const cutoff = Date.now() - days * 864e5;
  const { results } = await env2.DB.prepare(
    "SELECT id, workspace_id FROM nodes WHERE deleted_at IS NOT NULL AND deleted_at < ?1"
  ).bind(cutoff).all();
  for (const r of results) {
    try {
      await permanentDeleteNode(env2, r.workspace_id, r.id);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) continue;
      console.warn("purgeExpiredTrash: \u6E05\u7406\u8282\u70B9\u5931\u8D25", r.id, e);
    }
  }
  const { results: wsRows } = await env2.DB.prepare("SELECT id FROM workspaces").all();
  if (wsRows.length) await env2.DB.batch(wsRows.map((w) => recomputeStorageStatsStmt(env2.DB, w.id)));
}
__name(purgeExpiredTrash, "purgeExpiredTrash");
async function restoreTrashNode(db, workspaceId, id) {
  const node = await getNode(db, workspaceId, id);
  if (!node || !node.deleted_at) throw errors.notFound();
  let targetParent = await getNode(db, workspaceId, node.parent_id);
  if (!targetParent || targetParent.deleted_at) targetParent = await ensureRootDir(db, workspaceId);
  const targetParentId = targetParent.id;
  const name = await uniqueName(db, workspaceId, targetParentId, node.name, node.id);
  let newPath = node.path;
  if (targetParentId !== node.parent_id) {
    newPath = childPath(targetParent);
  }
  const oldPrefix = subtreePrefix(node);
  const newPrefix = `${newPath}${node.id}/`;
  const restored = await subtreeFileSizeSum(db, workspaceId, node, "restore");
  const { lo, hi } = subtreeRange(oldPrefix);
  const statements = [
    db.prepare("UPDATE nodes SET deleted_at = NULL WHERE workspace_id = ?1 AND (id = ?2 OR (path >= ?3 AND path < ?4))").bind(workspaceId, node.id, lo, hi),
    db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2, path = ?3, updated_at = ?4 WHERE id = ?5").bind(targetParentId, name, newPath, Date.now(), node.id),
    ...node.is_dir && oldPrefix !== newPrefix ? [db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE workspace_id = ?3 AND path >= ?4 AND path < ?5").bind(newPrefix, oldPrefix.length + 1, workspaceId, lo, hi)] : [],
    db.prepare("UPDATE workspaces SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(restored, workspaceId)
  ];
  try {
    await db.batch(statements);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    throw errors.conflict();
  }
}
__name(restoreTrashNode, "restoreTrashNode");
function parseIds(body) {
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((id) => typeof id !== "string" || !id)) {
    throw errors.badRequest("ids \u5FC5\u987B\u4E3A 1-500 \u4E2A\u8282\u70B9 id");
  }
  return ids;
}
__name(parseIds, "parseIds");

// server/lib/serve.ts
var UNSAFE_INLINE = ["text/html", "image/svg+xml", "application/xhtml+xml"];
async function serveObject(c, node) {
  if (!node.r2_key) throw errors.notFound();
  const mime = (node.mime ?? "application/octet-stream").toLowerCase();
  const bare = mime.split(";")[0].trim();
  const disposition = c.req.query("dl") === "1" || UNSAFE_INLINE.includes(bare) ? "attachment" : "inline";
  const encodedName = encodeURIComponent(node.name).replace(/[!'()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());
  const base = {
    "content-type": node.mime ?? "application/octet-stream",
    "accept-ranges": "bytes",
    etag: `"${node.id}"`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "cache-control": "private, no-cache",
    "content-disposition": `${disposition}; filename*=UTF-8''${encodedName}`
  };
  if (bare.startsWith("image/")) base["cache-control"] = "private, max-age=31536000, immutable";
  const rangeHeader = c.req.header("range")?.toLowerCase();
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;
  if (m && m[1] === "" && m[2] === "") throw new HttpError(416, "RANGE_INVALID", "Range \u4E0D\u5408\u6CD5");
  const size = node.size ?? 0;
  let offset = 0;
  let length;
  let range;
  if (m) {
    if (m[1] === "") {
      length = Math.min(Number(m[2]), size);
      offset = size - length;
    } else {
      offset = Number(m[1]);
      length = m[2] === "" ? void 0 : Math.min(Number(m[2]) - offset + 1, size - offset);
    }
    if (offset >= size || length !== void 0 && length <= 0) throw new HttpError(416, "RANGE_INVALID", "Range \u8D8A\u754C");
    range = length !== void 0 ? { offset, length } : { offset };
  }
  const obj = range ? await c.env.BUCKET.get(node.r2_key, { range }) : await c.env.BUCKET.get(node.r2_key);
  if (!obj) throw errors.notFound();
  if (!range) return new Response(obj.body, { status: 200, headers: { ...base, "content-length": String(obj.size) } });
  const actualLen = length ?? size - offset;
  const end = offset + actualLen - 1;
  return new Response(obj.body, {
    status: 206,
    headers: { ...base, "content-range": `bytes ${offset}-${end}/${size}`, "content-length": String(actualLen) }
  });
}
__name(serveObject, "serveObject");

// server/data/shares.ts
var DEDUPE_WINDOW_MS2 = 10 * 6e4;
async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function sourceFingerprint(c) {
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
  const ua = c.req.header("user-agent") ?? "unknown";
  return { ipHash: await sha256Hex(ip), uaHash: await sha256Hex(ua) };
}
__name(sourceFingerprint, "sourceFingerprint");
async function takeDownloadSlot(c, share) {
  const now2 = Date.now();
  const { ipHash, uaHash } = await sourceFingerprint(c);
  const bucket = Math.floor(now2 / DEDUPE_WINDOW_MS2);
  const dedupeKey = await sha256Hex(`${share.id}|${ipHash}|${uaHash}|${bucket}`);
  const inserted = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO share_downloads (id, workspace_id, share_id, ip_hash, ua_hash, dedupe_key, success, created_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7)"
  ).bind(crypto.randomUUID(), share.workspace_id, share.id, ipHash, uaHash, dedupeKey, now2).run();
  if (!inserted.meta.changes) return { result: "deduped", dedupeKey };
  const res = await c.env.DB.prepare(
    `UPDATE shares SET downloads = downloads + 1, last_download_at = ?1
     WHERE id = ?2 AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?1)
       AND (max_downloads IS NULL OR downloads < max_downloads)`
  ).bind(now2, share.id).run();
  if (!res.meta.changes) {
    await c.env.DB.prepare("DELETE FROM share_downloads WHERE dedupe_key = ?1").bind(dedupeKey).run();
    throw new HttpError(410, "SHARE_EXHAUSTED", "\u5206\u4EAB\u4E0B\u8F7D\u6B21\u6570\u5DF2\u7528\u5B8C\u6216\u5DF2\u5931\u6548");
  }
  return { result: "counted", dedupeKey };
}
__name(takeDownloadSlot, "takeDownloadSlot");
async function releaseDownloadSlot(c, share, dedupeKey) {
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE shares SET downloads = MAX(0, downloads - 1) WHERE id = ?1").bind(share.id),
    c.env.DB.prepare("DELETE FROM share_downloads WHERE dedupe_key = ?1").bind(dedupeKey)
  ]);
}
__name(releaseDownloadSlot, "releaseDownloadSlot");
function isDownloadIntent(c) {
  return c.req.query("dl") === "1" && !c.req.header("range");
}
__name(isDownloadIntent, "isDownloadIntent");

// server/routes/shares.ts
var shares = new Hono2();
shares.post("/", async (c) => {
  const { nodeId, expiresInDays, password, maxDownloads, oneTime } = await c.req.json();
  const node = await getNode(c.env.DB, c.get("workspace").id, nodeId);
  if (!node || node.deleted_at) throw errors.notFound();
  if (expiresInDays !== void 0 && (!Number.isFinite(expiresInDays) || expiresInDays <= 0)) {
    throw errors.badRequest("\u6709\u6548\u671F\u987B\u4E3A\u6B63\u6570\u5929\u6570");
  }
  const limit = oneTime ? 1 : maxDownloads;
  if (limit !== void 0 && (!Number.isInteger(limit) || limit < 1 || limit > 1e4)) {
    throw errors.badRequest("maxDownloads \u987B\u4E3A 1-10000 \u7684\u6574\u6570");
  }
  const token = randomToken(16);
  const passwordHash = password ? await pbkdf2Hash(password) : null;
  const expiresAt = expiresInDays ? Date.now() + expiresInDays * 864e5 : null;
  await c.env.DB.prepare(
    "INSERT INTO shares (id, workspace_id, node_id, token, password_hash, expires_at, max_downloads, downloads, created_at, revoked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,NULL)"
  ).bind(randomToken(12), c.get("workspace").id, nodeId, token, passwordHash, expiresAt, limit ?? null, Date.now()).run();
  return c.json({ token, url: `${c.env.PUBLIC_URL}/s/${token}` }, 201);
});
shares.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, n.name AS node_name, n.is_dir AS node_is_dir, n.size AS node_size
     FROM shares s CROSS JOIN nodes n ON n.id = s.node_id
     WHERE n.workspace_id = ?1 AND s.revoked_at IS NULL ORDER BY s.created_at DESC`
  ).bind(c.get("workspace").id).all();
  return c.json({ shares: results });
});
shares.delete("/:id", async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE shares SET revoked_at = ?1
     WHERE id = ?2 AND node_id IN (SELECT id FROM nodes WHERE workspace_id = ?3)`
  ).bind(Date.now(), c.req.param("id"), c.get("workspace").id).run();
  if (!res.meta.changes) throw errors.notFound();
  return c.json({ ok: true });
});
shares.post("/batch-revoke", async (c) => {
  const ids = parseIds(await c.req.json());
  const userId = c.get("workspace").id;
  let revoked = 0;
  const failed = [];
  for (const id of ids) {
    const res = await c.env.DB.prepare(
      `UPDATE shares SET revoked_at = ?1
       WHERE id = ?2 AND node_id IN (SELECT id FROM nodes WHERE workspace_id = ?3)`
    ).bind(Date.now(), id, userId).run();
    if (res.meta.changes) revoked++;
    else failed.push({ id, reason: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
  }
  return c.json({ ok: true, revoked, failed });
});
var publicShares = new Hono2();
async function loadShare(c, token) {
  const share = await c.env.DB.prepare("SELECT * FROM shares WHERE token = ?1").bind(token).first();
  if (!share || share.revoked_at) throw errors.notFound();
  if (share.expires_at && Date.now() > share.expires_at) throw new HttpError(410, "SHARE_EXPIRED", "\u5206\u4EAB\u5DF2\u8FC7\u671F");
  const node = await c.env.DB.prepare("SELECT * FROM nodes WHERE id = ?1 AND deleted_at IS NULL").bind(share.node_id).first();
  if (!node) throw errors.notFound();
  if (share.password_hash) {
    const pw = c.req.header("x-share-password");
    if (!pw || !await pbkdf2Verify(pw, share.password_hash)) {
      throw new HttpError(401, "SHARE_PASSWORD", "\u9700\u8981\u63D0\u53D6\u7801");
    }
  }
  return { share, node };
}
__name(loadShare, "loadShare");
publicShares.get("/:token", async (c) => {
  const { share, node } = await loadShare(c, c.req.param("token"));
  const base = {
    id: node.id,
    name: node.name,
    isDir: !!node.is_dir,
    size: node.size,
    mime: node.mime,
    hasPassword: !!share.password_hash,
    expiresAt: share.expires_at
  };
  if (!node.is_dir) return c.json(base);
  const children = await listChildren(c.env.DB, node.workspace_id, node.id);
  return c.json({
    ...base,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime }))
  });
});
publicShares.on(["GET", "HEAD"], "/:token/raw/:fileId", async (c) => {
  const { share, node } = await loadShare(c, c.req.param("token"));
  const fileId = c.req.param("fileId");
  const target = await getNode(c.env.DB, node.workspace_id, fileId);
  if (!target || target.is_dir || target.deleted_at || !await isDescendant(c.env.DB, node.workspace_id, node.id, fileId)) {
    throw errors.notFound();
  }
  const isHead = c.req.method === "HEAD";
  const slot = !isHead && isDownloadIntent(c) ? await takeDownloadSlot(c, share) : null;
  let res;
  try {
    res = await serveObject(c, target);
  } catch (e) {
    if (slot) await releaseDownloadSlot(c, share, slot.dedupeKey);
    throw e;
  }
  if (isHead) return new Response(null, { status: res.status, headers: res.headers });
  return res;
});
publicShares.get("/:token/children/:dirId", async (c) => {
  const { node } = await loadShare(c, c.req.param("token"));
  if (!node.is_dir) throw errors.notFound();
  const dirId = c.req.param("dirId");
  if (!await isDescendant(c.env.DB, node.workspace_id, node.id, dirId)) throw errors.notFound();
  const dir3 = await getNode(c.env.DB, node.workspace_id, dirId);
  if (!dir3 || !dir3.is_dir || dir3.deleted_at) throw errors.notFound();
  const children = await listChildren(c.env.DB, node.workspace_id, dirId);
  return c.json({
    name: dir3.name,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime }))
  });
});

// server/routes/workspaces.ts
var workspaces = new Hono2();
function requireManager(role) {
  if (role !== "owner" && role !== "admin") throw errors.forbidden("\u9700\u8981\u7A7A\u95F4\u7BA1\u7406\u5458\u6743\u9650");
}
__name(requireManager, "requireManager");
workspaces.get("/", async (c) => {
  const list = await listMemberships(c.env.DB, c.get("user").id);
  return c.json({
    current: { id: c.get("workspace").id, name: c.get("workspace").name, role: c.get("role") },
    workspaces: list.map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, role }))
  });
});
workspaces.get("/members", async (c) => {
  const members = await listMembers(c.env.DB, c.get("workspace").id);
  return c.json({ members });
});
workspaces.get("/invitations", async (c) => {
  requireManager(c.get("role"));
  return c.json({ invitations: await listInvitations(c.env.DB, c.get("workspace").id) });
});
workspaces.post("/invitations", async (c) => {
  requireManager(c.get("role"));
  const { email, role = "member" } = await c.req.json();
  if (typeof email !== "string" || !email.trim()) throw errors.badRequest("email \u5FC5\u586B");
  if (role !== "member" && role !== "admin") throw errors.badRequest("role \u53EA\u80FD\u662F member \u6216 admin");
  const created = await createInvitation(c.env.DB, c.get("workspace").id, email, role, c.get("user").id);
  return c.json({ token: created.token, expiresAt: created.expiresAt, url: c.env.PUBLIC_URL + "/?invite=" + created.token }, 201);
});
workspaces.delete("/invitations/:token", async (c) => {
  requireManager(c.get("role"));
  await revokeInvitation(c.env.DB, c.get("workspace").id, c.req.param("token"), c.get("user").id);
  return c.json({ ok: true });
});

// server/data/library.ts
var VIEW_THROTTLE_MS = 5 * 6e4;
async function requireLiveNode(db, workspaceId, nodeId) {
  const row = await db.prepare("SELECT 1 AS hit FROM nodes WHERE id = ?1 AND workspace_id = ?2 AND deleted_at IS NULL").bind(nodeId, workspaceId).first();
  if (!row) throw errors.notFound();
}
__name(requireLiveNode, "requireLiveNode");
async function addFavorite(db, workspaceId, userId, nodeId) {
  await requireLiveNode(db, workspaceId, nodeId);
  await db.prepare("INSERT OR IGNORE INTO favorites (workspace_id, user_id, node_id, created_at) VALUES (?1,?2,?3,?4)").bind(workspaceId, userId, nodeId, Date.now()).run();
}
__name(addFavorite, "addFavorite");
async function removeFavorite(db, workspaceId, userId, nodeId) {
  await db.prepare("DELETE FROM favorites WHERE workspace_id = ?1 AND user_id = ?2 AND node_id = ?3").bind(workspaceId, userId, nodeId).run();
}
__name(removeFavorite, "removeFavorite");
async function listFavorites(db, workspaceId, userId, limit = 100) {
  const { results } = await db.prepare(
    `SELECT n.* FROM favorites f JOIN nodes n ON n.id = f.node_id
       WHERE f.workspace_id = ?1 AND f.user_id = ?2 AND n.deleted_at IS NULL
       ORDER BY f.created_at DESC LIMIT ?3`
  ).bind(workspaceId, userId, limit).all();
  return results;
}
__name(listFavorites, "listFavorites");
async function recordView(db, workspaceId, userId, nodeId) {
  await requireLiveNode(db, workspaceId, nodeId);
  const now2 = Date.now();
  await db.prepare(
    `INSERT INTO node_views (workspace_id, user_id, node_id, viewed_at) VALUES (?1,?2,?3,?4)
       ON CONFLICT (workspace_id, user_id, node_id) DO UPDATE SET viewed_at = excluded.viewed_at
       WHERE node_views.viewed_at < excluded.viewed_at - ?5`
  ).bind(workspaceId, userId, nodeId, now2, VIEW_THROTTLE_MS).run();
}
__name(recordView, "recordView");
async function listRecent(db, workspaceId, userId, limit = 20) {
  const { results } = await db.prepare(
    `SELECT n.* FROM node_views v JOIN nodes n ON n.id = v.node_id
       WHERE v.workspace_id = ?1 AND v.user_id = ?2 AND n.deleted_at IS NULL
       ORDER BY v.viewed_at DESC LIMIT ?3`
  ).bind(workspaceId, userId, limit).all();
  return results;
}
__name(listRecent, "listRecent");

// server/data/tags.ts
var MAX_NAME = 32;
function normalizeName(raw2) {
  if (typeof raw2 !== "string") throw errors.badRequest("\u6807\u7B7E\u540D\u5FC5\u586B");
  const name = raw2.trim();
  if (!name || name.length > MAX_NAME) throw errors.badRequest(`\u6807\u7B7E\u540D\u987B\u4E3A 1-${MAX_NAME} \u5B57\u7B26`);
  return name;
}
__name(normalizeName, "normalizeName");
async function listTags(db, workspaceId) {
  const { results } = await db.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM node_tags nt WHERE nt.tag_id = t.id) AS nodes
       FROM tags t WHERE t.workspace_id = ?1 ORDER BY t.name`
  ).bind(workspaceId).all();
  return results;
}
__name(listTags, "listTags");
async function createTag(db, workspaceId, rawName, color) {
  const name = normalizeName(rawName);
  const safeColor = typeof color === "string" && /^#[0-9a-f]{3,8}$/i.test(color) ? color : null;
  const id = crypto.randomUUID();
  const now2 = Date.now();
  try {
    await db.prepare("INSERT INTO tags (id, workspace_id, name, color, created_at) VALUES (?1,?2,?3,?4,?5)").bind(id, workspaceId, name, safeColor, now2).run();
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("\u540C\u540D\u6807\u7B7E\u5DF2\u5B58\u5728");
    throw e;
  }
  return { id, workspace_id: workspaceId, name, color: safeColor, created_at: now2 };
}
__name(createTag, "createTag");
async function deleteTag(db, workspaceId, tagId) {
  const res = await db.prepare("DELETE FROM tags WHERE id = ?1 AND workspace_id = ?2").bind(tagId, workspaceId).run();
  if (!res.meta.changes) throw errors.notFound();
}
__name(deleteTag, "deleteTag");
async function attachTag(db, workspaceId, tagId, nodeId) {
  const tag2 = await db.prepare("SELECT 1 AS hit FROM tags WHERE id = ?1 AND workspace_id = ?2").bind(tagId, workspaceId).first();
  if (!tag2) throw errors.notFound();
  const node = await db.prepare("SELECT 1 AS hit FROM nodes WHERE id = ?1 AND workspace_id = ?2 AND deleted_at IS NULL").bind(nodeId, workspaceId).first();
  if (!node) throw errors.notFound();
  await db.prepare("INSERT OR IGNORE INTO node_tags (workspace_id, tag_id, node_id, created_at) VALUES (?1,?2,?3,?4)").bind(workspaceId, tagId, nodeId, Date.now()).run();
}
__name(attachTag, "attachTag");
async function detachTag(db, workspaceId, tagId, nodeId) {
  await db.prepare("DELETE FROM node_tags WHERE workspace_id = ?1 AND tag_id = ?2 AND node_id = ?3").bind(workspaceId, tagId, nodeId).run();
}
__name(detachTag, "detachTag");
async function listTagNodes(db, workspaceId, tagId) {
  const { results } = await db.prepare(
    `SELECT n.* FROM node_tags nt JOIN nodes n ON n.id = nt.node_id
       WHERE nt.workspace_id = ?1 AND nt.tag_id = ?2 AND n.deleted_at IS NULL
       ORDER BY nt.created_at DESC LIMIT 200`
  ).bind(workspaceId, tagId).all();
  return results;
}
__name(listTagNodes, "listTagNodes");

// server/routes/library.ts
var library = new Hono2();
library.get("/favorites", async (c) => {
  const nodes = await listFavorites(c.env.DB, c.get("workspace").id, c.get("user").id);
  return c.json({ nodes });
});
library.put("/favorites/:id", async (c) => {
  await addFavorite(c.env.DB, c.get("workspace").id, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
library.delete("/favorites/:id", async (c) => {
  await removeFavorite(c.env.DB, c.get("workspace").id, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
library.get("/recent", async (c) => {
  const nodes = await listRecent(c.env.DB, c.get("workspace").id, c.get("user").id);
  return c.json({ nodes });
});
library.post("/views/:id", async (c) => {
  await recordView(c.env.DB, c.get("workspace").id, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
library.get("/tags", async (c) => c.json({ tags: await listTags(c.env.DB, c.get("workspace").id) }));
library.post("/tags", async (c) => {
  const { name, color } = await c.req.json();
  const tag2 = await createTag(c.env.DB, c.get("workspace").id, name, color);
  return c.json(tag2, 201);
});
library.delete("/tags/:tagId", async (c) => {
  await deleteTag(c.env.DB, c.get("workspace").id, c.req.param("tagId"));
  return c.json({ ok: true });
});
library.get("/tags/:tagId/nodes", async (c) => {
  const nodes = await listTagNodes(c.env.DB, c.get("workspace").id, c.req.param("tagId"));
  return c.json({ nodes });
});
library.put("/tags/:tagId/nodes/:nodeId", async (c) => {
  await attachTag(c.env.DB, c.get("workspace").id, c.req.param("tagId"), c.req.param("nodeId"));
  return c.json({ ok: true });
});
library.delete("/tags/:tagId/nodes/:nodeId", async (c) => {
  await detachTag(c.env.DB, c.get("workspace").id, c.req.param("tagId"), c.req.param("nodeId"));
  return c.json({ ok: true });
});

// server/routes/notifications.ts
var notifications = new Hono2();
notifications.get("/", async (c) => c.json(await listNotifications(c.env.DB, c.get("user").id)));
notifications.post("/:id/read", async (c) => {
  await markNotificationRead(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
notifications.post("/read-all", async (c) => c.json({ ok: true, marked: await markAllRead(c.env.DB, c.get("user").id) }));

// server/middleware/admin.ts
async function requireAdmin(c, next) {
  if (c.get("user").platform_admin !== 1) throw errors.forbidden();
  await next();
}
__name(requireAdmin, "requireAdmin");

// server/lib/constants.ts
var PART_SIZE = 16 * 1048576;

// server/data/admin.ts
async function adminOverview(db) {
  const [userRow, wsRow, unboundRow, topRows, auditRows] = await db.batch([
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN disabled_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS disabled FROM users"),
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(used_bytes), 0) AS usedBytes FROM workspaces"),
    db.prepare(
      "SELECT COUNT(*) AS unbound FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)"
    ),
    db.prepare(
      `SELECT w.id, w.name, w.used_bytes AS usedBytes, w.quota_bytes AS quotaBytes,
         (SELECT COUNT(*) FROM memberships m WHERE m.workspace_id = w.id) AS members,
         (SELECT COUNT(*) FROM nodes n WHERE n.workspace_id = w.id AND n.deleted_at IS NULL) AS nodes
       FROM workspaces w ORDER BY w.used_bytes DESC LIMIT 20`
    ),
    db.prepare(
      "SELECT action, actor_id AS actorId, target_id AS targetId, workspace_id AS workspaceId, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 20"
    )
  ]);
  const user = userRow.results[0];
  const ws = wsRow.results[0];
  const unbound = unboundRow.results[0];
  return {
    users: { total: user?.total ?? 0, disabled: user?.disabled ?? 0, unbound: unbound?.unbound ?? 0 },
    workspaces: { total: ws?.total ?? 0, usedBytes: ws?.usedBytes ?? 0 },
    topWorkspaces: topRows.results,
    recentAudit: auditRows.results
  };
}
__name(adminOverview, "adminOverview");

// server/routes/me.ts
var me = new Hono2();
me.get("/", async (c) => {
  const u = c.get("user");
  const s = c.get("selfUser");
  const [used, configuredDays, stats, unread] = await Promise.all([
    usedBytes(c.env.DB, c.get("workspace").id),
    getSetting(c.env, "trash_retention_days"),
    readStorageStats(c.env.DB, c.get("workspace").id),
    unreadCount(c.env.DB, u.id)
  ]);
  return c.json({
    id: u.id,
    name: u.name,
    // 客户端契约仍用 admin/member；owner 视同 admin（workspace 内最高权限）
    role: u.platform_admin === 1 ? "admin" : "member",
    quotaBytes: c.get("workspace").quota_bytes,
    usedBytes: used,
    trashRetentionDays: Number(configuredDays ?? c.env.TRASH_RETENTION_DAYS),
    self: { id: s.id, name: s.name, role: s.platform_admin === 1 ? "admin" : "member" },
    // 上传限制由服务端下发，前端不硬编码（小文件直传上限 / 分片大小）
    limits: { smallFileLimit: Number(c.env.SMALL_FILE_LIMIT), partSize: PART_SIZE },
    // 空间列表与当前空间（前端切换器用；切空间 = 带 x-workspace 头）
    workspace: { id: c.get("workspace").id, name: c.get("workspace").name, role: c.get("role") },
    // 存储四分项 + 水位（前端据此显示 80/95/100% 提示；配额真相仍是 workspaces.used_bytes）
    unreadNotifications: unread,
    storage: {
      activeBytes: stats.active_bytes,
      trashBytes: stats.trash_bytes,
      usedBytes: c.get("workspace").used_bytes,
      quotaBytes: c.get("workspace").quota_bytes,
      level: storageLevel(c.get("workspace").used_bytes, c.get("workspace").quota_bytes)
    },
    workspaces: (await listMemberships(c.env.DB, u.id)).map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, role }))
  });
});
me.get("/admin/users", requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT u.id, u.name, u.email, u.created_at, u.disabled_at, u.platform_admin, w.id AS workspace_id, w.quota_bytes, w.used_bytes FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner' LEFT JOIN workspaces w ON w.id = m.workspace_id ORDER BY u.created_at"
  ).all();
  return c.json({ users: results });
});
var TRASH_RETENTION_MIN = 1;
var TRASH_RETENTION_MAX = 365;
me.get("/admin/settings", requireAdmin, async (c) => {
  const configured = await getSetting(c.env, "trash_retention_days");
  return c.json({ trash_retention_days: Number(configured ?? c.env.TRASH_RETENTION_DAYS) });
});
me.patch("/admin/settings", requireAdmin, async (c) => {
  const { trash_retention_days } = await c.req.json();
  if (!Number.isInteger(trash_retention_days) || trash_retention_days < TRASH_RETENTION_MIN || trash_retention_days > TRASH_RETENTION_MAX) {
    throw errors.badRequest(`\u4FDD\u7559\u5929\u6570\u987B\u4E3A ${TRASH_RETENTION_MIN}-${TRASH_RETENTION_MAX} \u7684\u6574\u6570`);
  }
  await c.env.DB.prepare(
    "INSERT INTO settings (scope, key, value) VALUES ('global', 'trash_retention_days', ?1) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value"
  ).bind(String(trash_retention_days)).run();
  return c.json({ ok: true });
});
me.get("/admin/overview", requireAdmin, async (c) => {
  return c.json(await adminOverview(c.env.DB));
});
me.get("/admin/unbound", requireAdmin, async (c) => {
  return c.json({ users: await listUnboundUsers(c.env.DB) });
});
me.patch("/admin/users/:id", requireAdmin, async (c) => {
  const { quota_bytes, role, disabled, name, email } = await c.req.json();
  if (role && !["admin", "member"].includes(role)) throw errors.badRequest("\u89D2\u8272\u4E0D\u5408\u6CD5");
  if (quota_bytes !== void 0 && (!Number.isFinite(quota_bytes) || quota_bytes < 0))
    throw errors.badRequest("\u914D\u989D\u4E0D\u5408\u6CD5");
  if (disabled !== void 0 && typeof disabled !== "boolean") throw errors.badRequest("disabled \u4E0D\u5408\u6CD5");
  if (name !== void 0 && (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 64)) {
    throw errors.badRequest("\u540D\u79F0\u987B\u4E3A 1-64 \u5B57\u7B26");
  }
  if (email !== void 0 && email !== null && (typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email.trim()))) {
    throw errors.badRequest("\u90AE\u7BB1\u683C\u5F0F\u4E0D\u5408\u6CD5");
  }
  if (c.req.param("id") === c.get("selfId") && (disabled === true || role === "member")) {
    throw errors.badRequest("\u4E0D\u80FD\u505C\u7528\u6216\u964D\u7EA7\u81EA\u5DF1");
  }
  if (c.req.param("id") === c.get("selfId") && (disabled === true || role === "member")) {
    throw errors.badRequest("\u4E0D\u80FD\u505C\u7528\u6216\u964D\u7EA7\u81EA\u5DF1");
  }
  const targetId = c.req.param("id");
  const target = await c.env.DB.prepare("SELECT platform_admin, disabled_at FROM users WHERE id = ?1").bind(targetId).first();
  if (!target) throw errors.notFound();
  const removesEnabledAdmin = target.platform_admin === 1 && target.disabled_at === null && (disabled === true || role === "member");
  if (removesEnabledAdmin) {
    const { n } = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE platform_admin = 1 AND disabled_at IS NULL"
    ).first();
    if (n <= 1) throw errors.badRequest("\u81F3\u5C11\u4FDD\u7559\u4E00\u540D\u542F\u7528\u4E2D\u7684\u7BA1\u7406\u5458");
  }
  const userSets = [];
  const userVals = [];
  if (role) {
    userSets.push("platform_admin = ?");
    userVals.push(role === "admin" ? 1 : 0);
  }
  if (disabled !== void 0) {
    userSets.push("disabled_at = ?");
    userVals.push(disabled ? Date.now() : null);
  }
  if (name !== void 0) {
    userSets.push("name = ?");
    userVals.push(name.trim());
  }
  if (email !== void 0) {
    userSets.push("email = ?");
    userVals.push(email === null ? null : email.trim().toLowerCase());
  }
  const personal = await c.env.DB.prepare(
    "SELECT w.id AS id FROM workspaces w JOIN memberships m ON m.workspace_id = w.id WHERE m.user_id = ?1 AND m.role = 'owner' LIMIT 1"
  ).bind(targetId).first();
  const stmts = [];
  if (userSets.length) {
    stmts.push(c.env.DB.prepare(`UPDATE users SET ${userSets.join(", ")} WHERE id = ?`).bind(...userVals, targetId));
  }
  if (personal) {
    if (quota_bytes !== void 0) {
      stmts.push(c.env.DB.prepare("UPDATE workspaces SET quota_bytes = ?1 WHERE id = ?2").bind(quota_bytes, personal.id));
    }
    if (role) {
      stmts.push(
        c.env.DB.prepare("UPDATE memberships SET role = ?1 WHERE workspace_id = ?2 AND user_id = ?3").bind(role === "admin" ? "owner" : "member", personal.id, targetId)
      );
    }
  } else if (quota_bytes !== void 0 || role) {
    throw errors.badRequest("\u8BE5\u7528\u6237\u5C1A\u672A\u9996\u6B21\u767B\u5F55\uFF0C\u6682\u65E0\u4E2A\u4EBA\u7A7A\u95F4\u53EF\u914D\u7F6E");
  }
  if (!stmts.length) throw errors.badRequest("\u65E0\u53EF\u66F4\u65B0\u5B57\u6BB5");
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.badRequest("\u8BE5\u90AE\u7BB1\u5DF2\u7ED1\u5B9A\u5176\u4ED6\u8D26\u53F7");
    throw e;
  }
  return c.json({ ok: true });
});

// server/data/copy.ts
var MAX_COPY_NODES = 500;
async function copyNode(db, workspaceId, actorId, srcId, targetParentId) {
  const src = await getNode(db, workspaceId, srcId);
  if (!src) throw errors.notFound();
  const parent = await resolveParent(db, workspaceId, targetParentId);
  if (!parent || !parent.is_dir) throw errors.badRequest("\u76EE\u6807\u76EE\u5F55\u4E0D\u5B58\u5728");
  if (src.is_dir && await isDescendant(db, workspaceId, src.id, parent.id)) {
    throw errors.badRequest("\u4E0D\u80FD\u590D\u5236\u5230\u81EA\u8EAB\u5B50\u76EE\u5F55");
  }
  const { lo, hi } = subtreeRange(subtreePrefix(src));
  const { results: rows } = await db.prepare(
    `SELECT id, parent_id, path, name, is_dir, r2_key, size, mime, sha256 FROM nodes
     WHERE workspace_id = ?1 AND deleted_at IS NULL AND (id = ?2 OR (path >= ?3 AND path < ?4))
     ORDER BY path ASC`
  ).bind(workspaceId, src.id, lo, hi).all();
  if (rows.length > MAX_COPY_NODES) throw errors.badRequest(`\u5355\u6B21\u6700\u591A\u590D\u5236 ${MAX_COPY_NODES} \u4E2A\u8282\u70B9\uFF0C\u8BF7\u5206\u6279`);
  const bytes = rows.reduce((sum, r) => sum + (r.is_dir ? 0 : r.size ?? 0), 0);
  if (bytes > 0) await assertQuota(db, workspaceId, bytes);
  const rootName = await uniqueName(db, workspaceId, parent.id, src.name);
  const rootParentPath = childPath(parent);
  const now2 = Date.now();
  const insert = db.prepare(
    "INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)"
  );
  const mapping = /* @__PURE__ */ new Map();
  const stmts = [];
  const newRootId = crypto.randomUUID();
  mapping.set(src.id, { newId: newRootId, newPath: rootParentPath });
  stmts.push(insert.bind(newRootId, workspaceId, actorId, parent.id, rootParentPath, rootName, src.is_dir, src.r2_key, src.size, src.mime, src.sha256, now2));
  for (const r of rows) {
    if (r.id === src.id) continue;
    const parentMapping = mapping.get(r.parent_id);
    if (!parentMapping) continue;
    const newId = crypto.randomUUID();
    const newPath = `${parentMapping.newPath}${parentMapping.newId}/`;
    mapping.set(r.id, { newId, newPath });
    stmts.push(insert.bind(newId, workspaceId, actorId, parentMapping.newId, newPath, r.name, r.is_dir, r.r2_key, r.size, r.mime, r.sha256, now2));
  }
  stmts.push(db.prepare("UPDATE workspaces SET used_bytes = used_bytes + ?1 WHERE id = ?2").bind(bytes, workspaceId));
  stmts.push(storageDeltaStmt(db, workspaceId, { active: bytes }));
  await db.batch(stmts);
  return { id: newRootId, name: rootName, copied: rows.length };
}
__name(copyNode, "copyNode");

// server/data/thumbs.ts
var MAX_THUMB_BYTES = 512 * 1024;
function thumbKey(workspaceId, nodeId) {
  return `${workspaceId}/${nodeId}.thumb`;
}
__name(thumbKey, "thumbKey");
async function putThumb(env2, workspaceId, nodeId, body, contentType) {
  const node = await getNode(env2.DB, workspaceId, nodeId);
  if (!node || node.is_dir || node.deleted_at) throw errors.notFound();
  if (!contentType.startsWith("image/")) throw errors.badRequest("\u7F29\u7565\u56FE\u5FC5\u987B\u662F\u56FE\u7247");
  const key = thumbKey(workspaceId, nodeId);
  const obj = await env2.BUCKET.put(key, body, { httpMetadata: { contentType } });
  if (obj.size > MAX_THUMB_BYTES) {
    await env2.BUCKET.delete(key);
    throw errors.badRequest(`\u7F29\u7565\u56FE\u4E0D\u5F97\u8D85\u8FC7 ${Math.floor(MAX_THUMB_BYTES / 1024)}KB`);
  }
  const hadThumb = node.thumb_key !== null;
  await env2.DB.batch([
    env2.DB.prepare("UPDATE nodes SET thumb_key = ?1, updated_at = ?2 WHERE id = ?3 AND workspace_id = ?4").bind(key, Date.now(), nodeId, workspaceId),
    ...hadThumb ? [] : [storageDeltaStmt(env2.DB, workspaceId, { thumb: obj.size })]
  ]);
  return { key, bytes: obj.size };
}
__name(putThumb, "putThumb");
async function getThumb(env2, workspaceId, nodeId) {
  const node = await getNode(env2.DB, workspaceId, nodeId);
  if (!node || !node.thumb_key || node.deleted_at) return null;
  const obj = await env2.BUCKET.get(node.thumb_key);
  if (!obj) return null;
  return { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "image/webp" };
}
__name(getThumb, "getThumb");

// server/data/operations.ts
var UNDO_WINDOW_MS = 3e4;
async function recordMoveUndo(db, input) {
  const id = crypto.randomUUID();
  const now2 = Date.now();
  await db.prepare(
    "INSERT INTO operations (id, workspace_id, actor_id, kind, node_id, payload, created_at, expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)"
  ).bind(
    id,
    input.workspaceId,
    input.actorId,
    input.oldParentId === "" ? "move" : "move",
    input.nodeId,
    JSON.stringify({ parentId: input.oldParentId, name: input.oldName }),
    now2,
    now2 + UNDO_WINDOW_MS
  ).run();
  return id;
}
__name(recordMoveUndo, "recordMoveUndo");
async function undoOperation(db, workspaceId, opId) {
  const row = await db.prepare("SELECT * FROM operations WHERE id = ?1 AND workspace_id = ?2").bind(opId, workspaceId).first();
  if (!row) throw errors.notFound();
  if (row.undone_at) throw errors.conflict("\u8BE5\u64CD\u4F5C\u5DF2\u64A4\u9500");
  if (Date.now() > row.expires_at) throw new HttpError(410, "UNDO_EXPIRED", "\u64A4\u9500\u7A97\u53E3\u5DF2\u8FC7\uFF0830 \u79D2\uFF09");
  const payload = JSON.parse(row.payload);
  await moveNode(db, workspaceId, row.node_id, payload.parentId, payload.name);
  await db.prepare("UPDATE operations SET undone_at = ?1 WHERE id = ?2").bind(Date.now(), opId).run();
}
__name(undoOperation, "undoOperation");

// server/routes/files.ts
var files = new Hono2();
files.get("/", async (c) => {
  const parentId = c.req.query("parentId") ?? "";
  const root = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!root || !root.is_dir) throw errors.notFound();
  const [nodes, crumbs] = await Promise.all([
    listChildren(c.env.DB, c.get("workspace").id, root.id),
    parentId === "" ? Promise.resolve([]) : breadcrumb(c.env.DB, c.get("workspace").id, parentId)
  ]);
  return c.json({ nodes, breadcrumb: crumbs, rootId: root.id });
});
files.patch("/:id", async (c) => {
  const { name, parentId } = await c.req.json();
  const node = await getNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  if (!node) throw errors.notFound();
  const nextName = name !== void 0 ? validateNodeName(name) : node.name;
  await moveNode(c.env.DB, c.get("workspace").id, node.id, parentId ?? node.parent_id, nextName);
  const undoId = await recordMoveUndo(c.env.DB, {
    workspaceId: c.get("workspace").id,
    actorId: c.get("user").id,
    nodeId: node.id,
    oldParentId: node.parent_id,
    oldName: node.name
  });
  return c.json({ ok: true, undoId });
});
files.post("/:id/copy", async (c) => {
  const { parentId } = await c.req.json();
  const result = await copyNode(
    c.env.DB,
    c.get("workspace").id,
    c.get("user").id,
    c.req.param("id"),
    parentId ?? ""
  );
  return c.json(result, 201);
});
files.post("/operations/:id/undo", async (c) => {
  await undoOperation(c.env.DB, c.get("workspace").id, c.req.param("id"));
  return c.json({ ok: true });
});
files.post("/:id/thumb", async (c) => {
  const body = c.req.raw.body;
  if (!body) throw errors.badRequest("\u7F3A\u5C11\u8BF7\u6C42\u4F53");
  const result = await putThumb(c.env, c.get("workspace").id, c.req.param("id"), body, c.req.header("content-type") ?? "image/webp");
  return c.json({ ok: true, bytes: result.bytes }, 201);
});
files.get("/:id/thumb", async (c) => {
  const thumb = await getThumb(c.env, c.get("workspace").id, c.req.param("id"));
  if (!thumb) throw errors.notFound();
  return new Response(thumb.body, {
    status: 200,
    headers: {
      "content-type": thumb.contentType,
      // 内容不可变（同名修改=新节点），可长缓存；私有内容不进公共缓存
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff"
    }
  });
});
files.get("/:id/content", async (c) => {
  const node = await getNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  if (!node || node.is_dir) throw errors.notFound();
  return serveObject(c, node);
});
files.put("/upload", async (c) => {
  const name = validateNodeName(c.req.query("name"));
  const parentId = c.req.query("parentId") ?? "";
  const len = Number(c.req.header("content-length") ?? "0");
  const limit = Number(c.env.SMALL_FILE_LIMIT);
  if (!Number.isFinite(limit)) throw new Error("SMALL_FILE_LIMIT \u672A\u914D\u7F6E\u6216\u975E\u6CD5");
  const limitMsg = `\u6587\u4EF6\u5927\u5C0F\u975E\u6CD5\u6216\u8D85\u8FC7\u5C0F\u6587\u4EF6\u76F4\u4F20\u4E0A\u9650\uFF08${Math.floor(limit / 1048576)}MB\uFF09\uFF0C\u8BF7\u4F7F\u7528\u7F51\u9875\u7AEF\u4E0A\u4F20\u5927\u6587\u4EF6`;
  const lenHeader = c.req.header("content-length");
  if (lenHeader !== void 0 && (!Number.isFinite(len) || len < 0 || len > limit)) throw errors.badRequest(limitMsg);
  const parent = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  let finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, name);
  const now2 = Date.now();
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  const sha2562 = c.req.header("x-file-sha256");
  const normalizedSha = sha2562 && /^[0-9a-f]{64}$/i.test(sha2562) ? sha2562.toLowerCase() : null;
  const parentPath = childPath(parent);
  if (normalizedSha) {
    const hit = await c.env.DB.prepare(
      "SELECT r2_key FROM nodes WHERE workspace_id = ?1 AND sha256 = ?2 AND size = ?3 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1"
    ).bind(c.get("workspace").id, normalizedSha, len).first();
    if (hit) {
      await assertGlobalBudget(c.env, len);
      await assertQuota(c.env.DB, c.get("workspace").id, len, Number(c.env.DEFAULT_QUOTA_BYTES));
      const id2 = randomId();
      const insertDup = c.env.DB.prepare(
        "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
      );
      try {
        await insertDup.bind(id2, c.get("workspace").id, parent.id, parentPath, finalName, hit.r2_key, len, mime, normalizedSha, now2).run();
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, name);
        await insertDup.bind(id2, c.get("workspace").id, parent.id, parentPath, finalName, hit.r2_key, len, mime, normalizedSha, now2).run();
      }
      await adjustUsedBytes(c.env.DB, c.get("workspace").id, len);
      await storageDeltaStmt(c.env.DB, c.get("workspace").id, { active: len }).run();
      await notifyIfStorageLevelHigh(c.env, c.get("workspace").id);
      return c.json({ id: id2, name: finalName, size: len, deduplicated: true }, 201);
    }
  }
  const id = randomId();
  const key = `${c.get("workspace").id}/${id}`;
  const body = c.req.raw.body;
  if (!body) throw errors.badRequest("\u7F3A\u5C11\u8BF7\u6C42\u4F53");
  const obj = await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mime } });
  if (obj.size > limit) {
    await c.env.BUCKET.delete(key);
    throw errors.badRequest(limitMsg);
  }
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
  );
  try {
    await assertGlobalBudget(c.env, obj.size);
    await assertQuota(c.env.DB, c.get("workspace").id, obj.size, Number(c.env.DEFAULT_QUOTA_BYTES));
    try {
      await insert.bind(id, c.get("workspace").id, parent.id, parentPath, finalName, key, obj.size, mime, normalizedSha, now2).run();
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, name);
      await insert.bind(id, c.get("workspace").id, parent.id, parentPath, finalName, key, obj.size, mime, normalizedSha, now2).run();
    }
  } catch (e) {
    await c.env.BUCKET.delete(key).catch(() => {
    });
    throw e;
  }
  await adjustUsedBytes(c.env.DB, c.get("workspace").id, obj.size);
  await storageDeltaStmt(c.env.DB, c.get("workspace").id, { active: obj.size }).run();
  await notifyIfStorageLevelHigh(c.env, c.get("workspace").id);
  return c.json({ id, name: finalName, size: obj.size }, 201);
});
files.delete("/:id", async (c) => {
  await softDeleteNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true });
});
files.post("/instant", async (c) => {
  const { name, parentId = "", size, sha256: sha2562, mime } = await c.req.json();
  const safeName = validateNodeName(name);
  if (!Number.isFinite(size) || size <= 0 || typeof sha2562 !== "string" || !/^[0-9a-f]{64}$/i.test(sha2562))
    throw errors.badRequest("\u53C2\u6570\u4E0D\u5408\u6CD5");
  const safeMime = typeof mime === "string" && /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i.test(mime) ? mime : "application/octet-stream";
  const parent = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const hit = await c.env.DB.prepare(
    "SELECT r2_key FROM nodes WHERE workspace_id = ?1 AND sha256 = ?2 AND size = ?3 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1"
  ).bind(c.get("workspace").id, sha2562.toLowerCase(), size).first();
  if (!hit) throw new HttpError(404, "NO_DEDUP", "\u65E0\u76F8\u540C\u5185\u5BB9\u6587\u4EF6");
  await assertGlobalBudget(c.env, size);
  await assertQuota(c.env.DB, c.get("workspace").id, size, Number(c.env.DEFAULT_QUOTA_BYTES));
  const id = randomId();
  const now2 = Date.now();
  let finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, safeName);
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
  );
  try {
    await insert.bind(id, c.get("workspace").id, parent.id, childPath(parent), finalName, hit.r2_key, size, safeMime, sha2562.toLowerCase(), now2).run();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, safeName);
    await insert.bind(id, c.get("workspace").id, parent.id, childPath(parent), finalName, hit.r2_key, size, safeMime, sha2562.toLowerCase(), now2).run();
  }
  await adjustUsedBytes(c.env.DB, c.get("workspace").id, size);
  await storageDeltaStmt(c.env.DB, c.get("workspace").id, { active: size }).run();
  await notifyIfStorageLevelHigh(c.env, c.get("workspace").id);
  return c.json({ id, name: finalName, size, deduplicated: true }, 201);
});
files.post("/batch-delete", async (c) => {
  const { ids, permanent = false } = await c.req.json();
  const list = parseIds({ ids });
  const deleted = permanent ? (await softDeleteMany(c.env.DB, c.get("workspace").id, list), await permanentDeleteMany(c.env, c.get("workspace").id, list)) : await softDeleteMany(c.env.DB, c.get("workspace").id, list);
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true, deleted, failed: [] });
});
files.post("/batch-move", async (c) => {
  const { ids, parentId } = await c.req.json();
  const list = parseIds({ ids });
  const moved = await moveMany(c.env.DB, c.get("workspace").id, list, parentId);
  return c.json({ ok: true, moved, failed: [] });
});

// server/routes/dirs.ts
var dirs = new Hono2();
dirs.post("/", async (c) => {
  const { parentId = "", name } = await c.req.json();
  const validName = validateNodeName(name);
  const found = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!found || !found.is_dir) throw errors.notFound();
  const node = await createDir(c.env.DB, c.get("workspace").id, found.id, validName, found);
  return c.json(node, 201);
});
dirs.post("/ensure", async (c) => {
  const { parentId = "", name } = await c.req.json();
  const validName = validateNodeName(name);
  const found = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!found || !found.is_dir) throw errors.notFound();
  const active = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2 AND name = ?3 AND is_dir = 1 AND deleted_at IS NULL"
  ).bind(c.get("workspace").id, found.id, validName).first();
  if (active) return c.json(active);
  const node = await createDir(c.env.DB, c.get("workspace").id, found.id, await uniqueName(c.env.DB, c.get("workspace").id, found.id, validName), found);
  return c.json(node, 201);
});

// node_modules/aws4fetch/dist/aws4fetch.esm.mjs
var encoder2 = new TextEncoder();
var HOST_SERVICES = {
  appstream2: "appstream",
  cloudhsmv2: "cloudhsm",
  email: "ses",
  marketplace: "aws-marketplace",
  mobile: "AWSMobileHubService",
  pinpoint: "mobiletargeting",
  queue: "sqs",
  "git-codecommit": "codecommit",
  "mturk-requester-sandbox": "mturk-requester",
  "personalize-runtime": "personalize"
};
var UNSIGNABLE_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "content-type",
  "content-length",
  "user-agent",
  "presigned-expires",
  "expect",
  "x-amzn-trace-id",
  "range",
  "connection"
]);
var AwsClient = class {
  static {
    __name(this, "AwsClient");
  }
  constructor({ accessKeyId, secretAccessKey, sessionToken, service, region, cache: cache2, retries, initRetryMs }) {
    if (accessKeyId == null) throw new TypeError("accessKeyId is a required option");
    if (secretAccessKey == null) throw new TypeError("secretAccessKey is a required option");
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.sessionToken = sessionToken;
    this.service = service;
    this.region = region;
    this.cache = cache2 || /* @__PURE__ */ new Map();
    this.retries = retries != null ? retries : 10;
    this.initRetryMs = initRetryMs || 50;
  }
  async sign(input, init) {
    if (input instanceof Request) {
      const { method, url, headers, body } = input;
      init = Object.assign({ method, url, headers }, init);
      if (init.body == null && headers.has("Content-Type")) {
        init.body = body != null && headers.has("X-Amz-Content-Sha256") ? body : await input.clone().arrayBuffer();
      }
      input = url;
    }
    const signer = new AwsV4Signer(Object.assign({ url: input.toString() }, init, this, init && init.aws));
    const signed = Object.assign({}, init, await signer.sign());
    delete signed.aws;
    try {
      return new Request(signed.url.toString(), signed);
    } catch (e) {
      if (e instanceof TypeError) {
        return new Request(signed.url.toString(), Object.assign({ duplex: "half" }, signed));
      }
      throw e;
    }
  }
  async fetch(input, init) {
    for (let i = 0; i <= this.retries; i++) {
      const fetched = fetch(await this.sign(input, init));
      if (i === this.retries) {
        return fetched;
      }
      const res = await fetched;
      if (res.status < 500 && res.status !== 429) {
        return res;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.random() * this.initRetryMs * Math.pow(2, i)));
    }
    throw new Error("An unknown error occurred, ensure retries is not negative");
  }
};
var AwsV4Signer = class {
  static {
    __name(this, "AwsV4Signer");
  }
  constructor({ method, url, headers, body, accessKeyId, secretAccessKey, sessionToken, service, region, cache: cache2, datetime, signQuery, appendSessionToken, allHeaders, singleEncode }) {
    if (url == null) throw new TypeError("url is a required option");
    if (accessKeyId == null) throw new TypeError("accessKeyId is a required option");
    if (secretAccessKey == null) throw new TypeError("secretAccessKey is a required option");
    this.method = method || (body ? "POST" : "GET");
    this.url = new URL(url);
    this.headers = new Headers(headers || {});
    this.body = body;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.sessionToken = sessionToken;
    let guessedService, guessedRegion;
    if (!service || !region) {
      [guessedService, guessedRegion] = guessServiceRegion(this.url, this.headers);
    }
    this.service = service || guessedService || "";
    this.region = region || guessedRegion || "us-east-1";
    this.cache = cache2 || /* @__PURE__ */ new Map();
    this.datetime = datetime || (/* @__PURE__ */ new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "");
    this.signQuery = signQuery;
    this.appendSessionToken = appendSessionToken || this.service === "iotdevicegateway";
    this.headers.delete("Host");
    if (this.service === "s3" && !this.signQuery && !this.headers.has("X-Amz-Content-Sha256")) {
      this.headers.set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD");
    }
    const params = this.signQuery ? this.url.searchParams : this.headers;
    params.set("X-Amz-Date", this.datetime);
    if (this.sessionToken && !this.appendSessionToken) {
      params.set("X-Amz-Security-Token", this.sessionToken);
    }
    this.signableHeaders = ["host", ...this.headers.keys()].filter((header) => allHeaders || !UNSIGNABLE_HEADERS.has(header)).sort();
    this.signedHeaders = this.signableHeaders.join(";");
    this.canonicalHeaders = this.signableHeaders.map((header) => header + ":" + (header === "host" ? this.url.host : (this.headers.get(header) || "").replace(/\s+/g, " "))).join("\n");
    this.credentialString = [this.datetime.slice(0, 8), this.region, this.service, "aws4_request"].join("/");
    if (this.signQuery) {
      if (this.service === "s3" && !params.has("X-Amz-Expires")) {
        params.set("X-Amz-Expires", "86400");
      }
      params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
      params.set("X-Amz-Credential", this.accessKeyId + "/" + this.credentialString);
      params.set("X-Amz-SignedHeaders", this.signedHeaders);
    }
    if (this.service === "s3") {
      try {
        this.encodedPath = decodeURIComponent(this.url.pathname.replace(/\+/g, " "));
      } catch (e) {
        this.encodedPath = this.url.pathname;
      }
    } else {
      this.encodedPath = this.url.pathname.replace(/\/+/g, "/");
    }
    if (!singleEncode) {
      this.encodedPath = encodeURIComponent(this.encodedPath).replace(/%2F/g, "/");
    }
    this.encodedPath = encodeRfc3986(this.encodedPath);
    const seenKeys = /* @__PURE__ */ new Set();
    this.encodedSearch = [...this.url.searchParams].filter(([k]) => {
      if (!k) return false;
      if (this.service === "s3") {
        if (seenKeys.has(k)) return false;
        seenKeys.add(k);
      }
      return true;
    }).map((pair) => pair.map((p) => encodeRfc3986(encodeURIComponent(p)))).sort(([k1, v1], [k2, v2]) => k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0).map((pair) => pair.join("=")).join("&");
  }
  async sign() {
    if (this.signQuery) {
      this.url.searchParams.set("X-Amz-Signature", await this.signature());
      if (this.sessionToken && this.appendSessionToken) {
        this.url.searchParams.set("X-Amz-Security-Token", this.sessionToken);
      }
    } else {
      this.headers.set("Authorization", await this.authHeader());
    }
    return {
      method: this.method,
      url: this.url,
      headers: this.headers,
      body: this.body
    };
  }
  async authHeader() {
    return [
      "AWS4-HMAC-SHA256 Credential=" + this.accessKeyId + "/" + this.credentialString,
      "SignedHeaders=" + this.signedHeaders,
      "Signature=" + await this.signature()
    ].join(", ");
  }
  async signature() {
    const date = this.datetime.slice(0, 8);
    const cacheKey = [this.secretAccessKey, date, this.region, this.service].join();
    let kCredentials = this.cache.get(cacheKey);
    if (!kCredentials) {
      const kDate = await hmac2("AWS4" + this.secretAccessKey, date);
      const kRegion = await hmac2(kDate, this.region);
      const kService = await hmac2(kRegion, this.service);
      kCredentials = await hmac2(kService, "aws4_request");
      this.cache.set(cacheKey, kCredentials);
    }
    return buf2hex(await hmac2(kCredentials, await this.stringToSign()));
  }
  async stringToSign() {
    return [
      "AWS4-HMAC-SHA256",
      this.datetime,
      this.credentialString,
      buf2hex(await hash(await this.canonicalString()))
    ].join("\n");
  }
  async canonicalString() {
    return [
      this.method.toUpperCase(),
      this.encodedPath,
      this.encodedSearch,
      this.canonicalHeaders + "\n",
      this.signedHeaders,
      await this.hexBodyHash()
    ].join("\n");
  }
  async hexBodyHash() {
    let hashHeader = this.headers.get("X-Amz-Content-Sha256") || (this.service === "s3" && this.signQuery ? "UNSIGNED-PAYLOAD" : null);
    if (hashHeader == null) {
      if (this.body && typeof this.body !== "string" && !("byteLength" in this.body)) {
        throw new Error("body must be a string, ArrayBuffer or ArrayBufferView, unless you include the X-Amz-Content-Sha256 header");
      }
      hashHeader = buf2hex(await hash(this.body || ""));
    }
    return hashHeader;
  }
};
async function hmac2(key, string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder2.encode(key) : key,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder2.encode(string));
}
__name(hmac2, "hmac");
async function hash(content) {
  return crypto.subtle.digest("SHA-256", typeof content === "string" ? encoder2.encode(content) : content);
}
__name(hash, "hash");
var HEX_CHARS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
function buf2hex(arrayBuffer) {
  const buffer = new Uint8Array(arrayBuffer);
  let out = "";
  for (let idx = 0; idx < buffer.length; idx++) {
    const n = buffer[idx];
    out += HEX_CHARS[n >>> 4 & 15];
    out += HEX_CHARS[n & 15];
  }
  return out;
}
__name(buf2hex, "buf2hex");
function encodeRfc3986(urlEncodedStr) {
  return urlEncodedStr.replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
__name(encodeRfc3986, "encodeRfc3986");
function guessServiceRegion(url, headers) {
  const { hostname, pathname } = url;
  if (hostname.endsWith(".on.aws")) {
    const match3 = hostname.match(/^[^.]{1,63}\.lambda-url\.([^.]{1,63})\.on\.aws$/);
    return match3 != null ? ["lambda", match3[1] || ""] : ["", ""];
  }
  if (hostname.endsWith(".r2.cloudflarestorage.com")) {
    return ["s3", "auto"];
  }
  if (hostname.endsWith(".backblazeb2.com")) {
    const match3 = hostname.match(/^(?:[^.]{1,63}\.)?s3\.([^.]{1,63})\.backblazeb2\.com$/);
    return match3 != null ? ["s3", match3[1] || ""] : ["", ""];
  }
  const match2 = hostname.replace("dualstack.", "").match(/([^.]{1,63})\.(?:([^.]{0,63})\.)?amazonaws\.com(?:\.cn)?$/);
  let service = match2 && match2[1] || "";
  let region = match2 && match2[2];
  if (region === "us-gov") {
    region = "us-gov-west-1";
  } else if (region === "s3" || region === "s3-accelerate") {
    region = "us-east-1";
    service = "s3";
  } else if (service === "iot") {
    if (hostname.startsWith("iot.")) {
      service = "execute-api";
    } else if (hostname.startsWith("data.jobs.iot.")) {
      service = "iot-jobs-data";
    } else {
      service = pathname === "/mqtt" ? "iotdevicegateway" : "iotdata";
    }
  } else if (service === "autoscaling") {
    const targetPrefix = (headers.get("X-Amz-Target") || "").split(".")[0];
    if (targetPrefix === "AnyScaleFrontendService") {
      service = "application-autoscaling";
    } else if (targetPrefix === "AnyScaleScalingPlannerFrontendService") {
      service = "autoscaling-plans";
    }
  } else if (region == null && service.startsWith("s3-")) {
    region = service.slice(3).replace(/^fips-|^external-1/, "");
    service = "s3";
  } else if (service.endsWith("-fips")) {
    service = service.slice(0, -5);
  } else if (region && /-\d$/.test(service) && !/-\d$/.test(region)) {
    [service, region] = [region, service];
  }
  return [HOST_SERVICES[service] || service, region || ""];
}
__name(guessServiceRegion, "guessServiceRegion");

// server/lib/r2.ts
function s3Client(env2) {
  return new AwsClient({ accessKeyId: env2.R2_ACCESS_KEY_ID, secretAccessKey: env2.R2_SECRET_ACCESS_KEY, service: "s3" });
}
__name(s3Client, "s3Client");
async function createMultipart(env2, key) {
  const res = await s3Client(env2).fetch(new Request(`${env2.R2_ENDPOINT}/${key}?uploads`, { method: "POST" }));
  if (!res.ok) throw new Error(`CreateMultipartUpload failed: ${await res.text()}`);
  const xml = await res.text();
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
  if (!uploadId) throw new Error("no UploadId in response");
  return uploadId;
}
__name(createMultipart, "createMultipart");
async function presignPart(env2, key, uploadId, partNumber) {
  const signed = await s3Client(env2).sign(
    new Request(`${env2.R2_ENDPOINT}/${key}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}&X-Amz-Expires=3600`, { method: "PUT" }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}
__name(presignPart, "presignPart");
async function completeMultipart(env2, key, uploadId, parts) {
  const body = `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
  const res = await s3Client(env2).fetch(new Request(`${env2.R2_ENDPOINT}/${key}?uploadId=${encodeURIComponent(uploadId)}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/xml" }
  }));
  if (!res.ok) throw new Error(`CompleteMultipartUpload failed: ${await res.text()}`);
}
__name(completeMultipart, "completeMultipart");
async function abortMultipart(env2, key, uploadId) {
  await s3Client(env2).fetch(new Request(`${env2.R2_ENDPOINT}/${key}?uploadId=${encodeURIComponent(uploadId)}`, { method: "DELETE" }));
}
__name(abortMultipart, "abortMultipart");

// server/routes/uploads.ts
var uploads = new Hono2();
uploads.post("/", async (c) => {
  const user = c.get("user");
  const { parentId = "", name, size, idempotencyKey: bodyIdem } = await c.req.json();
  const safeName = validateNodeName(name);
  if (!Number.isFinite(size) || size <= 0) throw errors.badRequest("\u53C2\u6570\u4E0D\u5408\u6CD5");
  const limit = Number(c.env.SMALL_FILE_LIMIT);
  if (!Number.isFinite(limit)) throw new Error("SMALL_FILE_LIMIT \u672A\u914D\u7F6E\u6216\u975E\u6CD5");
  if (size <= limit) throw errors.badRequest("\u5C0F\u6587\u4EF6\u8BF7\u4F7F\u7528\u76F4\u4F20\u63A5\u53E3");
  const parent = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const idem = (c.req.header("idempotency-key") ?? bodyIdem ?? "").trim();
  if (idem) {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM uploads WHERE workspace_id = ?1 AND idempotency_key = ?2 AND status = 'pending'"
    ).bind(c.get("workspace").id, idem).first();
    if (existing) return c.json({ uploadId: existing.id, partSize: PART_SIZE, resumed: true }, 200);
  }
  await assertGlobalBudget(c.env, size);
  await assertQuota(c.env.DB, c.get("workspace").id, size, Number(c.env.DEFAULT_QUOTA_BYTES));
  const id = randomId();
  const key = `${user.id}/${id}`;
  const r2UploadId = await createMultipart(c.env, key);
  await c.env.DB.prepare(
    "INSERT INTO uploads (id, workspace_id, owner_id, parent_id, name, size, r2_key, r2_upload_id, idempotency_key, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'pending',?10,?10)"
  ).bind(id, c.get("workspace").id, user.id, parent.id, safeName, size, key, r2UploadId, idem || null, Date.now()).run();
  return c.json({ uploadId: id, partSize: PART_SIZE }, 201);
});
uploads.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, size, mime, status, created_at, updated_at FROM uploads
     WHERE workspace_id = ?1 AND owner_id = ?2 AND status IN ('pending','completing')
     ORDER BY created_at DESC LIMIT 100`
  ).bind(c.get("workspace").id, c.get("user").id).all();
  return c.json({ uploads: results, partSize: PART_SIZE });
});
uploads.post("/:id/part-urls", async (c) => {
  const user = c.get("user");
  const { partNumbers } = await c.req.json();
  if (!Array.isArray(partNumbers) || !partNumbers.length || partNumbers.length > 1e3 || partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 1e4))
    throw errors.badRequest("partNumbers \u4E0D\u5408\u6CD5");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'").bind(c.req.param("id"), user.id).first();
  if (!row) throw errors.notFound();
  const urls = await Promise.all(partNumbers.map((n) => presignPart(c.env, row.r2_key, row.r2_upload_id, n)));
  return c.json({ urls });
});
uploads.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const { parts, mime, sha256: sha2562 } = await c.req.json();
  if (!Array.isArray(parts) || !parts.length || parts.length > 1e4) throw errors.badRequest("parts \u4E0D\u5408\u6CD5");
  if (parts.some((p) => !/^"[0-9a-f]{32}"$/i.test(p.etag))) throw errors.badRequest("etag \u4E0D\u5408\u6CD5");
  if (sha2562 !== void 0 && !/^[0-9a-f]{64}$/i.test(sha2562)) throw errors.badRequest("sha256 \u4E0D\u5408\u6CD5");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'").bind(c.req.param("id"), user.id).first();
  if (!row) throw errors.notFound();
  parts.sort((a, b) => a.partNumber - b.partNumber);
  await completeMultipart(c.env, row.r2_key, row.r2_upload_id, parts);
  const parent = await resolveParent(c.env.DB, c.get("workspace").id, row.parent_id);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const parentPath = childPath(parent);
  let finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, row.name);
  const now2 = Date.now();
  const buildBatch = /* @__PURE__ */ __name((n) => [
    c.env.DB.prepare("UPDATE uploads SET status = 'done' WHERE id = ?1").bind(row.id),
    c.env.DB.prepare(
      "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
    ).bind(
      row.id,
      c.get("workspace").id,
      parent.id,
      parentPath,
      n,
      row.r2_key,
      row.size,
      mime ?? "application/octet-stream",
      sha2562 ? sha2562.toLowerCase() : null,
      now2
    )
  ], "buildBatch");
  try {
    await c.env.DB.batch(buildBatch(finalName));
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, row.name);
    await c.env.DB.batch(buildBatch(finalName));
  }
  await adjustUsedBytes(c.env.DB, c.get("workspace").id, row.size);
  await storageDeltaStmt(c.env.DB, c.get("workspace").id, { active: row.size }).run();
  return c.json({ nodeId: row.id, name: finalName }, 201);
});
uploads.delete("/:id", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'").bind(c.req.param("id"), user.id).first();
  if (!row) throw errors.notFound();
  await abortMultipart(c.env, row.r2_key, row.r2_upload_id);
  await c.env.DB.prepare("DELETE FROM uploads WHERE id = ?1").bind(row.id).run();
  return c.json({ ok: true });
});
async function abortStaleUploads(env2) {
  const cutoff = Date.now() - 24 * 36e5;
  const { results } = await env2.DB.prepare(
    "SELECT id, r2_key, r2_upload_id FROM uploads WHERE status = 'pending' AND created_at < ?1"
  ).bind(cutoff).all();
  await Promise.all(results.map(async (row) => {
    try {
      await abortMultipart(env2, row.r2_key, row.r2_upload_id);
      await env2.DB.prepare("DELETE FROM uploads WHERE id = ?1").bind(row.id).run();
    } catch (e) {
      console.warn("abortStaleUploads: \u6E05\u7406 pending \u4F1A\u8BDD\u5931\u8D25", row.id, e);
    }
  }));
}
__name(abortStaleUploads, "abortStaleUploads");

// server/routes/trash.ts
var trash = new Hono2();
trash.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE workspace_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500"
  ).bind(c.get("workspace").id).all();
  return c.json({ nodes: results });
});
trash.post("/batch-restore", async (c) => {
  const ids = parseIds(await c.req.json());
  let restored = 0;
  const failed = [];
  for (const id of ids) {
    try {
      await restoreTrashNode(c.env.DB, c.get("workspace").id, id);
      restored++;
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : "\u672A\u77E5\u9519\u8BEF" });
    }
  }
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true, restored, failed });
});
trash.post("/batch-purge", async (c) => {
  const ids = parseIds(await c.req.json());
  const purged = await permanentDeleteMany(c.env, c.get("workspace").id, ids);
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true, purged, failed: [] });
});
trash.post("/:id/restore", async (c) => {
  await restoreTrashNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true });
});
trash.delete("/:id", async (c) => {
  await permanentDeleteNode(c.env, c.get("workspace").id, c.req.param("id"));
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true });
});

// server/routes/search.ts
var search = new Hono2();
var MAX_LIMIT = 100;
var DEFAULT_LIMIT = 50;
function parseSort(raw2) {
  return raw2 === "name" || raw2 === "size" ? raw2 : "recent";
}
__name(parseSort, "parseSort");
function num(raw2) {
  if (raw2 === void 0 || raw2 === "") return null;
  const n = Number(raw2);
  return Number.isFinite(n) ? n : null;
}
__name(num, "num");
search.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const safe = q.replace(/["'()*%_\\]/g, " ").trim();
  if (!safe) return c.json({ nodes: [], paths: {}, nextCursor: null });
  const workspaceId = c.get("workspace").id;
  const rawLimit = num(c.req.query("limit"));
  const limit = rawLimit === null ? DEFAULT_LIMIT : Math.min(Math.max(1, Math.trunc(rawLimit)), MAX_LIMIT);
  const sort = parseSort(c.req.query("sort"));
  const where = ["n.workspace_id = ?", "n.deleted_at IS NULL"];
  const whereBinds = [workspaceId];
  const type = c.req.query("type");
  if (type === "file" || type === "dir") {
    where.push("n.is_dir = ?");
    whereBinds.push(type === "dir" ? 1 : 0);
  }
  const from = num(c.req.query("from"));
  const to = num(c.req.query("to"));
  const min = num(c.req.query("min"));
  const max = num(c.req.query("max"));
  if (from !== null) {
    where.push("n.updated_at >= ?");
    whereBinds.push(Math.trunc(from));
  }
  if (to !== null) {
    where.push("n.updated_at <= ?");
    whereBinds.push(Math.trunc(to));
  }
  if (min !== null) {
    where.push("COALESCE(n.size, 0) >= ?");
    whereBinds.push(Math.trunc(min));
  }
  if (max !== null) {
    where.push("COALESCE(n.size, 0) <= ?");
    whereBinds.push(Math.trunc(max));
  }
  const order2 = sort === "name" ? "n.name ASC, n.id ASC" : sort === "size" ? "COALESCE(n.size, 0) DESC, n.id DESC" : "n.updated_at DESC, n.id DESC";
  const cursor = c.req.query("cursor") ?? "";
  let offset = 0;
  if (cursor.startsWith("u:") && sort === "recent") {
    const [, tsRaw, idRaw] = cursor.split(":");
    const ts = Number(tsRaw);
    if (Number.isFinite(ts) && idRaw) {
      where.push("(n.updated_at < ? OR (n.updated_at = ? AND n.id < ?))");
      whereBinds.push(ts, ts, idRaw);
    }
  } else if (cursor.startsWith("o:")) {
    const parsed = Number(cursor.slice(2));
    offset = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }
  const useFts = [...safe].length >= 3;
  const fromClause = useFts ? `FROM nodes_fts JOIN nodes n ON n.rowid = nodes_fts.rowid WHERE nodes_fts MATCH ? AND ${where.join(" AND ")}` : `FROM nodes n WHERE ${where.join(" AND ")} AND n.name LIKE ?`;
  const sql = `SELECT n.* ${fromClause} ORDER BY ${order2} LIMIT ? OFFSET ?`;
  const binds = useFts ? [`"${safe}"`, ...whereBinds, limit + 1, offset] : [...whereBinds, `%${safe}%`, limit + 1, offset];
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  const ancestorIds = /* @__PURE__ */ new Set();
  for (const r of page) {
    for (const id of String(r.path).split("/")) if (id) ancestorIds.add(id);
  }
  const nameById = /* @__PURE__ */ new Map();
  if (ancestorIds.size) {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, name FROM nodes WHERE workspace_id = ?1 AND id IN ${jsonSet()}`
    ).bind(workspaceId, jsonList([...ancestorIds])).all();
    for (const row of rows) nameById.set(row.id, row.name);
  }
  const paths = {};
  for (const r of page) {
    const segs = String(r.path).split("/").filter(Boolean).map((id) => nameById.get(id) ?? "").filter((n) => n !== "");
    paths[String(r.id)] = [...segs, String(r.name)].join("/");
  }
  const last = page[page.length - 1];
  const nextCursor = !hasMore || !last ? null : sort === "recent" ? `u:${last.updated_at}:${last.id}` : `o:${offset + page.length}`;
  return c.json({ nodes: page, paths, nextCursor });
});

// server/index.ts
var app = new Hono2();
app.onError(errorHandler2);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } }, 404));
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/s", publicShares);
app.use("/api/*", accessMiddleware);
app.route("/api/me", me);
app.route("/api/files", files);
app.route("/api/dirs", dirs);
app.route("/api/uploads", uploads);
app.route("/api/trash", trash);
app.route("/api/search", search);
app.route("/api/shares", shares);
app.route("/api/workspaces", workspaces);
app.route("/api/library", library);
app.route("/api/notifications", notifications);
var index_default = {
  fetch: app.fetch,
  async scheduled(_event, env2, ctx) {
    ctx.waitUntil(Promise.all([
      purgeExpiredTrash(env2),
      sweepOrphanObjects(env2),
      abortStaleUploads(env2),
      env2.DB.prepare(`UPDATE users SET used_bytes = (
        SELECT COALESCE(SUM(size), 0) FROM nodes
        WHERE nodes.owner_id = users.id AND deleted_at IS NULL
      )`).run()
    ]));
  }
};
export {
  index_default as default
};
/*! Bundled license information:

aws4fetch/dist/aws4fetch.esm.mjs:
  (**
   * @license MIT <https://opensource.org/licenses/MIT>
   * @copyright Michael Hart 2024
   *)
*/
//# sourceMappingURL=index.js.map
