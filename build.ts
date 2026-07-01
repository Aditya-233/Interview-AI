async function build() {
  await Deno.mkdir("dist/assets", { recursive: true });

  const run = async (args: string[]) => {
    const out = await new Deno.Command(Deno.execPath(), { args }).output();
    if (!out.success) {
      console.error(new TextDecoder().decode(out.stderr));
      Deno.exit(1);
    }
  };

  await run([
    "run",
    "-A",
    "npm:esbuild",
    "src/main.ts",
    "--bundle",
    "--minify",
    "--platform=browser",
    "--outfile=dist/assets/index.js",
  ]);

  await run([
    "run",
    "-A",
    "npm:@tailwindcss/cli",
    "-i",
    "src/index.css",
    "-o",
    "dist/assets/index.css",
    "-m",
  ]);

  await Deno.writeTextFile(
    "dist/index.html",
    (await Deno.readTextFile("index.html")).replace(
      "/src/main.ts",
      "assets/index.js",
    ),
  );
}
if (import.meta.main) build();
