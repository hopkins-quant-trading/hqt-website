# Source cleanup: readable source, identical output

## Problem

The six page files (`index.html`, `about.html`, `competitions.html`, `apply.html`,
`apply-form.html`, `register-form.html`) are each a thin outer HTML shell wrapping
a "bundler" mechanism: a `<script type="__bundler/template">` tag whose content is
the entire page — nav, hero, sections, footer, plus a React/Babel `DCLogic`
component for list rendering (team members, FAQs, gallery, etc.) — serialized as a
single-line JSON string. A ~140-line unpacking script decodes this at runtime via
`DOMParser` and blob URLs, originally to support embedding base64 assets (the
manifest for this is currently empty — no assets are actually embedded that way).

Because JSON strings can't contain literal newlines, the entire page markup is
unavoidably one very long line (e.g. line 176) in every file. Every element also
carries a large inline `style="..."` attribute, hover effects are faked via a
custom `style-hover` attribute parsed by `support.js` at runtime, and the mobile
responsive rules are CSS attribute-selectors matching against inline style
strings (`nav[style*="justify-content: space-between"]{...}`) — fragile, and
unreadable to edit by hand.

Goal: make the source editable and reviewable, without changing anything a site
visitor experiences.

## Non-goals

- No visual/behavioral changes. Every animation, hover effect, and interaction
  works identically before and after.
- Not touching `support.js` (README: generated from a separate `dc-runtime`
  source, should not be hand-edited).
- Not touching `api/*.js` or the Airtable/Vercel backend.
- Not removing the bundler-unpack mechanism or the React/Babel/DCLogic
  templating for dynamic lists (`sc-for`/`sc-if`) — both stay, by explicit
  decision during design review.
- Not introducing a frontend framework or client-side build tooling beyond a
  small Node script.

## Approach

Split **source** (what you edit) from **output** (what ships). Source is plain,
multi-line, Prettier-formatted HTML/CSS/JS with shared partials. A build script
stitches source into the exact same bundler-wrapped format the site uses today,
written to `dist/`, which Vercel deploys.

### Layout

```
src/
  shell.html         outer bundler-wrapper template (head, unpack script, manifest/ext_resources
                      placeholders, closing tags) — shared by every page
  partials/
    nav.html          shared nav markup (each page marks its own active link)
    footer.html        shared footer markup
  pages/
    index.html         hero, about-us, feature blocks, track record, gallery, CTA
                        + the page's DCLogic <script type="text/x-dc"> component, unchanged logic
    about.html          leadership, members, destinations
    competitions.html    featured competition, what-to-expect
    apply.html           closed-application card, FAQ
    apply-form.html      membership application form
    register-form.html   competition registration form
  styles/
    main.css            fonts, reset, shared nav/footer/card/button styles, animations,
                         responsive breakpoints (real @media rules, real classes)
    forms.css            apply-form.html / register-form.html specific styles

scripts/
  build.js             reads src/shell.html + src/partials + src/pages + src/styles,
                        stitches nav/footer into each page, inlines the relevant CSS into
                        a <style> tag, JSON-encodes the resulting document into the
                        __bundler/template format, writes dist/*.html

package.json            new: prettier as a devDependency; "build" and "format" scripts
vercel.json              add buildCommand: "npm run build", outputDirectory: "dist"
.gitignore               add dist/, node_modules/
```

`dist/*.html` is generated output — same tree-shape and bundler format as
today's committed HTML files, byte-for-byte equivalent in rendered behavior.
It is not hand-edited and (like other build output) is gitignored.

### CSS conversion

Every inline `style="..."` becomes a class in `main.css` (or `forms.css` for
the two form pages). The `style-hover` attribute + JS shim is replaced with
real `:hover` rules. The attribute-selector mobile overrides
(`nav[style*="..."]`) are replaced with ordinary class-based `@media
(max-width:680px)` rules matching the same breakpoints and values as today.
Colors, spacing, typography, and animation timings are carried over exactly —
this is a mechanical extraction, not a redesign.

### Dynamic content (DCLogic / React / Babel)

Unchanged in mechanism. Each page's `<script type="text/x-dc" data-dc-script="">`
block (the `class Component extends DCLogic { renderVals() {...} }`) moves into
its `src/pages/*.html` file as ordinary multi-line, Prettier-formatted JS —
today it's already plain JS, just squeezed into the giant JSON string. The
`sc-for`/`sc-if` custom-attribute templating, `support.js`, and the
React/Babel-in-browser rendering all continue to work exactly as they do now.

### Build script behavior

`scripts/build.js` is a small, dependency-free Node script (uses only `fs`/`path`):

1. Read `src/shell.html` as the outer wrapper template.
2. For each file in `src/pages/`:
   a. Read the page body, inject the matching `src/partials/nav.html` (marking
      the current page's link active) and `src/partials/footer.html`.
   b. Inline the compiled CSS (`main.css` + `forms.css` where relevant) into a
      `<style>` tag, matching today's inline `<style>` block placement.
   c. Serialize the resulting HTML string as JSON (matching the existing
      `/`-escaped, backslash-n-newline format already used in the
      `__bundler/template` script tag).
   d. Substitute this into `src/shell.html`'s template slot, along with the
      page `<title>` and `<meta>` description/og tags (pulled from a small
      front-matter block at the top of each `src/pages/*.html` file).
   e. Write the result to `dist/<page>.html`.
3. No manifest/ext_resources population — both stay `{}` / `[]`, matching
   current (unused) behavior.

### Verification

- `npm run build` produces `dist/*.html`.
- Diff each `dist/*.html` against the current committed HTML file: outer shell
  and unpack script should match; only the *formatting* of the JSON-encoded
  template content should differ (whitespace/attribute-order only — the
  decoded DOM must be equivalent).
- Serve `dist/` locally (e.g. `npx serve dist` or `vercel dev`) and manually
  check all 6 pages in a browser: nav active states, hover effects (photo
  swap on index, card hover, destination logo hover), scroll-reveal
  animations, the gallery marquee, FAQ accordion, and both forms' submit
  flows — all should look and behave identically to the current live
  behavior.
- Run `npm run format` (Prettier) over `src/` and confirm no file has an
  unreasonably long line (this was the original complaint).

## Risks

- **Escaping bugs**: hand-rolling the JSON string encoding in `build.js` is
  the one place a mistake could silently break a page (wrong escape sequence,
  mismatched quotes). Mitigated by using `JSON.stringify()` for the encoding
  step itself (not a hand-written string-replace), which handles escaping
  correctly by construction — the build script's own logic is just about
  *what* HTML string gets stringified, not how it's escaped.
- **CSS extraction drift**: manually moving hundreds of inline style
  declarations into classes risks small visual regressions (a missed
  property, a typo'd value). Mitigated by the verification pass above
  (side-by-side browser check per page) before considering this done.
