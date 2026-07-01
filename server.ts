import { serveDir } from "@std/http/file-server";
import generateReport from "./supabase/functions/generate-report/index.ts";

let js = "", css = "";
const run = async (args: string[]) =>
  new TextDecoder().decode(
    (await new Deno.Command(Deno.execPath(), { args }).output()).stdout,
  );

Deno.serve({ port: 3000 }, async (req) => {
  const p = new URL(req.url).pathname;

  if (p === "/functions/v1/generate-report") {
    return generateReport.fetch(req);
  }

  if (p === "/assets/index.js") {
    return new Response(
      js ||= await run([
        "bundle",
        "--minify",
        "--platform=browser",
        "src/main.ts",
      ]),
      { headers: { "content-type": "application/javascript" } },
    );
  }

  if (p === "/assets/index.css") {
    return new Response(
      css ||= await run([
        "run",
        "-A",
        "npm:@tailwindcss/cli",
        "-i",
        "src/index.css",
        "-m",
      ]),
      { headers: { "content-type": "text/css" } },
    );
  }

  if (p === "/" || p === "/index.html") {
    return new Response(
      (await Deno.readTextFile("index.html")).replace(
        "/src/main.ts",
        "/assets/index.js",
      ),
      { headers: { "content-type": "text/html" } },
    );
  }
  return serveDir(req, { fsRoot: ".", urlRoot: "" });
});
