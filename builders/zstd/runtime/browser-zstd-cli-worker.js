/* Experimental Zstandard upstream CLI: fresh isolated MEMFS worker per call. */
"use strict";
const LIMIT = 64 * 1024 * 1024;
const normalize = (name) => {
  if (typeof name !== "string" || name.length > 512 || !name.startsWith("/") ||
      name === "/" || name.includes("\\") ||
      name.split("/").some((part) => part === "." || part === "..") ||
      /^\/(?:dev|proc|etc|tmp)(?:\/|$)/.test(name)) {
    throw new Error("Each staged or requested file needs a safe absolute MEMFS path");
  }
  return name;
};
self.onmessage = async (event) => {
  const { coreJsUrl, wasmBytes, args, files, outputs } = event.data;
  const stdout = [], stderr = [];
  let captured = 0;
  const log = (stream, text) => {
    const message = String(text);
    captured += message.length;
    if (captured > 1024 * 1024) throw new Error("CLI log capture exceeded 1 MiB");
    (stream === "stdout" ? stdout : stderr).push(message);
    self.postMessage({ type: "log", stream, message });
  };
  try {
    importScripts(coreJsUrl);
    if (typeof createZstdCli !== "function") throw new Error("Upstream zstd CLI factory was not found");
    const core = await createZstdCli({
      wasmBinary: new Uint8Array(wasmBytes),
      locateFile: (name) => new URL(name, coreJsUrl).href,
      noInitialRun: true,
      print: (text) => log("stdout", text),
      printErr: (text) => log("stderr", text)
    });
    if (!core.FS || typeof core.callMain !== "function") throw new Error("Missing upstream CLI/MEMFS exports");
    for (const file of files) {
      const name = normalize(file.name);
      const slash = name.lastIndexOf("/");
      if (slash > 0) core.FS.mkdirTree(name.slice(0, slash));
      core.FS.writeFile(name, new Uint8Array(file.data));
    }
    let exitCode = 0;
    try {
      const returned = core.callMain(args);
      if (typeof returned === "number") exitCode = returned;
    } catch (error) {
      if (typeof error?.status === "number") exitCode = error.status;
      else throw error;
    }
    if (exitCode !== 0) {
      throw new Error("Upstream zstd CLI exited with code " + exitCode + "\n" + stderr.slice(-8).join("\n"));
    }
    const found = [], transfer = [];
    let totalOutput = 0;
    for (const raw of outputs) {
      const name = normalize(raw);
      const stat = core.FS.stat(name);
      if (!core.FS.isFile(stat.mode) || stat.size > LIMIT) throw new Error("CLI output not a regular bounded file: " + name);
      totalOutput += stat.size;
      if (totalOutput > LIMIT) throw new Error("Collected output exceeds 64 MiB");
      const data = core.FS.readFile(name);
      const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      found.push({ name, data: bytes });
      transfer.push(bytes);
    }
    self.postMessage({
      type: "done", exitCode,
      stdout: stdout.join("\n") + (stdout.length ? "\n" : ""),
      stderr: stderr.join("\n") + (stderr.length ? "\n" : ""),
      files: found
    }, transfer);
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
};
