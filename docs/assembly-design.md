# Depth AI — software assembly visual study

The preceding atlas made source ownership and navigation work, but visually remained a node graph with grouped platforms. This study tests a different organizing principle: one software result with inspectable functional assemblies underneath it.

The reference's useful property is a readable cutaway: contents and connections help explain what happens in each space. This study applies that principle to an exploded assembly instead of committing the product to a fantasy town or subway metaphor.

## Why test this representation?

Depth AI needs composition, reference, behavior and implementation to be understood together. An assembly gives the result and its constituent roles a persistent physical context. Disassembly exposes those roles; selecting one opens its actual module membership and source. Shared graph data remains one assembly rather than being duplicated for each consumer.

This is a hypothesis to evaluate, not an established best interface. A physical machine metaphor may itself require explanation. The next assessment should check whether a reader can locate a function, identify its dependencies and explain its effect without memorizing the metaphor.

| Visible form | Software role | Meaning |
|---|---|---|
| Optical scanner | C# / Dart analysis | Source is transformed into structure |
| Repository cartridges | Snapshots, CLI proposals, approval and apply | Work is tied to a source version |
| Connected central crystal | Common entities and relations | Several consumers share one representation |
| Display assembly | Unity interface and navigation | Structure becomes a visible interactive surface |
| Selection reticle | Runtime object bridge | A visible object is associated with component sources |
| Deployment unit | Build and internal verification | Implementation is packaged and checked |

The shapes are visual metaphors, not measurements of complexity or execution time. Docking cartridges correspond to actual proposed modules. Their size does not encode line count.

## Implemented

- Real WebGL geometry, lighting, shadows, camera rotation and zoom; no generated scene bitmap substitutes for the model.
- Animated assembled/exploded transitions and actual raycast picking.
- Six functional regions, 21 authored proposed modules and 214 source symbols, shared with the atlas through `design/atlas/project-model.js`.
- Actual original source spans, per-module rationale, member navigation and static relationship navigation.
- Project import, CLI development and runtime selection lenses. These highlight related groups, not observed runtime activity.
- An embedded saved screenshot of the existing Unity application. Selecting an authored screen mapping emphasizes the corresponding implementations. It is not a live target program.

Physical cables aggregate indexed cross-region relations. A dashed API cable additionally represents the manually checked HTTP route between UI and service, which Roslyn does not resolve as a direct call. Thin screen-space leader lines identify parts and are not software dependencies.

## Limits

The purpose is to assess the visual structure before building a production Unity interface. There is no live CLI/MCP event feed, source watcher, target program stream or runtime object selection connection in this viewer. Source intent and module boundaries are authored proposals, not recovered author intent. Data is a snapshot. Real-scale hierarchical layout and usability with thousands of modules remain unverified.

The output screen and actual runtime picking bridge are deliberately distinguished from the authored screenshot mappings. C# analysis still has the limitations documented in the atlas study.

## Open and verify

Open `design/assembly/index.html` in a WebGL-capable browser, or run `scripts/open-assembly.cmd` to export fresh sources first. The local classic-script vendor build also works from a file URL.

```powershell
node tests/assembly.smoke.cjs
node tests/atlas.smoke.cjs
```

The assembly test checks actual WebGL rendering, assembled and exploded transitions, actual 3D mesh picking, real source navigation, output mapping and browser exceptions. It does not validate the metaphor's comprehensibility.

Three.js r169 is vendored under its MIT license in `design/assembly/vendor`. The classic build wraps the unmodified module body and exposes its named exports as `window.THREE`; the original module and license are retained. [Official documentation](https://threejs.org/docs/).
