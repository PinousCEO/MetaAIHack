# Actual project runtime correction — 0.7.0

The user clarified that the entire left pane must show the project's actual application, with CLI and module selection sharing that project. Depth AI themes must never recolor the application. The prior Checkout preview was a second HTML implementation generated from `depth.preview.json`. Its screenshots proved only that projection, **not an actual project runtime**. Earlier positive feedback about the docking arrangement is not approval of that architecture.

## Implemented

- Removed the hardcoded Checkout renderer from the default application. No runtime produces an explicit connection state, never a substitute shopping UI. The default new-user example is now `samples/RuntimeWeb`, a separately runnable HTML/CSS/JS project with working quantity/coupon logic.
- `desktop/runtime-core.cjs` detects `depth.runtime.json`, web npm scripts, static HTML/build output, Flutter, Unity, and generic application-window targets. Import only inspects configuration. Run starts a project explicitly, keeps its working directory/process/logs, and stops only the owned process tree. No shell wrapper or host API credentials are passed by the runtime launcher.
- `runtime-host.cjs` loads actual local development pages into a separate sandboxed Electron `WebContentsView`, with a separate session and a narrow inspector preload. Host CSS, theme and IPC are absent there. Application JS and normal pointer input remain active in Interact mode.
- Static hosting serves the actual project files, rejects hidden/configuration secrets and escaped paths, and annotates actual HTML tags with their source path and line. Authored `data-depth-source`/`data-depth-line` annotations or configured CSS selector bindings connect dynamic application elements to indexed source. It does not claim that a pixel reveals every underlying function automatically.
- Inspect sends source locations to the actual index and `/runtime/select`. Unknown locations stay unmapped. Source selection shows the existing full composition; reverse selection sends indexed incoming source ranges to a separate, mild overlay. It never restyles the project DOM or compounds opacity on ancestors.
- Both Console and Meta CLI accept `/preview run`, `connect [URL]`, `stop`, `reload`, `inspect [off]`, and `status`. Natural-language Meta requests receive the same project/revision/runtime URL and selected source metadata. Approved file changes reload a static preview; development servers retain their own rebuild/HMR mechanism. Native targets still require their own rebuild.
- Running application windows can be chosen for Electron window capture, including Unity Editor/Player, Flutter desktop, native applications and emulator windows. A selection grants access to that window once; it does not capture the desktop or grant access to project JavaScript. This path is implemented but **not native-tested in this environment**.
- Dock moves/resize/modal/drag states update or hide the native project view; the runtime survives workbench theme changes. This host contract is fixture-tested, not a substitute for native docking tests.

## Current capabilities and remaining work

| Project path | Implemented connection | Current verification / limit |
|---|---|---|
| Static web | Serve actual HTML/CSS/JS; run its code; source locations and explicit module annotations | Actual HTTP + application DOM execution + analysis service passed; Electron pixels blocked |
| Web development server | Start npm dev/start or attach a localhost URL; separate browser view | URL detection/process/view contracts tested; actual Chromium startup blocked |
| Flutter web | Detect SDK/project and start `flutter run -d web-server --no-pub`, or attach existing server | SDK exists; actual launch rejected at SDK cache lockfile permission. Canvas/widget-to-Dart binding is **not implemented automatically** |
| Unity Editor/Player | Detect Unity project and choose its real application window | MCP read-only probe connected to `WorldVR`, not this repository. No modification to WorldVR. Native stream not verified; GameObject-to-code picking inside captured pixels is **not implemented** |
| Other desktop/mobile | Choose running native/emulator window, or connect a local web runtime | Native stream not verified; device build/deploy, OS input forwarding, iOS remote preview and arbitrary native element-to-source mapping are **not implemented** |

This is not universal automatic preview completion. The user’s full requirement remains open. Do not label window pixels as source inspection or fixture success as real engine execution. Do not revert the product to Unity/MR; Unity here is an imported project type.

## Project configuration

`depth.runtime.json` in the selected project, for example:

```json
{
  "targets": [
    {
      "id": "web",
      "label": "My actual application",
      "kind": "web",
      "url": "http://localhost:5173/",
      "bindings": [
        {"selector": "#checkout-total", "path": "src/pricing.ts", "line": 12}
      ]
    }
  ]
}
```

Supported kinds are `web`, `static`, `flutter`, `unity`, `native`. Static targets can set project-relative `directory` and `entry`. An explicitly configured process uses `command` (an executable) and `args` (an array). Arguments are not shell-parsed. `Run` is required; project import does not automatically execute an imported command. Flutter dependencies must already be restored in the project's SDK environment; this runtime does not silently run package installation.

## Verification

- `runtime-test.cjs`: actual local HTTP, actual sample project JS in DOM, source resolution and process fixtures. No native renderer/Flutter/Unity claim.
- `runtime-host-test.cjs`: injected Electron lifecycle, permissions, origin restrictions, window choices, viewport and source-message contracts. No native capture claim.
- `runtime-dom-test.cjs`: actual shipped UI + actual .NET/Web compiler indexing + actual local server; explicit IPC and Meta fixtures. Confirms CLI runtime commands, selected source/composition, context inclusion, project switching and existing feature navigation.
- Existing product flow: **39 checks** passed in `artifacts/cohesion-contract-1793609260513/`, including real validation-copy builds/apply with explicit Meta fixtures. The updated test label accurately describes opening an indexed workspace rather than a working native preview.
- Previous 244-check `dom-test.cjs` implementation was preserved as `declared-preview-dom-test.cjs`; it tests the removed projection and is **not** counted for this runtime. `dom-test.cjs` now runs the real-runtime DOM integration suite. Legacy style-study and live-smoke scripts still describe the old projection and are not valid runtime acceptance evidence.
- Direct Electron attempt PID **17724** failed before rendering: `artifacts/runtime-native-20261102/stderr.log`, Mojo IPC access denied `0x5`. **No new native PNG**. The old user review PID 22876 is no longer running.
- Actual Flutter SDK command failed opening `C:\Users\dlfgu\Flutter\flutter\bin\cache\lockfile` for write. Permissions and sandbox were not weakened or bypassed. Re-running or copying the SDK to evade this denial was not attempted.
- New `--runtime-smoke` and `--smoke` inspect actual RuntimeWeb JS interaction, host-theme isolation, runtime-to-source selection, shared CLI context and stop/reload. They capture the OS window plus the separate project render surface; writing the test is **not a successful native execution**.

The deploy manifest and final checks are recorded in `artifacts/actual-runtime-package-20261102.json`. The .NET service and `.env` were not changed or bundled. No new actual Meta call was performed in this correction.

## References used for the implementation

- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view): independent project rendering and bounds.
- [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer) and [session](https://www.electronjs.org/docs/latest/api/session): selected application-window stream and session permissions.
- [Flutter web embedding](https://docs.flutter.dev/platform-integration/web/embedding-flutter-web): actual rendered Flutter application isolation; it does not provide automatic widget/source mapping.
