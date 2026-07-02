import { serveDir } from "@std/http/file-server";
import generateReport from "./supabase/functions/generate-report/index.ts";

Deno.serve({ port: 3000 }, (req) => {
  const p = new URL(req.url).pathname;
  if (p === "/functions/v1/generate-report") {
    return generateReport.fetch(req);
  }
  if (p.startsWith("/assets/")) {
    return serveDir(req, { fsRoot: "./dist", urlRoot: "" });
  }
  return serveDir(req, { fsRoot: ".", urlRoot: "" });
});
