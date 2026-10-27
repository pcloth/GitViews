# GitViews Sidebar feature illustrations

Generator: built-in `image_gen` tool, using the imagegen skill.
These are explanatory illustrations based on implemented workflows, not captured screenshots.
Final assets: `media/features/sidebar-history.png`, `media/features/inline-blame.png`, `media/features/terminal-jump.png`.
Final targeted correction prompts are recorded in `feature-image-edits.md`.

## history

```text
Use case: ads-marketing / ui-mockup.
Asset type: one landscape feature illustration for the README and Marketplace page of GitViews Sidebar, a real VS Code extension.
Visual system shared by a three-image set: polished flat editorial developer-tool illustration, deep navy #0B1220 background, charcoal editor panels #161E2D, cyan highlights #22D3EE and warm gold #FBBF24, off-white typography, crisp restrained 1px dividers, gently rounded panels, no photorealistic desk or physical devices, no perspective tilt, no heavy glow. Wide landscape canvas, approximately 16:9. Main visual large enough for a README at 900px wide.
Hierarchy: top left a small product label exactly "GitViews Sidebar"; below it the specified large simplified-Chinese headline and subtitle; lower two-thirds a clean simplified but convincing IDE illustration. Use large readable labels and minimal tiny text. Bottom right discreet text exactly "功能示意图". This is an explanatory illustration, not a claim to be a captured screenshot.
Constraints: reproduce provided headline and UI labels correctly. Only show supported read-only Git history, diffs, blame and navigation. No AI chat, checkout, commit, rebase, push, cloud sync, invented features, pricing, fake testimonials, people, photographic elements, external logos, or watermarks. One finished image only, not a contact sheet.
Headline (verbatim): "提交历史，留在侧栏"
Subtitle (verbatim): "浏览分支拓扑，点击文件查看差异"
Main visual: a frontal IDE window with a slim left activity bar, a substantial GitViews sidebar occupying about 38% of the IDE width, and an editor occupying the remaining space. The history graph MUST be IN THE LEFT SIDEBAR, never a graph tab in the editor. In that sidebar show a repository selector "demo-app", a branch filter "全部分支与标签", a search box "搜索提交说明", a compact vertical commit graph with cyan and gold tracks and 5 realistic short commit rows. Select hash "a1b2c3d" with subject "修复缓存失效". Below the history show commit details and two changed-file rows "src/cache.ts" and "src/app.ts". Make the file "src/cache.ts" selected. The right editor shows native side-by-side file diff, removed red line on the left and added green line on the right, with a few clean TypeScript-like lines. Add two simple outside callout labels, exactly "侧栏提交历史" pointing to the left commit graph and "原生文件差异" pointing to the right editor. No third-party Git Graph editor tab. Graph and details both remain on the left.
```

## blame

```text
Use case: ads-marketing / ui-mockup.
Asset type: one landscape feature illustration for the README and Marketplace page of GitViews Sidebar, a real VS Code extension.
Visual system shared by a three-image set: polished flat editorial developer-tool illustration, deep navy #0B1220 background, charcoal editor panels #161E2D, cyan highlights #22D3EE and warm gold #FBBF24, off-white typography, crisp restrained 1px dividers, gently rounded panels, no photorealistic desk or physical devices, no perspective tilt, no heavy glow. Wide landscape canvas, approximately 16:9. Main visual large enough for a README at 900px wide.
Hierarchy: top left a small product label exactly "GitViews Sidebar"; below it the specified large simplified-Chinese headline and subtitle; lower two-thirds a clean simplified but convincing IDE illustration. Use large readable labels and minimal tiny text. Bottom right discreet text exactly "功能示意图". This is an explanatory illustration, not a claim to be a captured screenshot.
Constraints: reproduce provided headline and UI labels correctly. Only show supported read-only Git history, diffs, blame and navigation. No AI chat, checkout, commit, rebase, push, cloud sync, invented features, pricing, fake testimonials, people, photographic elements, external logos, or watermarks. One finished image only, not a contact sheet.
Headline (verbatim): "这一行，谁改过？"
Subtitle (verbatim): "行末查看提交，悬停展开详情"
Main visual: a large readable frontal code editor showing just 6–8 lines from "src/cache.ts", syntax highlighting and line numbers. On line 24, code exactly "return cache.get(key);" and immediately after that code, on the SAME LINE, a muted annotation exactly "pcloth · 2 天前 · 修复缓存失效". Make this annotated current line the focal point. A pointer hovering over the annotation opens a well-spaced dark hover card BELOW THE LINE without hiding the annotation. The card contains "pcloth", "a1b2c3d", the subject "修复缓存失效", and two clean link-like actions exactly "查看提交" and "查看文件差异". Add short callouts "当前行提交信息" and "悬停查看详情". Include a narrow subtle GitViews history sidebar in the background if room, but the emphasis is line annotation and hover. Do NOT annotate every line, put blame in a gutter, or render a huge file-wide blame table. Do not claim the hover edits or reverts code.
```

## terminal

```text
Use case: ads-marketing / ui-mockup.
Asset type: one landscape feature illustration for the README and Marketplace page of GitViews Sidebar, a real VS Code extension.
Visual system shared by a three-image set: polished flat editorial developer-tool illustration, deep navy #0B1220 background, charcoal editor panels #161E2D, cyan highlights #22D3EE and warm gold #FBBF24, off-white typography, crisp restrained 1px dividers, gently rounded panels, no photorealistic desk or physical devices, no perspective tilt, no heavy glow. Wide landscape canvas, approximately 16:9. Main visual large enough for a README at 900px wide.
Hierarchy: top left a small product label exactly "GitViews Sidebar"; below it the specified large simplified-Chinese headline and subtitle; lower two-thirds a clean simplified but convincing IDE illustration. Use large readable labels and minimal tiny text. Bottom right discreet text exactly "功能示意图". This is an explanatory illustration, not a claim to be a captured screenshot.
Constraints: reproduce provided headline and UI labels correctly. Only show supported read-only Git history, diffs, blame and navigation. No AI chat, checkout, commit, rebase, push, cloud sync, invented features, pricing, fake testimonials, people, photographic elements, external logos, or watermarks. One finished image only, not a contact sheet.
Headline (verbatim): "从终端，直达提交"
Subtitle (verbatim): "Ctrl / Cmd + 点击提交 ID"
Main visual: a clean two-step explanatory IDE composition with a terminal panel at lower right as the source and the GitViews sidebar on the left as destination. The terminal shows "$ git log --oneline" and three real-looking rows "a1b2c3d 修复缓存失效", "c4d5e6f 优化请求处理", "d7e8f9a 初始化项目". Highlight and underline ONLY "a1b2c3d" in cyan, with a pointer clicking it and a small modifier-key pill "Ctrl / Cmd". Draw one clear cyan navigation arrow from that hash to the selected SAME hash "a1b2c3d" in the left GitViews history list. Below the selected history row show commit details and changed files "src/cache.ts" and "src/app.ts". Add large step labels exactly "1  点击提交 ID" near the terminal and "2  定位提交与变更文件" near the sidebar. The code editor area above the terminal should be subdued ordinary source code. IMPORTANT: the jump opens the sidebar and the file list, and MUST NOT depict automatically opening a file diff, a modal dialog, or an external terminal. The feature is VS Code INTEGRATED terminal navigation.
```
