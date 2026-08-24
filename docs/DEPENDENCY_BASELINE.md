# Dependency baseline

Resolved on 2026-08-15 from the npm registry. Versions are intentionally pinned
in the manifests and lockfile.

| Dependency        | Version | Role                                                  |
| ----------------- | ------- | ----------------------------------------------------- |
| Electron          | 43.4.0  | Desktop runtime and Chromium PDF backend              |
| TypeScript        | 7.0.2   | Strict application and package type checking          |
| React / React DOM | 19.2.8  | Renderer UI                                           |
| Vite              | 8.2.1   | Renderer bundling and development server              |
| electron-vite     | 5.0.0   | Desktop-aware Vite orchestration                      |
| Vitest            | 4.1.10  | Unit and integration tests                            |
| Zod               | 4.4.3   | Runtime boundary validation                           |
| markdown-it       | 15.0.0  | Markdown tokenization and HTML generation             |
| Shiki             | 4.4.3   | Syntax highlighting                                   |
| KaTeX             | 0.18.4  | Static LaTeX formula rendering                        |
| Mermaid           | 11.16.1 | Static diagram rendering in isolated Chromium         |
| DOMPurify         | 3.4.13  | SVG and restricted Mermaid foreignObject sanitization |
| sanitize-html     | 2.17.7  | Safe static publication HTML filtering                |
| electron-builder  | 26.15.3 | Desktop packaging                                     |
| pnpm              | 11.21.0 | Workspace package manager                             |

The initial implementation intentionally adds no second browser runtime.
The desktop runtime's bundled Chromium is the production print backend.
