#!/usr/bin/env node
// Builds dist/ from src/: stitches nav/footer partials into each page,
// inlines the compiled CSS, and re-wraps the result into the same
// __bundler/template JSON-string format the site has always shipped
// (see docs/superpowers/specs/2026-08-13-source-cleanup-design.md).
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const PAGES = [
  {
    file: "index.html",
    out: "index.html",
    title: "Hopkins Quant Trading",
    description:
      "Johns Hopkins University's only undergraduate quantitative finance club",
    prefetch: ["/about", "/competitions", "/apply"],
    activeNav: "home",
    boardEmailHref: "/about",
  },
  {
    file: "about.html",
    out: "about.html",
    title: "About Us · Hopkins Quant Trading",
    description:
      "Members, leadership, and the alumni network that keeps growing across the quant industry.",
    prefetch: ["/", "/competitions", "/apply"],
    activeNav: "about",
    boardEmailHref: "mailto:vpandit3@jhu.edu",
  },
  {
    file: "competitions.html",
    out: "competitions.html",
    title: "Competitions · Hopkins Quant Trading",
    description:
      "The Hopkins Trading Competition — a day-long market-making and estimation challenge on a live simulated exchange, hosted by HQT with cash prizes.",
    prefetch: ["/", "/about", "/apply"],
    activeNav: "competitions",
    boardEmailHref: "mailto:vpandit3@jhu.edu",
  },
  {
    file: "apply.html",
    out: "apply.html",
    title: "Apply · Hopkins Quant Trading",
    description:
      "Join Hopkins Quant Trading — application timeline, what to expect, and answers to frequently asked questions.",
    prefetch: ["/", "/about", "/competitions"],
    activeNav: "apply",
    boardEmailHref: "mailto:hopkinsquant@gmail.com",
  },
];

const STANDALONE_PAGES = ["apply-form.html", "register-form.html"];

function read(...parts) {
  return fs.readFileSync(path.join(...parts), "utf8");
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// HTML <script> content is parsed by the browser for the literal byte
// sequence "</" before any JS/JSON parsing happens, so a closing tag inside
// our JSON string would truncate the __bundler/template script early.
// / is the JSON/JS unicode escape for "/" — decodes back to "/" at
// JSON.parse time, so this is invisible to the runtime, just safe on disk.
function escapeClosingTags(jsonStr) {
  return jsonStr.replace(/<\//g, "<\\u002F");
}

function renderNav(activeKey) {
  const nav = read(SRC, "partials", "nav.html");
  const pattern = new RegExp(
    'class="nav-link"([^>]*data-nav="' + activeKey + '")',
  );
  return nav.replace(pattern, 'class="nav-link active"$1');
}

function renderFooter(boardEmailHref) {
  const footer = read(SRC, "partials", "footer.html");
  return footer.split("{{BOARD_EMAIL_HREF}}").join(boardEmailHref);
}

function splitDcScript(raw) {
  const marker = '<script type="text/x-dc" data-dc-script="">';
  const idx = raw.indexOf(marker);
  if (idx === -1) return { body: raw.trim(), script: "" };
  return { body: raw.slice(0, idx).trim(), script: raw.slice(idx).trim() };
}

function buildInnerDocument(body, script, css) {
  return [
    '<!DOCTYPE html><html style="overflow-x:hidden"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<script src="support.js"></script>',
    "</head>",
    "<body>",
    "<x-dc>",
    "<helmet>",
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">',
    "<style>" + css + "</style>",
    "</helmet>",
    body,
    "</x-dc>",
    script,
    "</body></html>",
  ].join("\n");
}

function buildPage(page, mainCss) {
  const raw = read(SRC, "pages", page.file);
  const withNav = raw.replace("{{NAV}}", renderNav(page.activeNav));
  const withFooter = withNav.replace(
    "{{FOOTER}}",
    renderFooter(page.boardEmailHref),
  );
  const { body, script } = splitDcScript(withFooter);
  const innerDoc = buildInnerDocument(body, script, mainCss);

  const templateJson = escapeClosingTags(JSON.stringify(innerDoc));
  const prefetchLinks = page.prefetch
    .map((href) => `  <link rel="prefetch" href="${href}">`)
    .join("\n");

  let shell = read(SRC, "shell.html");
  shell = shell
    .split("{{TITLE}}")
    .join(escapeHtml(page.title))
    .split("{{DESCRIPTION}}")
    .join(escapeHtml(page.description))
    .split("{{OG_TITLE}}")
    .join(escapeHtml(page.title))
    .split("{{OG_DESCRIPTION}}")
    .join(escapeHtml(page.description))
    .split("{{PREFETCH_LINKS}}")
    .join(prefetchLinks)
    .split("{{TEMPLATE_JSON}}")
    .join(templateJson);

  fs.writeFileSync(path.join(DIST, page.out), shell);
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const mainCss = read(SRC, "styles", "main.css");
  for (const page of PAGES) buildPage(page, mainCss);

  for (const file of STANDALONE_PAGES) {
    fs.copyFileSync(path.join(SRC, "pages", file), path.join(DIST, file));
  }

  // main.css is inlined into each bundled page (matching original behavior,
  // where relative asset URLs must resolve against the page, not a linked
  // stylesheet's own URL) so it isn't copied here. forms.css is linked
  // externally by the two standalone form pages, so it does need to exist
  // in dist/.
  fs.mkdirSync(path.join(DIST, "styles"), { recursive: true });
  fs.copyFileSync(
    path.join(SRC, "styles", "forms.css"),
    path.join(DIST, "styles", "forms.css"),
  );

  fs.copyFileSync(path.join(ROOT, "support.js"), path.join(DIST, "support.js"));
  copyDir(path.join(ROOT, "assets"), path.join(DIST, "assets"));

  console.log(
    "Built " +
      PAGES.length +
      " bundled pages + " +
      STANDALONE_PAGES.length +
      " standalone pages to dist/",
  );
}

build();
