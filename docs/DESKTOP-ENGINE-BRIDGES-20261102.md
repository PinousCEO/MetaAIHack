# Project engine bridges — 0.8.0

The left preview uses the imported application's own rendering. This update adds engine-side source inspection and input to the runtime connection introduced in 0.7.0. It does not restore Unity/MR as the Depth AI product and does not establish universal project support.

## Implemented behavior

- `runtime-bridge.cjs` receives actual engine PNG frames, normalized element bounds and source locations through a per-project loopback capability. It rejects wrong sessions, replayed frames, mismatched image dimensions, escaped source paths and unsupported input. Engine hit testing answers Inspect requests; rectangles alone do not establish the clicked source. Frames older than three seconds cannot receive input or remain shown as a connected engine.
- `runtime-adapters.cjs` installs a development adapter only when Run is selected. It preserves the project's original entry point and refuses to overwrite locally modified adapter files. Stop removes that session's capability file. Generated SDK source remains in the project; no Meta key is written into these files.
- Unity uses the actual Game view capture, scene root traversal, attached `MonoScript` paths, uGUI raycasts and collider raycasts. It has no global `Find` lookup loop. Projects with uGUI get pointer/click/scroll handlers; projects without that package compile without an EventSystems dependency. Run may enter/restart Play mode. Stop ends the managed Play session and leaves the Editor open without saving scene assets.
- Flutter uses the actual render tree and `WidgetInspectorService` creation locations, screenshots and hit testing. Its generated bootstrap calls the original `main`. Web-server and Windows targets are detected; `depth.runtime.json` can select another installed device. The existing Flutter SDK, restored dependencies and a debug build are required. The main application file is not rewritten.
- .NET 8+ WinForms uses the live control tree, actual registered delegates and portable PDB sequence points. The PDB document checksum must match the current source before a binding is published. Pointer input invokes the real control handler; text input edits the focused TextBox. Capture distinguishes window-client pixels from the live control's `DrawToBitmap` fallback.
- Runtime selection now unions **all** bound source compositions, preserves their IDs/relationships, marks their roots and passes all selected source IDs into Meta CLI context. The previous layout reused coordinates when the first root was unchanged and crashed as new members appeared; this is corrected.
- Module selection highlights matching engine regions with a separate 16% shade overlay. The app's original colors remain intact. Letterboxed margins reject input. Static web, existing localhost pages and basic window capture remain available.
- Approved code application reloads static pages, requests Flutter hot reload or restarts the managed native target. A preview restart failure does not misreport a successfully applied file change as a failed apply. An older running host is explicitly marked as requiring restart.
- Dart analysis was missing from desktop startup. `dart-runtime.cjs` now connects the installed native Dart executable to the analyzer. `package-dart.cjs` bundles its 19 resolved packages with relative URIs and licenses; it does not ship machine-specific pub-cache paths or modify the SDK/cache. The analyzer now normalizes Windows root paths.

## Verified evidence

| Scope | Result / evidence |
|---|---|
| Actual WinForms build and execution | **10 passed**, `artifacts/runtime-winforms-1793613029430/report.json`. Three separate pointer requests each increment exactly once, real TextBox input, real PDB handler/constructor locations, and rejection after source changes. |
| Actual WinForms rendering | `01-initial.png` and `02-after-pointer.png` were both directly inspected: Count 0 → Count 3. `captureMode` is **live-control-render**. These are actual target-control renders, **not Depth AI EXE screenshots**. |
| Actual Dart analyzer and .NET service | `artifacts/dart-graph-7cf8f99533/graph.js`: 11 declarations, 13 relations, 3 source files using the relocatable bundled analyzer. Cross-file calls, field references and constructors resolve; dynamic/same-name unrelated calls are not fabricated. |
| Flutter adapter static analysis | Installed SDK/analyzer result `artifacts/flutter-adapter-check/result.json`: no diagnostics. This does not prove a Flutter app ran. The normal analysis-server subprocess was denied; the existing analyzer API was used in-process for this static check. |
| Unity adapter compilation | Both `artifacts/unity-runtime-compile/compile.rsp` and `ugui.rsp` compile against installed Unity 6000.3.13f1 references, including its bundled template uGUI DLL. Compilation is not a Game view run. |
| Real HTTP / web application DOM | Runtime contract 35 checks, `artifacts/runtime-contract-1793614003120/`. |
| Engine protocol and installation | 28 checks, `artifacts/runtime-bridge-1793614003334/`. Real loopback HTTP and file installation with synthetic frame/geometry inputs; not engine execution. |
| Electron host contract | 37 checks, `artifacts/runtime-host-1793614003481/`. Injected Electron with real engine HTTP; includes picking, reverse highlight, stale frame recovery, native restart and cleanup. |
| Shipped renderer / actual service | 39 checks, `artifacts/runtime-dom-1793614005329/`. Multi-source composition, shared CLI sources, runtime label, themes, project switching and existing workflows. IPC and Meta are fixtures. |
| Existing product workflows | 39 checks, `artifacts/cohesion-contract-1793613436086/`. Actual build/run in change copies, split/integrate/apply and image-import behavior with explicit Meta/asset fixtures. |

