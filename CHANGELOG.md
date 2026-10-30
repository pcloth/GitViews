# Changelog

## 1.0.3

- Fix inline blame hover links incorrectly reporting that the repository is closed when repository URIs contain encoded Windows drive letters or other escaped characters.
- Preserve filenames containing percent signs or parentheses when opening file diffs from blame hovers.

## 1.0.2

- Add three Chinese feature illustrations to the README: sidebar commit history, inline blame, and integrated terminal navigation.

## 1.0.1

- Replace the sidebar branch icon with a speech-bubble history list representing commit details and blame hints.

## 1.0.0

- Set the Marketplace display name to GitViews Sidebar and extension identifier to `pcloth.gitviews-sidebar`.
- Add a transparent gold/cyan PNG icon for the VS Code Marketplace; retain the original thin-line sidebar SVG.
- Export the Marketplace icon at 256x256 and validate its dimensions before packaging.
- Release GitViews 1.0.0 with sidebar history, inline blame, terminal commit links, and repository/support metadata.

## 0.1.0

- Sidebar Git topology, commit details, filters and snapshot comparisons.
- Current-line blame with hover navigation and unsaved-content mapping.
- Integrated terminal commit links with multi-repository resolution.
- Chinese and English UI; pinned Volta and pnpm development toolchain.
