// One command, three outputs: a hostable single file, a fragment for the
// Claude artifact viewer, and the same page with the browser checks attached.
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { createHash } from "crypto";

const watch = process.argv.includes("--watch");
const opts = {
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: !watch,
  format: "iife",
  target: ["es2020", "chrome100", "safari15", "firefox100"],
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  outdir: "build",
  entryNames: "app",
  loader: { ".js": "jsx" },
  jsx: "automatic",
  legalComments: "none",
  logLevel: "info"
};

// The mark goes in as a data URI so the single file stays a single file.
const ICON = '<link rel="icon" href="data:image/svg+xml;base64,' +
  readFileSync("brand/favicon.svg").toString("base64") + '">';

const FONTS = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Hanken+Grotesk:wght@400;500;600&family=Noto+Sans+Tamil:wght@400;500&display=swap">';

// The page carries its own content security policy, built from the hash of
// the exact script going into it. It is the backstop behind React's escaping
// rather than a replacement for it: an injected inline script has no matching
// hash, so the browser refuses to run it even if something upstream slipped a
// <script> past the renderer.
//
// default-src 'none' means every fetch kind has to be named below, so nothing
// is allowed by omission. connect-src 'none' is the important one for a tool
// that holds somebody's family: the page cannot make a network request at
// all, so there is nowhere for the data to go. Google Fonts is the only
// outside origin, and the only reason style-src is not 'none' too.
//
// frame-ancestors, report-uri and sandbox are ignored in a meta tag, so there
// is nothing here that can stop the page being embedded.
const sha256 = (s) => "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'";

function csp(scripts) {
  return '<meta http-equiv="Content-Security-Policy" content="' + [
    "default-src 'none'",
    "script-src " + scripts.map(sha256).join(" "),
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src data:",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'"
  ].join("; ") + '">';
}

function page(js, css, extra) {
  return [
    '<title>heriTrac</title>',
    ICON,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    FONTS,
    '<style>' + css + '</style>',
    extra || '',
    '<div id="root"></div>',
    '<script>' + js + '</script>'
  ].join("\n");
}

function emit() {
  const js = readFileSync("build/app.js", "utf8");
  const css = existsSync("build/app.css") ? readFileSync("build/app.css", "utf8") : "";
  mkdirSync("dist", { recursive: true });

  // dist/ is exactly what gets published to the web and nothing else, so a
  // host can be pointed straight at it. index.html so that a bare domain
  // serves the app; heritrac.html stays beside it as the name to download.
  writeFileSync("dist/index.html", [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="description" content="A family tree that works out what everyone is to you.">',
    '<title>heriTrac</title>',
    csp([js]),
    ICON,
    FONTS,
    '<style>' + css + '</style>',
    '</head><body>',
    '<div id="root"></div>',
    '<script>' + js + '</script>',
    '</body></html>'
  ].join("\n"));

  copyFileSync("dist/index.html", "dist/heritrac.html");

  // Neither of these belongs on the website. The artifact page carries no
  // content policy, because the viewer injects a runtime of its own, and the
  // test page is six hundred kilobytes that runs a suite on load. They go
  // into build/, which is not published and not committed.
  writeFileSync("build/page.html", page(js, css));

  // The checks run under the production policy, with the test script's own
  // hash added, so a policy that breaks React Flow or the fonts fails the
  // suite rather than shipping.
  const test = existsSync("test/browser.js") ? readFileSync("test/browser.js", "utf8") : "";
  if (test) {
    writeFileSync(
      "build/test.html",
      csp([js, test]) + "\n" + page(js, css, '<script>' + test + '</script>')
    );
  }

  for (const f of ["favicon.svg", "icon-32.png", "icon-512.png", "apple-touch-icon.png"]) {
    copyFileSync("brand/" + f, "dist/" + f);
  }

  const kb = (f) => (readFileSync(f).length / 1024).toFixed(1) + " KB";
  console.log("dist/index.html  " + kb("dist/index.html"));
}

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log("watching");
} else {
  await esbuild.build(opts);
  emit();
}
