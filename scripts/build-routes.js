import fs from "node:fs/promises";
import path from "node:path";
const html = await fs.readFile("dist/index.html", "utf8");
const entries = await fs.readdir("src/demos", { withFileTypes: true });
const slugs = [];
for (const entry of entries.filter((e) => e.isDirectory())) {
  const slug = entry.name;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error(`Invalid route ${slug}`);
  try {
    await fs.access(path.join("src/demos", slug, "App.jsx"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`Étude en cours, sans route publiée : ${slug}`);
      continue;
    }
    throw error;
  }
  await fs.mkdir(path.join("dist", slug), { recursive: true });
  await fs.writeFile(path.join("dist", slug, "index.html"), html);
  slugs.push(slug);
}
await fs.writeFile("dist/.nojekyll", "");
await fs.writeFile("dist/404.html", html);
console.log(`${slugs.length} routes statiques générées`);
if (process.env.EXPECTED_DEMOS && slugs.length !== Number(process.env.EXPECTED_DEMOS)) {
  throw new Error(`Expected ${process.env.EXPECTED_DEMOS} studies, found ${slugs.length}`);
}
