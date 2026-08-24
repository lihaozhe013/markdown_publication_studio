# Repository Engineering Policy

These rules are mandatory for every change in this repository. Keep this file
focused on durable engineering policy. Product requirements and architecture
belong in `PROJECT_SPEC.md`; feature plans, release notes, migration notes,
investigations, and manual test plans belong under `docs/`.

When this policy conflicts with an explicit task instruction from the repository
owner, follow the explicit task instruction and call out the deviation in the
change summary.

## 1. Language and Documentation

- All source-code comments, doc comments, commit messages, engineering
  documentation, configuration comments, and newly created repository prose MUST
  be written in English.
- Chinese or other localized text MUST NOT be added to engineering comments or
  documentation. Localized user-facing strings are exempt and SHOULD be isolated
  from implementation code when practical.
- When touching an existing non-English engineering comment or documentation
  section, translate the affected text to English as part of the same change.
- Names and prose MUST explain intent. Do not add comments that merely restate
  the code.
- `PROJECT_SPEC.md` is the product and architecture source of truth. Do not
  silently change product scope or architecture to make an implementation
  easier. Material deviations require an explicit rationale in the change
  summary and an update to the relevant design document.
- Keep `AGENTS.md` limited to durable repository policy. Do not place temporary
  implementation plans, TODO lists, debugging notes, or release-specific
  instructions here.

## 2. Toolchain and Dependency Policy

- This repository uses **pnpm exclusively** for JavaScript/TypeScript package
  management. Do not use `npm`, `yarn`, or Bun to install, remove, update, or
  execute repository dependencies.
- The root `package.json` MUST contain a pinned `packageManager` field for the
  repository pnpm version. The version MUST match the current repository
  baseline.
- `pnpm-lock.yaml` is authoritative and MUST be committed. Dependency changes
  that modify `package.json` MUST include the corresponding lockfile update.
- Use the latest stable releases required by `PROJECT_SPEC.md`. Do not introduce
  alpha, beta, RC, canary, nightly, `next`, or other prerelease dependencies
  unless the task explicitly requires them.
- Do not downgrade the desktop runtime, TypeScript, React, Vite, pnpm, or
  another baseline dependency merely to work around an implementation problem
  without explicit approval.
- Pin toolchain behavior through repository configuration and the lockfile.
  Avoid relying on globally installed tools.
- Add a dependency only when it provides clear value over a small, maintainable
  local implementation. Before adding a new runtime dependency, consider bundle
  size, maintenance status, security history, desktop runtime compatibility, and
  whether the capability belongs in the main, preload, renderer, or shared
  layer.
- Keep desktop runtime dependencies and renderer/frontend dependencies
  conceptually separated. Do not import Node-only packages into browser renderer
  code.
- Prefer ESM for new JavaScript/TypeScript tooling and configuration unless a
  dependency or desktop runtime boundary requires CommonJS.
- Do not manually edit generated dependency contents under `node_modules/`.

## 3. TypeScript Requirements

- TypeScript 7 or newer stable TypeScript 7.x is mandatory, as defined by
  `PROJECT_SPEC.md`. Do not downgrade to TypeScript 6.x.
- All application and library source code MUST be TypeScript. JavaScript source
  files are allowed only for unavoidable third-party/tooling compatibility
  shims.
- TypeScript MUST run in strict mode. Do not weaken compiler options globally to
  silence errors.
- The shared strict baseline SHOULD enable at least:
  - `strict`
  - `noUncheckedIndexedAccess`
  - `exactOptionalPropertyTypes`
  - `useUnknownInCatchVariables`
  - `noImplicitOverride`
  - `noFallthroughCasesInSwitch`
  - `noEmit` for type-check-only projects
- Prefer `unknown` over `any`. `any` requires a narrow, documented
  interoperability reason and MUST NOT be used as a general escape hatch.
- Do not use `@ts-ignore` unless no safer alternative exists. Prefer
  `@ts-expect-error` with a concise explanation and ensure the suppression
  remains testable.
