const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");

const DEFAULT_PORT = 18765;

class ClaudeCodeIpcServer extends EventEmitter {
  constructor({ socketPath, stateDir }) {
    super();
    this.socketPath = socketPath;
    this.stateDir = stateDir || path.dirname(socketPath);
    this.tokenFile = path.join(this.stateDir, "claudecode-runtime.token");
    this.portFile = path.join(this.stateDir, "claudecode-runtime.port");
    this.authToken = "";
    this.port = 0;
    this.server = null;
    this.clients = new Set();
    this.authenticated = new Set();
  }

  start() {
    if (this.server) return;
    this.ensureDirectory();
    this.generateAuthToken();

    this.server = net.createServer((socket) => {
      this.clients.add(socket);
      socket.setEncoding("utf8");

      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (!this.authenticated.has(socket)) {
              if (msg?.type === "auth" && msg?.token === this.authToken) {
                this.authenticated.add(socket);
              }
              continue;
            }
            if (validateIpcMessage(msg)) {
              this.emit("clientMessage", msg, socket);
            }
          } catch {
            // ignore malformed
          }
        }
      });

      socket.on("close", () => {
        this.clients.delete(socket);
        this.authenticated.delete(socket);
      });

      socket.on("error", () => {
        this.clients.delete(socket);
        this.authenticated.delete(socket);
      });
    });

    // On Windows, use TCP instead of Unix sockets (Node.js Unix sockets are unreliable on Windows)
    if (process.platform === "win32") {
      this.server.listen(DEFAULT_PORT, "127.0.0.1", () => {
        this.port = DEFAULT_PORT;
        this.savePortFile();
      });
      this.server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          // Fall back to random port
          this.server.listen(0, "127.0.0.1", () => {
            this.port = this.server.address().port;
            this.savePortFile();
          });
        }
      });
    } else {
      this.server.listen(this.socketPath, () => {
        try {
          fs.chmodSync(this.socketPath, 0o600);
        } catch {
          // ignore on platforms where chmod doesn't apply
        }
      });
    }
  }

  savePortFile() {
    try {
      fs.writeFileSync(this.portFile, String(this.port), { mode: 0o600 });
    } catch {
      // ignore
    }
  }

  broadcast(event) {
    const payload = JSON.stringify(event) + "\n";
    for (const client of this.authenticated) {
      try {
        client.write(payload);
      } catch {
        // ignore dead sockets
      }
    }
  }

  ensureDirectory() {
    fs.mkdirSync(this.stateDir, { recursive: true });
  }

  generateAuthToken() {
    this.authToken = crypto.randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(this.tokenFile, this.authToken, { mode: 0o600 });
    } catch {
      // ignore
    }
  }

  removeAuthToken() {
    try {
      fs.unlinkSync(this.tokenFile);
    } catch {
      // ignore
    }
  }

  removePortFile() {
    try {
      fs.unlinkSync(this.portFile);
    } catch {
      // ignore
    }
  }

  async close() {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    this.authenticated.clear();

    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      this.server = null;
    }

    this.removeAuthToken();
    this.removePortFile();
  }
}

function validateIpcMessage(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return false;
  }
  const type = msg.type;
  if (typeof type !== "string") {
    return false;
  }
  switch (type) {
    case "sendUserMessage":
      return typeof msg.workspaceRoot === "string" && typeof msg.text === "string";
    case "respondApproval":
      return typeof msg.workspaceRoot === "string" && typeof msg.requestId === "string";
    default:
      return true;
  }
}

module.exports = { ClaudeCodeIpcServer };
