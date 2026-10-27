# Feature illustration correction prompts

Generator: built-in `image_gen` tool (imagegen skill).
Initial prompts are recorded in `feature-image-prompts.md`. The following final edits align the illustrations with the actual speech-bubble sidebar icon and implemented workflows.

## `media/features/sidebar-history.png`

```text
Use case: precise-object-edit. Input image is the edit target, an already approved GitViews Sidebar feature illustration.
Keep its exact landscape composition, size, dark navy/cyan/gold visual style, Chinese headline/subtitle, all code, hover UI, arrows, spacing, and remaining typography.
Make only the explicitly listed local corrections below. The actual GitViews Sidebar ACTIVITY BAR ICON is a MONOCHROME OUTLINE SPEECH BUBBLE containing a tiny vertical history track, three small hollow commit nodes and three short horizontal summary lines. This icon is NOT a Git branch/fork symbol. Keep the active cyan selection accent. Render the tiny icon clearly as a speech bubble with a small bottom-left tail.
No extra words, new features, new UI panels, or other layout changes. Preserve the "功能示意图" footer. Output the corrected finished wide image.
Corrections: (1) Replace ONLY the selected GitViews icon in the slim far-left activity bar, the icon beside the cyan vertical active indicator, with the outlined speech-bubble/history icon described above. (2) In the LEFT diff column header, replace the hash and label "a1b2c3d (之前)" with "c4d5e6f（父提交）". Keep the RIGHT diff column hash "a1b2c3d" as it is. Keep the selected commit hash a1b2c3d in the sidebar. All other content remains unchanged.
```

## `media/features/inline-blame.png`

```text
Use case: precise-object-edit. Input image is the edit target, an already approved GitViews Sidebar feature illustration.
Keep its exact landscape composition, size, dark navy/cyan/gold visual style, Chinese headline/subtitle, all code, hover UI, arrows, spacing, and remaining typography.
Make only the explicitly listed local corrections below. The actual GitViews Sidebar ACTIVITY BAR ICON is a MONOCHROME OUTLINE SPEECH BUBBLE containing a tiny vertical history track, three small hollow commit nodes and three short horizontal summary lines. This icon is NOT a Git branch/fork symbol. Keep the active cyan selection accent. Render the tiny icon clearly as a speech bubble with a small bottom-left tail.
No extra words, new features, new UI panels, or other layout changes. Preserve the "功能示意图" footer. Output the corrected finished wide image.
Corrections: (1) Replace the selected GitViews icon in the slim far-left activity bar with the outlined speech-bubble/history icon described above. (2) Replace the branch-shaped symbol in the top-left rounded product badge with the SAME speech-bubble/history motif; preserve its rounded badge and cyan styling. (3) Change the sidebar dropdown label "文件历史" to "提交历史" because this extension browses commit history. Keep the code line, inline blame annotation and hover actions exactly as currently rendered.
```

## `media/features/terminal-jump.png`

```text
Use case: precise-object-edit. Input image is the edit target, an already approved GitViews Sidebar feature illustration.
Keep its exact landscape composition, size, dark navy/cyan/gold visual style, Chinese headline/subtitle, all code, hover UI, arrows, spacing, and remaining typography.
Make only the explicitly listed local corrections below. The actual GitViews Sidebar ACTIVITY BAR ICON is a MONOCHROME OUTLINE SPEECH BUBBLE containing a tiny vertical history track, three small hollow commit nodes and three short horizontal summary lines. This icon is NOT a Git branch/fork symbol. Keep the active cyan selection accent. Render the tiny icon clearly as a speech bubble with a small bottom-left tail.
No extra words, new features, new UI panels, or other layout changes. Preserve the "功能示意图" footer. Output the corrected finished wide image.
Only correction: replace the selected GitViews branch/fork icon in the slim far-left activity bar beside the cyan vertical indicator with the speech-bubble/history icon described above. Keep the terminal, selected a1b2c3d commit, arrow, steps and all labels unchanged.
```