- Public interfaces across process or package boundaries MUST have explicit
  types. Do not depend on inferred structural shapes for IPC contracts,
  persisted configuration, export jobs, or publication models.
- Runtime inputs crossing trust boundaries MUST be validated. Use Zod or the
  repository-standard validation layer for IPC payloads, project files,
  persisted configuration, external data, and AI service responses.
- Keep environment-specific type domains separate. Desktop main/preload code may
  use Node/desktop runtime types; renderer code MUST NOT gain ambient Node
  access merely for convenience.
- Type-only imports SHOULD use `import type` where appropriate.

## 4. Desktop Architecture and Security

- The desktop runtime is both the application shell and the default Chromium
  rendering/printing backend. Do not add a second bundled Chromium through
  Puppeteer or Playwright unless a concrete requirement cannot be satisfied by
  the desktop runtime and the change is explicitly approved.
- Preserve the process boundaries defined in `PROJECT_SPEC.md`:
  - **main** owns privileged OS access, filesystem access, application
    lifecycle, job orchestration, hidden print windows, and native desktop APIs;
  - **preload** exposes a minimal, typed, explicitly reviewed bridge;
  - **renderer** contains the React UI and MUST remain browser-sandboxed;
  - publishing/rendering logic SHOULD live in focused core modules rather than
    in React components or IPC handlers.
