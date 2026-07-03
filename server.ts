import { serveDir } from "@std/http/file-server";

// https://docs.deno.com/runtime/fundamentals/http_server/#serving-static-files
// https://docs.deno.com/runtime/fundamentals/http_server/#listening-on-a-specific-port

// Browser sends a GET / on 3000 to get root folder, then Deno serves it with /dist for root then no specific file was requested so it defaults to index.html
// index.html then asks for style.css logo.jpg script.js and Deno serves those file if present in /dist
Deno.serve({ port: 3000 }, (req) => serveDir(req, { fsRoot: "./dist" }));
