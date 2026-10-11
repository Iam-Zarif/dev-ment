import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const modules = [
  "auth", "dashboard", "question", "assessment", "application",
  "invitation", "attempt", "evaluation", "payment", "profile", "admin",
];
const load = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const read = (p) => readFileSync(resolve(root, p), "utf8");
const normalize = (path) =>
  path
    .split("?")[0]
    .replaceAll(/\{\{[^}]+\}\}/g, ":param")
    .replaceAll(/:[a-zA-Z][a-zA-Z0-9_]*/g, ":param")
    .replace(/\/+$/, "") || "/";
const signature = (method, path) => method.toUpperCase() + " " + normalize(path);
const flatten = (items) => items.flatMap((item) =>
  item.request ? [item] : flatten(item.item || []));
const routeIndex = read("src/app/routes/index.ts");
const imports = Object.fromEntries(
  [...routeIndex.matchAll(/import\s+(\w+)\s+from\s+"\.\/(\w+)\.routes\.js"/g)]
    .map((m) => [m[1], m[2]])
);
const mounts = Object.fromEntries(
  [...routeIndex.matchAll(/router\.use\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g)]
    .map((m) => [imports[m[2]], m[1]])
);
const routes = new Set();
for (const module of modules) {
  const prefix = mounts[module];
  if (!prefix) throw new Error("Missing route registration: " + module);
  const source = read("src/app/routes/" + module + ".routes.ts");
  const matches = [...source.matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)];
  if (!matches.length) throw new Error("No routes parsed for: " + module);
  for (const [, method, path] of matches) routes.add(signature(method, prefix + path));
}
const paymentRoutes = read("src/app/routes/payment.routes.ts");
for (const [, method, path] of paymentRoutes.matchAll(
  /\bpaymentWebhookRouter\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g
)) routes.add(signature(method, path));

const documented = new Set();
const errors = [];
const moduleDocs = [];
for (const module of modules) {
  const source = load("docs/postman/" + module + ".json");
  moduleDocs.push(source);
  for (const item of flatten(source.item || [])) {
    const request = item.request || {};
    const url = typeof request.url === "string" ? request.url : request.url?.raw;
    if (typeof url !== "string" || !url.startsWith("{{baseUrl}}/")) {
      errors.push("Invalid base URL: " + module + " / " + item.name);
      continue;
    }
    const key = signature(request.method, url.slice("{{baseUrl}}".length));
    documented.add(key);
    if (!routes.has(key)) errors.push("Unregistered documented route: " + key);
    if (request.body?.mode === "raw") {
      try { JSON.parse(request.body.raw); }
      catch { errors.push("Invalid example JSON: " + module + " / " + item.name); }
    }
  }
}
for (const route of routes) if (!documented.has(route)) errors.push("Undocumented route: " + route);
const master = load("docs/postman/Dev-ment.postman_collection.json");
const masterItems = flatten(master.item || []);
const modularItems = moduleDocs.flatMap((m) => flatten(m.item || []));
const itemKey = (i) => {
  const url = typeof i.request.url === "string" ? i.request.url : i.request.url?.raw;
  return signature(i.request.method, url.slice("{{baseUrl}}".length));
};
const count = (items) => {
  const out = new Map();
  for (const i of items) out.set(itemKey(i), (out.get(itemKey(i)) || 0) + 1);
  return out;
};
const countsA = count(masterItems);
const countsB = count(modularItems);
for (const key of new Set([...countsA.keys(), ...countsB.keys()])) {
  if (countsA.get(key) !== countsB.get(key)) {
    errors.push("Combined collection mismatch: " + key);
  }
}
const globals = load("docs/postman/Dev-ment.postman_globals.json");
const variables = new Set([
  ...globals.values.map((v) => v.key),
  ...(master.variable || []).map((v) => v.key),
]);
for (const item of modularItems) {
  const raw = JSON.stringify(item.request);
  for (const match of raw.matchAll(/\{\{([^{}]+)\}\}/g)) {
    if (!match[1].startsWith("$") && !variables.has(match[1])) {
      errors.push("Missing Postman variable: " + match[1]);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Postman docs OK: " + routes.size + " registered routes covered; " +
    modularItems.length + " documented requests; JSON examples and variables valid."
  );
}
