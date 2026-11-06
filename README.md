# Paper Garden Demo

Import a PDF, highlight a passage, and add it to a Markdown note. Use **New note** and **Insert note link** to connect your notes.

PDFs, notes, and highlights stay in your browser. Use **Export backup** before moving to a different browser or clearing site data. The demo does not connect to Google Drive or Gemini. Optional online metadata lookups send the search query to Crossref.

## GitHub Pages

In **Settings → Pages**, set the publishing source to **GitHub Actions**. Then run **Deploy Paper Garden Demo** from the **Actions** tab. The site is served under the repository's Pages path.

## Build locally

Use Node.js 24 and the pnpm version in package.json.

    pnpm install --frozen-lockfile
    pnpm test
    pnpm build

Serve the contents of dist/ over HTTP.
