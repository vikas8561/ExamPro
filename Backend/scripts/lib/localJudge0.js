/**
 * A stand-in for Judge0, for running the exam checks on a laptop.
 *
 * The real judge lives on a private network address that only the servers can
 * reach, so scripts/exam/mixed-test-check.js could not grade a single coding
 * answer locally. This speaks exactly the slice of Judge0's API that
 * services/judge0.js uses — /about, /languages, /config_info, and batched
 * submit-then-poll on /submissions/batch, base64 throughout — and runs the
 * submitted Python with the local `python3`.
 *
 * What it proves: everything on ExamPro's side of the wire — sending cases,
 * pairing results to tokens, comparing output, awarding partial marks,
 * persisting the graded answer. What it cannot prove: Judge0 itself, its
 * sandbox or its limits. Run `npm run check-judge0` on a server for that.
 *
 * TEST USE ONLY. It executes whatever source it is sent, unsandboxed, so it
 * binds to 127.0.0.1 and only ever runs Python.
 *
 *   node scripts/lib/localJudge0.js            # listens on 127.0.0.1:2358
 *   JUDGE0_URL=http://127.0.0.1:2358 node server.js
 */

const http = require("http");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const PORT = Number(process.env.LOCAL_JUDGE0_PORT || 2358);
const PYTHON_IDS = [71, 92, 100, 109, 113];
const results = new Map();

const decode = (v) => (v ? Buffer.from(String(v), "base64").toString("utf8") : "");
const encode = (v) => (v === null || v === undefined || v === "" ? null : Buffer.from(String(v), "utf8").toString("base64"));

// Judge0's own comparison: trailing whitespace off each line, and off the end.
const strip = (text) => String(text ?? "").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\s+$/, "");

function run(submission) {
  const languageId = Number(submission.language_id);
  if (!PYTHON_IDS.includes(languageId)) {
    return { status: { id: 13, description: "Internal Error" }, message: encode(`localJudge0 runs Python only (got language ${languageId})`) };
  }
  const started = process.hrtime.bigint();
  const out = spawnSync("python3", ["-c", decode(submission.source_code)], {
    input: decode(submission.stdin),
    timeout: Math.max(1, Number(submission.wall_time_limit) || 5) * 1000,
    encoding: "utf8",
  });
  const time = (Number(process.hrtime.bigint() - started) / 1e9).toFixed(3);
  const stdout = out.stdout || "";
  const stderr = out.stderr || "";

  let status;
  if (out.error?.code === "ETIMEDOUT" || out.signal === "SIGTERM") status = { id: 5, description: "Time Limit Exceeded" };
  else if (out.status !== 0) status = { id: 11, description: "Runtime Error (NZEC)" };
  else if (submission.expected_output && strip(stdout) !== strip(decode(submission.expected_output))) status = { id: 4, description: "Wrong Answer" };
  else status = { id: 3, description: "Accepted" };

  return {
    status,
    stdout: encode(stdout),
    stderr: encode(stderr),
    compile_output: null,
    message: null,
    exit_code: out.status,
    exit_signal: null,
    time,
    memory: 1024,
  };
}

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/about") return send(res, 200, { version: "local-stand-in" });
  if (req.method === "GET" && url.pathname === "/languages") {
    return send(res, 200, PYTHON_IDS.map((id) => ({ id, name: `Python (local stand-in, id ${id})` })));
  }
  if (req.method === "GET" && url.pathname === "/config_info") {
    return send(res, 200, { max_submission_batch_size: 20, enable_compiler_options: false });
  }

  if (url.pathname === "/submissions/batch" && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(res, 400, { error: "bad json" }); }
      const tokens = (payload.submissions || []).map((submission) => {
        const token = crypto.randomUUID();
        results.set(token, { token, ...run(submission) });
        return { token };
      });
      send(res, 201, tokens);
    });
    return undefined;
  }

  if (url.pathname === "/submissions/batch" && req.method === "GET") {
    const tokens = String(url.searchParams.get("tokens") || "").split(",").filter(Boolean);
    return send(res, 200, { submissions: tokens.map((t) => results.get(t) || { token: t, status: { id: 13, description: "Internal Error" } }) });
  }

  return send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`localJudge0 listening on http://127.0.0.1:${PORT} (Python only, test use)`);
});
