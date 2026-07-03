import * as esbuild from "esbuild";

const isWatch = Deno.args.includes("--watch");
const isMinify = Deno.args.includes("--minify");

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!isWatch && (!supabaseUrl || !supabaseAnonKey)) {
  console.error("Build Error: SUPABASE_URL or SUPABASE_ANON_KEY environment variables are missing or empty!");
  Deno.exit(1);
}

const ctx = await esbuild.context({
  entryPoints: ["src/script.ts"],
  bundle: true,
  outfile: "dist/script.js",
  platform: "browser",
  format: "esm",
  minify: isMinify,
  define: {
    SUPABASE_URL: JSON.stringify(supabaseUrl),
    SUPABASE_ANON_KEY: JSON.stringify(supabaseAnonKey),
  },
});

if (isWatch) {
  await ctx.watch();
  console.log("Watching for changes in src/script.ts...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Successfully built dist/script.js");
}
