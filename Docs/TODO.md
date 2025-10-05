# TODO: Refactor TakeCodingTest UI to Match Requested Design

## Overview
Refactor and enhance the existing TakeCodingTest.jsx UI to match the provided screenshot design for the coding test interface. The UI will have a two-column split with a left panel showing problem description and submissions tab, and a right panel with the code editor and test results.

## Tasks

### Left Panel
- [x] Implement tabs for "Description" and "Submissions" only (no Editorial or Solutions).
- [x] Show problem title with solved status indicator.
- [x] Display problem metadata (e.g., difficulty, tags, hints) if available.
- [x] Make the description panel scrollable with rich text formatting.
- [ ] Implement the submissions tab to show student's past submissions for the question.

### Right Panel
- [x] Add a "Code" label above the code editor.
- [x] Use LazyMonacoEditor for the code editor.
- [x] Add toolbar: language dropdown, theme dropdown, font size dropdown, format button, shortcuts button.
- [x] Removed: lock icon, bookmark icon, undo, redo, fullscreen icons from toolbar.
- [x] Style Run and Submit buttons with loading states, icons, and animations.
- [x] Add a test case results panel below the editor showing run results and submit results with pass/fail status.
- [x] Add auto-save indicator showing last saved time.

### Layout and Styling
- [x] Two-column split layout with left panel width ~50%, right panel flexible.
- [x] Scrollable left panel and flexible right panel height.
- [x] Match colors, fonts, and spacing to the screenshot.
- [x] Add subtle animations and hover effects as in the screenshot.

### Additional Features
- [x] Implement auto-save functionality (simulated).
- [x] Add code formatting function (simulated).
- [x] Add keyboard shortcuts modal.
- [x] Check and update LazyMonacoEditor component if needed to support toolbar icons.
- [x] Ensure responsive design and accessibility.

## Followup
- [ ] After implementation, test the UI with sample coding tests.
- [ ] Get user feedback for any further refinements.