- Browser windows that render application UI or untrusted publication content
  MUST use secure defaults:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true` whenever compatible with the specific window role
- Do not expose `ipcRenderer`, filesystem primitives, shell execution,
  unrestricted paths, or generic request forwarding directly to renderer code.
- Every IPC channel MUST have a narrow purpose, typed request/response
  contracts, runtime validation for untrusted inputs, and explicit error
  behavior.
- Prefer `ipcMain.handle`/`invoke` style request-response APIs for commands.
  Avoid open-ended event buses and stringly typed IPC conventions.
- Treat Markdown, HTML, CSS, local assets, remote assets, publication metadata,
  and AI-generated content as potentially untrusted input. Never grant
  publication content Node.js privileges.
- Navigation, new-window creation, external URL opening, protocol handling, and
  remote content loading MUST be explicitly constrained. Do not allow arbitrary
  renderer-controlled navigation.
- Production PDF export MUST use a dedicated hidden/offscreen rendering path or
  equivalent isolated print target. Do not export directly from the user's
  interactive preview WebContents.
- Rendering code MUST wait for deterministic readiness conditions such as fonts,
  images, diagrams, math, and other asynchronous assets before printing.
  Arbitrary fixed sleeps are not an acceptable primary synchronization
  mechanism.
- Keep the print backend behind an explicit interface so Chromium printing can
  be replaced or supplemented later without rewriting the publication model or
  job system.

## 5. React and Renderer Policy

- React is the renderer UI framework. Use function components and modern React
  APIs.
- React components MUST NOT own filesystem, PDF, job-queue, desktop lifecycle,
  or other privileged business logic.
- Keep components focused on presentation and interaction. Move reusable state
  transitions, domain logic, and asynchronous workflows into hooks, services, or
  domain modules with clear ownership.
- Avoid global mutable state. Introduce a state-management dependency only when
  React's built-in state/context patterns demonstrably become insufficient.
- Do not introduce a Markdown editor or editor-centric architecture unless the
  product specification is explicitly changed. The application is a
  publication/batch-processing tool, not a writing environment.
- Accessibility is part of correctness. Interactive controls MUST be keyboard
  reachable and use appropriate semantic HTML/ARIA where native semantics are
  insufficient.
- Do not use browser `localStorage` as the authoritative store for publication
  projects or critical application state. Persist durable state through the
  repository-defined application storage layer.

## 6. Vite and Build Boundaries

- Vite is the development/build tool for renderer-facing code unless
  `PROJECT_SPEC.md` is explicitly revised.
- Keep desktop main, preload, and renderer build targets separate enough that
  Node-only code cannot accidentally enter the browser bundle.
- Do not use Vite aliases or bundler configuration to bypass sound package
  boundaries or TypeScript errors.
- Production builds MUST NOT depend on the Vite development server.
- Development-only conveniences such as HMR MUST NOT change runtime security
  assumptions or production behavior.
- Any custom Vite plugin or build transform MUST have a clear
  repository-specific need and SHOULD be covered by a focused test when it
  affects generated publication output or application boot behavior.

## 7. Formatting and Linting

- **Prettier is mandatory** and is the sole formatter for supported repository
  text/code formats.
- Install and pin Prettier locally. Do not rely on a globally installed or
  transiently downloaded formatter.
- Formatting MUST be deterministic and repository-controlled through a committed
  Prettier configuration and ignore file.
- Do not use ESLint formatting rules that conflict with Prettier. Use
  `eslint-config-prettier` or the current equivalent integration to disable
  conflicting stylistic lint rules.
- **ESLint is mandatory** for JavaScript/TypeScript/React code quality checks.
  Use the current flat-config format (`eslint.config.*`), not legacy
  `.eslintrc*` configuration.
- ESLint SHOULD use `typescript-eslint` with type-aware linting for application
  source where practical. Prefer the current project-service based configuration
  rather than maintaining redundant ESLint-only TypeScript project files unless
  tooling compatibility requires otherwise.
- React-specific linting SHOULD cover hooks correctness and other high-value
  React invariants. Avoid large stylistic rule sets that duplicate Prettier or
  create low-signal churn.
- Lint rules MUST prioritize correctness, unsafe behavior, dead code, promise
  handling, type safety, React hooks, import hygiene, and desktop runtime
  boundary violations over subjective style preferences.
- Do not suppress lint rules globally to make a change pass. Narrow suppressions
  require a nearby explanation when the reason is not self-evident.

## 8. Cross-Platform Requirements

- The application is cross-platform. New functionality MUST support Windows,
  macOS, and Linux unless the task explicitly narrows its scope.
- A Windows-only PowerShell script, batch file, registry operation, macOS-only
  shell command, or Linux-only utility MUST NOT be the sole implementation of a
  normal build, test, development, export, or maintenance workflow.
- Prefer Node.js/TypeScript APIs and established cross-platform packages for
  repository automation. When a separate script is more appropriate, prefer
  TypeScript/Node. For Python-only tooling, use `uv run` and keep it portable.
- Do not create parallel shell, PowerShell, and batch implementations when one
  portable script can serve all supported platforms.
- Platform-specific packaging/notarization/signing steps are allowed inside the
  relevant packaging workflow, but MUST NOT become prerequisites for normal
  development on other platforms.
- Use Node `path` utilities and URL APIs for filesystem/URL construction. Do not
  hardcode path separators, drive letters, home directories, executable
  suffixes, or platform-specific temp paths in shared code.
- Use desktop runtime/Node APIs to resolve user data, cache, logs, temporary
  files, and application resources. Do not assume a writable current working
  directory.
- Case sensitivity differences between Windows/macOS/Linux filesystems MUST be
  considered when resolving publication assets and project files.

## 9. Publication and Rendering Correctness

- The publication model is a first-class domain boundary. Do not reduce the
  system to ad hoc Markdown-to-HTML string concatenation.
- Markdown parsing, publication assembly, theme application, HTML rendering,
  printing, and PDF post-processing MUST remain separable stages with explicit
  inputs and outputs.
- Local asset resolution MUST be deterministic and project-relative. Avoid
  behavior that depends on the process working directory.
- Print-specific CSS and screen-preview CSS MAY differ where necessary, but
  final PDF behavior is authoritative for publication correctness.
- Do not silently ignore missing assets, failed diagram rendering, failed font
  loads, malformed project configuration, or PDF assembly errors. Surface
  actionable errors through the job system.
- Batch jobs MUST have explicit states and deterministic failure/cancellation
  semantics. One failed document SHOULD NOT corrupt unrelated queued outputs.
- Export operations SHOULD be idempotent for the same source/configuration
  inputs unless the operation explicitly contains nondeterministic AI
  generation.
- AI-generated cover artwork MUST be treated as an asset input. Titles,
  subtitles, author names, logos, and other required publication text SHOULD be
  composed deterministically through HTML/CSS or another layout layer rather
  than entrusted to image-generation text rendering.
- AI features MUST NOT become a hidden dependency of the core publication
  pipeline. A project that does not use AI MUST remain fully exportable offline,
  subject only to its referenced local/remote assets.

## 10. Logging and Debugging

- Application logging MUST be available without requiring terminal stdout/stderr
  redirection.
- Persistent logs SHOULD be written to an application-specific log directory
  resolved through desktop runtime/OS APIs. Development console output may
  supplement file logs but MUST NOT be the only debugging channel.
- Startup MUST remain resilient if a log file cannot be created.
- Never log API keys, authentication tokens, private publication content
  unnecessarily, generated secrets, credentials, or other sensitive values.
- Logs added for a feature or investigation SHOULD use a stable, searchable
  subsystem prefix such as `[render]`, `[export]`, `[ipc]`, or `[cover]`.
- Generated `*.log` files MUST remain untracked.
- Debug-only verbose logging MUST NOT be enabled by default in production
  builds.
- When handing off a debugging workflow, provide a ready-to-run command and,
  where useful, an `rg` filter that isolates the relevant subsystem.
- `pnpm dev` MUST write the development session's desktop/Vite output and
  application logs to the root `debug.log` file. The file is regenerated at the
  start of each development session and is ignored by Git. Agents can filter it
  with `cat debug.log | rg 'xxx'`.

## 11. Code Organization and File Size

- Preserve established package and module boundaries unless a refactor is part
  of the requested change.
- New modules MUST have one clear responsibility. Avoid circular dependencies,
  broad shared mutable state, barrel files that hide problematic dependency
  direction, and generic `utils` modules that become dumping grounds.
- Domain code MUST NOT import from renderer UI modules.
- Shared modules MUST remain environment-safe. A module imported by renderer
  code MUST NOT transitively depend on Node.js or desktop main-process APIs.
- Prefer dependency injection or explicit parameters for services that are
  difficult to test, including filesystem access, AI providers, print backends,
  clocks, and job persistence.
- Every source file over 800 lines MUST trigger an explicit design review before
  more responsibilities are added. Evaluate cohesion, dependency direction,
  state ownership, and whether behavior belongs in focused modules.
- Do not allow a file to cross 800 lines without recording the assessment in the
  change summary or commit body.
- When modifying an existing file already over 800 lines, avoid increasing its
  scope. Split cohesive behavior when doing so is lower risk than continuing to
  grow the file.
- Generated files, vendored code, lockfiles, and machine-generated schemas are
  exempt from source-file size limits.

## 12. Testing Policy

- Tests SHOULD be placed at the narrowest layer that can prove the behavior:
  - unit tests for pure publication/domain logic;
  - integration tests for Markdown-to-HTML, project loading, asset resolution,
    IPC contracts, job orchestration, and PDF assembly;
  - Desktop application tests only for behavior that genuinely requires the
    desktop runtime/Chromium.
- Use Vitest as the default test runner unless a test requires a more
  specialized harness.
- Rendering tests SHOULD prefer deterministic fixtures and structural
  assertions. Use snapshot tests selectively; do not treat large opaque HTML/PDF
  snapshots as the only proof of correctness.
- Critical rendering fixtures SHOULD cover local images, syntax-highlighted
  code, tables, print backgrounds, page sizing, and asset-loading failure
  behavior.
- Tests involving AI providers MUST use mocks/fakes by default. Automated test
  suites MUST NOT require paid API calls or network access unless explicitly
  marked as optional integration tests.
- Tests MUST NOT write persistent user data outside temporary test directories.
- A bug fix SHOULD include a regression test when the failure can be reproduced
  deterministically.

## 13. Required Validation

Before every commit, run the repository validation commands relevant to the
change. The root package scripts SHOULD expose these canonical commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

For changes affecting bundling, desktop startup, preload boundaries, packaging,
or production-only behavior, also run:

```bash
pnpm build
```

Additional rules:

- `pnpm format:check` MUST verify Prettier formatting without modifying files.
  Use the repository's write-mode formatting command (normally `pnpm format`)
  before the check when needed.
- `pnpm typecheck` MUST run TypeScript without emitting artifacts and MUST cover
  all maintained TypeScript projects/configurations.
- `pnpm lint` MUST fail on ESLint errors. CI SHOULD treat warnings as failures
  unless the repository deliberately documents a narrow exception.
- Do not report a check as successful unless it was actually run.
- Clearly state every required check that could not be completed and why.
- GUI behavior that cannot be validated reliably in the agent environment MUST
  be handed off with concise, platform-neutral manual verification steps.
- Do not make one operating system the canonical acceptance path for
  cross-platform behavior.
- Do not commit with known type errors, lint errors, failing tests, or
  formatting drift unless the user explicitly requests an intermediate broken
  state.

## 14. Package Scripts and Repository Commands

- Root scripts are the canonical developer interface. Prefer `pnpm <script>`
  over documentation that invokes underlying binaries directly.
- At minimum, the repository SHOULD provide consistent scripts for development,
  formatting, linting, type checking, tests, build, and packaging as those
  capabilities are introduced.
- Scripts MUST be cross-platform. Do not rely on shell-specific syntax such as
  inline POSIX environment assignments, shell glob expansion, or chained
  platform-specific commands when a portable Node-based solution is appropriate.
- Avoid hidden side effects in validation scripts. `lint`, `typecheck`, `test`,
  and `format:check` MUST NOT mutate source files.
- Use `pnpm exec <tool>` when direct execution of a locally installed binary is
  necessary outside a package script.

## 15. Commits

- Every commit MUST use a complete Conventional Commits message:
  `<type>(optional-scope): imperative summary`.
- Use the narrowest accurate type, such as `feat`, `fix`, `refactor`, `docs`,
  `test`, `build`, `ci`, `perf`, or `chore`. Vague subjects such as
  `update files`, `changes`, or `misc fixes` are forbidden.
- Non-trivial commits MUST include a body that explains the motivation, the
  behavior change, and important compatibility, migration, security, or
  validation details.
- Breaking changes MUST use `!` in the header or a `BREAKING CHANGE:` footer.
- Keep commits focused. Do not mix unrelated cleanup, dependency churn,
  refactoring, and feature work in one commit.

## 16. Safety and Repository Hygiene

- Inspect `git status` before editing. Preserve unrelated user changes and do
  not rewrite, stage, discard, or reformat them without permission.
- Never commit credentials, API keys, private keys, tokens, generated logs, user
  publication data, local databases, build artifacts, signing materials, or
  machine-specific configuration.
- Secrets MUST NOT be stored in repository configuration or renderer-accessible
  state. Use an appropriate OS/application secret mechanism when persistent
  credentials are eventually required.
- Destructive or irreversible commands require explicit user approval.
- Do not run `git reset --hard`, destructive `git clean`, force pushes, mass
  file deletion, or equivalent destructive operations without explicit approval.
- Use `rg` for text search, `fd` for file discovery, and `uv run` for Python
  commands.
- Do not use dependency installation, formatter runs, or automated codemods as
  an excuse to rewrite unrelated files.
- Generated output directories MUST be ignored unless a fixture or golden
  artifact is intentionally versioned for a documented test.
- Keep changes narrowly scoped to the requested task and its necessary
  supporting work.

## 17. Agent Change Handoff

Every non-trivial agent-completed change MUST end with a concise handoff
containing:

1. what changed and why;
2. important architecture or security decisions;
3. files/modules with meaningful new responsibilities;
4. validation commands actually run and their results;
5. checks not run and the reason;
6. any remaining limitations or follow-up work that is genuinely required.

Do not claim completion when required behavior is knowingly unimplemented. Do
not hide degraded behavior behind successful compilation or superficial UI
output.
