# GitViews Marketplace icon

Generator: built-in `image_gen` tool (imagegen skill), editing the original GitViews icon.
Project asset: `media/marketplace-icon.png`.
Marketplace export: 256x256 RGBA PNG, downscaled with Lanczos resampling. Original full-resolution artwork is retained in `design/marketplace-icon-source.png` and excluded from the VSIX.
Sidebar asset: `media/icon.svg`, a hand-drawn 24x24 speech bubble containing a commit timeline and summary lines. It represents commit details and blame hints. VS Code themes control its monochrome foreground; it is maintained independently of the Marketplace artwork.

## Final edit prompt

Use case: precise-object-edit
Asset type: revised production icon for GitViews on Visual Studio Marketplace.
Input image: the attached existing GitViews PNG is the edit target, not a new style reference.
Primary request: Remove the ENTIRE deep navy background and remove the ENTIRE separate blue right-hand trapezoid/open bracket/frame, including its top, right, and bottom strokes. Keep ONLY the Git branch-and-merge symbol with four circular nodes.
Required color change: ALL THREE nodes on the LEFT vertical track AND the WHOLE LEFT vertical connecting line must be a consistent warm golden yellow. This includes the top-left node, middle-left node, and bottom-left node; none of these may remain cyan. The right-hand branching-and-rejoining CURVED track and its ONE middle-right circular node must remain bright cyan/teal. Ensure the gold vertical main line and cyan curved branch meet cleanly at the top and bottom left nodes.
Composition: recenter the remaining four-node Git symbol alone on a square transparent canvas, large and balanced, comfortable equal padding, with the branch wide enough to read as an icon at 24–48 pixels.
Style: bold clean smooth geometry, flat consistent colors, crisp edges. Preserve the recognizable branch topology. No extra outlines, no frame, no text, no shadow, no glow, no backdrop, no white/gray/colored rectangle, no checkerboard painted into the image. Genuine alpha transparency everywhere outside the symbol, including the spaces between strokes.
Output: one finished square PNG icon with a true transparent background.
