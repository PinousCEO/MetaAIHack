# Depth AI: project atlas prototype

This iteration uses the actual Depth AI repository, not game-example module data.

## Interaction and layout

- The overview places functional regions on shallow 3D platforms. Labels face the viewer so camera angle does not distort text. Generated industrial 3D illustrations distinguish analysis, workspace and runtime roles.
- Region titles and the left navigation open a region's real symbols. A module click preserves the overview and updates the inspector. Double-clicking a module opens its region.
- The inspector holds purpose, proposed separation rationale, all member symbols and connected modules. Source opens in a large drawer with source line anchors and navigable static relationships.
- Search covers functional module names, symbol names, paths and their source spans. The view shows at most 60 search matches and 12 symbols per module on a region platform; the inspector retains all members.
- Only the selected module's cross-module links appear in the overview. A runtime-area selection keeps the same spatial layout and highlights the selected subset.
- Project data and source anchors are common to all views; camera, selection and zoom are local view state.

## Evidence boundaries

The exported graph is produced by the existing Roslyn indexer. Functional ownership and Korean explanations in `design/atlas/atlas.js` are an authored design proposal based on these sources, not an AI-validated partition or a reconstruction of the original author's intent. Every indexed entity has exactly one owner. Calls refer to the actual indexed entity IDs.

The overview groups high-level roles while the region view exposes code declarations. Neither constitutes a proven solution for thousands of modules. Spatial placement is fixed and grouped for this repository; arbitrary project layout, multi-level clustering and graph performance still need implementation and evaluation.

`DepthDesktop.Import` reaches `Workspace.Import` through HTTP and the route declared in `Program.cs`. This is labeled API, not represented as a direct Roslyn call. `Workspace.Import` calls `Indexer.Scan`, which calls `SourceAccess.Files`. The path demonstrates source relationships, not an observed execution trace.

The output preview is a saved screenshot of the existing Unity build. The selectable screen-area mappings are authored and labeled as inferred. The actual runtime bridge implementation can be inspected, but this viewer does not receive live object selections. It does not run Codex, provide MCP, stream a target application, apply code edits or watch source files.

## Run and refresh

```powershell
./scripts/open-atlas.cmd
```

This regenerates `design/atlas/project-data.js` from current repository sources and opens `design/atlas/index.html`. The CMD launcher also works when Windows PowerShell script execution is disabled. Open the HTML file directly to use the existing snapshot. It is a browser interaction prototype; the Unity EXE has not been redesigned in this iteration.

```powershell
dotnet run --project src/Depth.Service -- --export-view "C:/path/to/project" "C:/path/to/output.js"
node tests/atlas.smoke.cjs
```

The export command is engine-neutral, but the functional catalog in the viewer currently targets this repository's types. The browser test validates unique ownership, real source navigation, actual canvas picking, group expansion, search and preview selection mapping. It does not prove functional grouping accuracy or large-project usability.

## Assets

Three transparent PNG assets were generated with the built-in image generation tool and copied into `design/atlas/assets`. The exact prompt set and mode are saved in `assets/prompts.json`.

- `analysis-core.png`: source-analysis prism and code plates.
- `workspace-core.png`: versioned repository cartridges.
- `runtime-core.png`: selectable object within viewport frames.

These are raster illustrations displayed within a canvas projection, not manipulable 3D meshes. The platforms and their camera projection are rendered by code.
