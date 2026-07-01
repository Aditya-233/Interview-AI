import { serveDir } from "@std/http/file-server";
import generateReport from "./supabase/functions/generate-report/index.ts";

let jsCache: string | null = null;
let cssCache: string | null = null;

async function getJS() {
  if (jsCache) return jsCache;
  const out = await new Deno.Command(Deno.execPath(), { args: ["bundle", "--minify", "--platform=browser", "src/main.ts"] }).output();
  return (jsCache = new TextDecoder().decode(out.stdout));
}

async function getCSS() {
  if (cssCache) return cssCache;
  const out = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "npm:@tailwindcss/cli", "-i", "src/index.css", "-m"] }).output();
  return (cssCache = new TextDecoder().decode(out.stdout));
}

Deno.serve({ port: 3000 }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/functions/v1/generate-report") return generateReport.fetch(req);
  if (url.pathname === "/assets/index.js") return new Response(await getJS(), { headers: { "content-type": "application/javascript" } });
  if (url.pathname === "/assets/index.css") return new Response(await getCSS(), { headers: { "content-type": "text/css" } });
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response((await Deno.readTextFile("index.html")).replace("/src/main.ts", "/assets/index.js"), { headers: { "content-type": "text/html" } });
  }
  return serveDir(req, { fsRoot: ".", urlRoot: "" });
});
