async function build() {
  console.log("Starting static build...");
  
  // 1. Create dist directory
  await Deno.mkdir("dist/assets", { recursive: true });

  // 2. Bundle TS to JS using esbuild
  console.log("Bundling TypeScript...");
  const jsCmd = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "npm:esbuild", "src/main.ts", "--bundle", "--minify", "--platform=browser", "--outfile=dist/assets/index.js"],
  }).output();
  if (!jsCmd.success) {
    console.error(new TextDecoder().decode(jsCmd.stderr));
    Deno.exit(1);
  }

  // 3. Compile Tailwind CSS
  console.log("Compiling Tailwind CSS...");
  const cssCmd = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "npm:@tailwindcss/cli", "-i", "src/index.css", "-o", "dist/assets/index.css", "-m"],
  }).output();
  if (!cssCmd.success) {
    console.error(new TextDecoder().decode(cssCmd.stderr));
    Deno.exit(1);
  }

  // 4. Copy index.html and update paths
  console.log("Copying index.html...");
  let html = await Deno.readTextFile("index.html");
  html = html.replace("/src/main.ts", "/assets/index.js");
  await Deno.writeTextFile("dist/index.html", html);

  console.log("Build complete! Static files are in the 'dist' directory.");
}

if (import.meta.main) {
  build();
}
