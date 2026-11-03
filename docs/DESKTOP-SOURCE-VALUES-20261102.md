# Module value editing and Meta responsibilities — 0.9.0

The user asked which Meta models actually perform the work, and pointed out that values were not easily editable in the module workspace. The previous editor was a hidden, numeric-only C# field proposal. It did not meet that requirement.

## Configured model roles

These are the current local configuration and implemented application routes, not a fresh model availability or quality claim. No live Meta request was made during this change.

| Operation | Implementation |
|---|---|
| Semantic module grouping, source-grounded explanations, split/integrate proposals, Meta CLI | Configured `muse-spark-1.3` through the Meta Model API, `https://api.meta.ai/v1/` |
| 2D images and 3D-style raster images | Configured `muse-image-1.0`, PNG asset route |
| Real GLB/3D mesh generation | Not implemented by that active asset route; the UI marks it unsupported |
| Symbol IDs, locations, references and source values | Roslyn, TypeScript compiler and Dart analyzer, followed by deterministic source/hash validation |
| User-entered exact value changes | Direct AST literal replacement; no model call |
| Preview | Actual project runtime, web host or engine/window adapter; not an AI-generated imitation of the project |

The service first indexes the real source. Selected modules, relationships and bounded source context are supplied to Meta for semantic explanations or change proposals. Returned IDs and source evidence are checked. Proposals use the existing review, revision/hash checks, project validation and apply/history pipeline. Model explanations describe design rationale and evidence; they are not access to a model's private internal reasoning.

The product UI selects the Meta provider. Legacy/self-hosted and older provider compatibility code still exists in the service, but is not an automatic fallback. SAM and the older worker protocols are not the active default image path. The new **AI models** button displays model IDs and these responsibilities without making an inference request. A configured key does not mean the connection was verified in this run. Credentials are not printed or packaged.

## What changed

- A **Values** panel now sits directly inside the module workbench. Selecting a module exposes supported source literals from that declaration, its owned members and reachable dependencies. A value badge on a graph module and **Edit values** in Details open the same panel.
- C#, JavaScript/TypeScript and Dart values come from real AST locations. Numbers, strings and booleans have appropriate controls; C# single-character literals are also supported. Each field shows its source file, line, literal and available type information.
- **Apply edits (N)** saves the changed fields currently displayed together. Same-file replacements are combined in descending span order. The existing proposal assessment, source revision/hash checks and required validation policy remain enforced. When a project's required checks have not passed, the panel opens the normal review path instead of silently applying.
- Invalid numbers, integer overflow/fractions, invalid booleans, stale revisions, duplicate spans and code-expression injection are rejected. String escaping preserves data, including quotes, newlines and Dart dollar signs. Decimal suffix and precision handling are retained.
- **Undo last value edit** uses the existing history/undo proposal pipeline. Applied changes request an update from the shared runtime host. Static web is reloaded; the existing engine-specific restart/hot-reload policies still apply. A requested runtime update is not a guarantee that every engine rebuilt successfully.
- Draft fields survive collapsing or switching modules within the same indexed source revision. A changed project/revision discards stale drafts. Drafts are not persisted across application restarts.
- Older service sessions without the value-editing capability are explicitly read only. An older main process without runtime IPC is reported as requiring restart instead of blocking source-workspace initialization.

Implementation: `src/Depth.Service/SourceValues.cs`, `WorkspaceIndex.cs`, `Indexer.cs`, `WebAnalysis.cs`, the web/Dart analyzers, `desktop/ui/value-editor.js`, `value-editor.css`, and the module/selection hooks in `app.js` and `assembly.js`.

## Verification performed

| Scope | Evidence |
|---|---|
| Service regression | **240 assertions passed**, `artifacts/source-values-service-final.log`; includes 16 source-value cases covering discovery, exact edits, input rejection, batch apply, stale revision, decimal precision and undo |
| Actual service + shipped renderer DOM + real project HTTP/JavaScript | **52 checks**, `artifacts/runtime-dom-1793621050167/report.json`; edits price `48 → 60` and discount `0.2 → 0.25`, confirms exact source replacements and real server output, executes the changed project JavaScript to display `$45.00`, restores original source with undo, checks draft retention, invalid input and required validation |
| Actual Dart analyzer + service + application execution | **9 checks**, `artifacts/source-values-dart-a502ea3398/report.json`; edits a double, string and boolean together, compiles/runs the actual modified Dart program, verifies its exact output and unchanged comment, then restores original source |
| TypeScript project regression | `tests/web_workspace.py`, `artifacts/web-graph-448da1b7d6/`; aliases, exclusions, JavaScript calls, JSX construction, source/context/impact and an actual `tsc` validation in a changed copy before apply |
| Electron host contract | **38 checks**, `artifacts/runtime-host-1793620619131/report.json`; includes static runtime reload on applied source. Electron objects are fixtures |
| Existing product workflows | **39 checks**, `artifacts/cohesion-contract-1793620465562/`; Meta/asset responses are explicit fixtures; build/run and source application use real copies |
| Complete desktop test command | `npm --prefix desktop test` passed before the final draft/old-process regression additions. The affected renderer suite was then rerun and passed all 52 checks above |
| Deployment equality | **77 files** match, `artifacts/source-values-package-20261102.json`; `.env` excluded |

DOM, fixture, service and language checks overlap and must not be summed into a count of features or native pixel checks. The web application's JavaScript ran in a DOM harness, not a successful new Electron screenshot. No new Meta inference, PNG generation or mesh generation is claimed.

## Native screen result and remaining limits

The existing older user visual-review session was reloaded for read-only layout review. `values-090-layout.json` and `values-090-layout-fixed.json` reported UI not ready; `values-090-diagnostic.json` reported `UnknownVizError`. No new PNG was produced. A later error-state request did not receive a result, and PID 22876 was absent when checked. We did not stop that user process and do not infer why it exited.

The updated **0.9.0** EXE was directly launched with `--runtime-smoke`, PID **7860**. `artifacts/source-values-native-20261102/stderr.log` records **Mojo IPC access denied (0x5)** and sandbox cache permission errors. The process exited without a successful native review or screenshot. Security settings were not weakened. The extended `actual-project-runtime-2-values` smoke procedure is implemented, but its new native value-edit checks have not passed in an actual EXE run.

Editing is limited to supported literals with an exact indexed owner and source span. Computed/runtime values, interpolated strings, JSX text/attributes, HTML/CSS properties, tagged templates and arbitrary languages do not acquire automatic editing. Language-specific type semantics still require the project's build/test validation; this feature is not a complete refactoring or runtime-state debugger. Unknown elements and unsupported values remain unsupported rather than receiving invented bindings.

The broader Unity/Flutter/native runtime and actual GLB limitations in [the engine bridge record](DESKTOP-ENGINE-BRIDGES-20261102.md) still apply. New native visual review, arbitrary-project behavior preservation and full product acceptance remain incomplete.

## Deployment

`artifacts/desktop/Depth AI.exe` now loads UI **0.9.0** and the new `resources/service-0.9.0/` service. Packaging installs the new service beside the old one so a running older service is not overwritten. The old service directory and old verification evidence are retained. Restart the updated EXE to load the new main/preload/service; an in-page reload cannot update those processes. Keep the complete desktop folder together.
