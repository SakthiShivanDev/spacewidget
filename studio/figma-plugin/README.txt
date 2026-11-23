SpaceWidget — Copy to Studio

One-time setup in the Figma desktop app:
1. Extract this ZIP into a folder.
2. Open Plugins > Development > Import plugin from manifest…
3. Select this folder's manifest.json.

Usage:
1. Select a frame in Figma.
2. Run SpaceWidget · Copy to Studio, then Export selection.
3. Click Copy for Studio.
4. Switch to Studio and press Ctrl/Cmd+V outside an input, or use Import Figma.
5. Review Editable layers / Visual snapshot and select the import destination.

Normal Figma Ctrl+C uses Figma's own clipboard data; it is not an editable
SpaceWidget export. If the browser supplies a PNG, Studio can import that as a
visual snapshot. This plugin provides editable, named layers without an API token.

Editable imports preserve measured positions at the original frame size. Text
needs the same fonts installed/bundled in the Flutter app. Vectors, masks,
gradients, effects and other unsupported layers become PNG images. A visual
snapshot preserves the exported appearance as one image, without editable layers.

The plugin does not send data to any server and does not alter the Figma file.
Exports are limited to 10 selections, 500 layers, 24 levels, 1.5 MB and 16 MP per
image. For a large selection, use Visual snapshot only or copy a smaller frame.

Development plugin ID: spacewidget-studio-export. Publishing to Figma Community
requires obtaining your own plugin ID from Figma and updating manifest.json.
