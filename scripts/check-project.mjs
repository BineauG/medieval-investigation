import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const readJson = file => {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")); }
  catch (error) { errors.push(`${file}: ${error.message}`); return {}; }
};

const manifest = readJson("module.json");
const fr = readJson("languages/fr.json");
const en = readJson("languages/en.json");
if (manifest.id !== "medieval-investigation-toolkit") errors.push("module.json: invalid id");
if (Number(manifest.compatibility?.minimum) !== 13) errors.push("module.json: minimum must be 13");
if (manifest.compatibility?.maximum) errors.push("module.json: maximum compatibility must be omitted");
for (const file of [...(manifest.esmodules || []), ...(manifest.styles || []), ...(manifest.languages || []).map(item => item.path)]) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing manifest file: ${file}`);
}
if (!fr[manifest.id] || !en[manifest.id]) errors.push("Translation namespace missing");

const sourceFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|hbs|css)$/u.test(entry.name)) sourceFiles.push(full);
  }
}
walk(path.join(root, "scripts"));
walk(path.join(root, "templates"));
walk(path.join(root, "styles"));
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, "utf8");
  if (/actor\.system\b/iu.test(content)) errors.push(`${path.relative(root, file)}: actor.system access is forbidden`);
  const withoutSvgNamespace = content.replaceAll("http://www.w3.org/2000/svg", "");
  if (/https?:\/\//iu.test(withoutSvgNamespace)) errors.push(`${path.relative(root, file)}: external URL found`);
  if (/\bjQuery\b|\$\(/u.test(content)) errors.push(`${path.relative(root, file)}: jQuery usage found`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Project checks passed (${sourceFiles.length} source/template/style files).`);