`npm test` passed as a complete serial run, including the existing docking/source, capture-code, visual-review protocol and project-drop fixtures. An earlier concurrent attempt ended without a DOM report; that incomplete attempt is not counted as a pass. Counts above overlap and must not be summed into a feature or native-pixel total. No new actual Meta request was made.

## Actual execution failures and remaining limits

- The isolated Unity test used **only** `samples/RuntimeUnity` copied to `artifacts/runtime-unity-1793613109497/project`. PID 40488 did not deliver a frame. `editor.log` records license-client mutex/BIOS access failure and Package Manager IPC timeout; the test timed out and cleaned up its owned process/configuration. No existing WorldVR project was edited or stopped.
- Flutter application execution remains unverified because the installed SDK's cache lockfile is not writable from this environment. The SDK was not copied or changed to evade that denial. Static analysis and Dart source indexing are separate successes.
- New Depth AI EXE PID **30324** failed with **Mojo IPC 0x5**, recorded in `artifacts/engine-native-20261102/stderr.log`. No new host application PNG was produced. The stalled verification process was stopped; browser sandbox/security settings were not weakened.
- Process inspection now confirms the user's earlier visual-review process **22876 is still present** with `visual-review-2026-11-02T07-41-44-370Z/ready.json`. This corrects the earlier assumption that it was gone. It is an older main process and cannot validate the newly added runtime host. The process was preserved. New main/preload functionality requires restarting the updated application; reloading UI alone is insufficient.
- Unity source picking currently covers attached scripts through ancestors, uGUI and colliders. It does not establish exact source picking for UI Toolkit, every shader pixel, collider-free objects or arbitrary gameplay input. Bounds used for reverse highlight do not claim accurate occlusion.
- Flutter depends on version-sensitive debug inspector APIs, the first render view and available widget creation locations. Mobile SDK provisioning, device deployment, release-build inspection and full keyboard/IME/drag semantics are not complete.
- WinForms is the verified native framework. WPF, Qt, Java, arbitrary native canvases, iOS and other apps do not gain automatic source inspection from window capture. Embedded GPU controls may not render faithfully through DrawToBitmap.
- Dynamic web frameworks still need authored source metadata or configured bindings; the static HTML instrumentation does not infer every React/Vue handler from a pixel. Unknown mappings remain unknown.
- Source associations and indexed static compositions are not a complete runtime execution trace. Adapter source is generated development tooling and can appear in the indexed source list.

## Using the deployed version

Use the existing `artifacts/desktop/Depth AI.exe` with its complete resources folder. Open/drop the project, select its runtime target, then Run. `/preview run`, `inspect`, `reload`, `stop` and `status` operate on that same session from Console or Meta CLI. Inspect clicks open the associated source compositions; select a module to highlight its linked runtime regions.

WinForms detection currently requires a top-level .NET 8+ Windows Forms project with default compile items. Its dependencies must already be restored. A manifest can specify `kind: "native"`, `framework: "winforms"` and `project: "relative/path.csproj"`; the generated adapter must be included by that project's compilation. Unity requires the matching installed Editor; Flutter requires a configured SDK/device and existing package restore.

Deployment verification is recorded in `artifacts/engine-bridges-package-20261102.json`. App code, UI, SDKs and the relocatable Dart analyzer are updated; the unchanged .NET service hash is checked separately. `.env` is excluded. `--resources-only` does not overwrite a running service or Electron binary.

Primary API references: [Flutter inspector](https://api.flutter.dev/flutter/widgets/WidgetInspectorService-mixin.html), [Flutter screenshot](https://api.flutter.dev/flutter/widgets/WidgetInspectorService/screenshot.html), [Unity ScreenCapture bindings](https://github.com/Unity-Technologies/UnityCsReference/blob/master/Modules/ScreenCapture/ScriptBindings/ScreenCapture.bindings.cs), [Portable PDB format](https://github.com/dotnet/runtime/blob/main/docs/design/specs/PortablePdb-Metadata.md).
