# CareSenior — Personal Healthcare Workspace

Scope: React `/ca-nhan` only. Modern Healthcare Dashboard + Clean Minimalism + Accessible UI. This document describes presentation; it does not define clinical thresholds, permissions or API behavior.

## Research and selection

UI UX Pro Max was queried with `healthcare elderly dashboard accessible --design-system`, `focus not obscured --domain ux`, `line health trend --domain chart`, and `component presentation composition --stack react`.

The first result correctly matched Healthcare App, Minimalism & Swiss Style and Accessibility First typography. Its marketing landing-page pattern (Hero/Testimonials/CTA) is **not** applicable to the authenticated workspace. A narrower dashboard retry matched IoT rather than healthcare and was rejected. The workspace layout below is a deliberate adaptation of the existing routes and the user's requirements, not an asserted database match for a healthcare dashboard pattern.

Apply the verified guidance: readable hierarchy, limited effects, real status text alongside color, visible focus, focus not obscured, reduced motion, semantic controls, SVG trend lines with a text history and dashed secondary series. Keep the user's palette instead of the suggested cyan. The chart recommendation does not authorize dropping existing short measurement histories or changing aggregation rules.

## Color tokens

| Token | Color | Use |
|---|---|---|
| primary | #21966F | Brand accents, progress, chart, active markers |
| deep | #155E4B | Primary button background, links, selected navigation, prominent text |
| mint | #E8F6EF | Selected surfaces, metric symbols, progress panels |
| background | #F7FAF8 | Workspace background |
| surface | #FFFFFF | Cards, header, sidebar, chat |
| ink | #203D35 | Main body text |
| muted | #5D7066 | Secondary text |
| danger | #B4233F | Emergency/status text |
| danger background | #FFF1F2 | Emergency callouts |
| input boundary | #789487 | Visible control boundaries |

Measured contrasts: white on deep 7.68:1; ink on background 11.23:1; muted on white 5.28:1; warning #86520C on #FFF7E6 6.11:1; danger text #A8243B on #FFF1F2 6.41:1; input boundary on white 3.29:1.

White on brand green is only 3.71:1: use deep green for ordinary white button text. Do not claim all UI or the whole application passes WCAG AAA from these token checks; browser focus, content, overlays and screen readers require their own verification.

## Typography and surfaces

- Segoe UI / system-ui, with native Vietnamese support and no remote font request. The skill's Atkinson recommendation is treated as a readability direction, not a required external font.
- Body/input 16px; headings 28–38px / 21px / 18px. Secondary data generally 14–15px; compact navigation/eyebrows are smaller and support reflow at 1.8×.
- Numeric values use tabular figures and 37px emphasis; values and units are separate flexible inline items.
- Main spacing rhythm: 8/16/24/32px with responsive optical adjustments. Card radius 20–24px, smaller controls 12–16px. Thin borders and very low opacity shadows; no glass blur or decorative gradients.
- No fixed heights on data cards or headings. Missing information uses the existing explicit empty/error rendering.

## Layout and components

- Desktop: full-width account header, a deep-green sidebar with five destinations and white selected item, content area with a breadcrumb and truthful realtime state. The user-selected “Nhịp sống” home starts with actual medication data/progress, followed by the latest measurements, appointments and an AI shortcut.
- Laptop: narrower sidebar, two-column quick actions, secondary content stacks when necessary.
- Tablet/mobile up to 768px: sidebar becomes a five-item floating bottom bar, with measured height reserved below content. SOS stays the middle destination and only navigates.
- Header AI shortcut remains in document flow. There is no floating chat overlay over clinical content, composer or SOS. The shortcut is absent from the SOS screen as before.
- The NCT topbar separates a brand zone aligned with the sidebar, a current-page context on wide desktop, and the AI/account group. At laptop/tablet sizes the redundant page context is hidden; phone controls wrap instead of clipping. The account pill keeps real identity and initials, exposes the full name in its menu, and preserves all existing account handlers. Its owned dropdown has bounded width/scroll height and reduced motion, with no styling applied to other roles.
- Health: filters retain their existing handlers; latest measurement and SVG trend share a desktop row, followed by compact history. Existing min/average/max computations and time axis are unchanged.
- Schedule: segmented tabs, native date input, medicine state borders plus explicit labels, dosage/time groups and clearly separated actions. Keep confirmation dialogs, consent checkbox, delayed confirmation and supplement forms exactly functional.
- SOS: emergency-tinted header, stable large red hold button and progress ring; location in a separate panel. Feedback stays inline. Never move/animate the hold target or add automatic sending.
- Alerts: explicit type/level/status/time, subtle unread border, readable details; no new handling actions.
- Profile: personal and health fields grouped visually, caregivers, security and existing Google component. No shared authentication component is changed.
- AI: conversation rail, profile context, readable conversation bubbles, composer and privacy note. Existing pending/error/cancel/new/select/delete behavior is retained.

## Accessibility and motion

- Semantic links/buttons and existing form labels/validation. UI target goal 44–48px for main controls; enlarged text may grow controls.
- Skip link to main content; 3px deep-green focus outlines. Navigation supports wrapped labels; the existing ResizeObserver measures bottom navigation for content clearance.
- Status is never represented only by color. Decorative icons are hidden from the accessibility tree.
- Hover/press feedback changes color/border/shadow, not control geometry. Transitions use 160/220ms; `prefers-reduced-motion` disables animations/transitions in workspace and owned modals.
- Scope all CSS to workspace-owned classes or the unique owned modal class. Ant Design ConfigProvider is local to NCT so its portal UI inherits the same theme without changing other roles.

## Verification boundaries

### Home structure refinement

The approved “Nhịp sống” concept replaces the earlier two-column home. A compact unframed greeting leads to a deep-green medication spotlight and actual per-dose circular progress. Its featured item is labeled “Liều chưa xác nhận” and uses an existing ChuaDenGio row without reclassifying overdue doses or claiming a clinically determined next dose. Full medication rows remain accessible in a native details/summary disclosure; no confirmation action is added. Latest measurements use a flat grid with at most three columns and a font-relative minimum width, adapting down to two or one column for enlarged text. Existing assessment labels and times remain visible. Appointments and AI share the next row, followed by SOS navigation, caregivers and the original quick-access links. The content pane fills its track; mobile keeps the existing safe-area bottom navigation. The sidebar has a light focus outline on its dark surface. No sample/mockup health data, progress or account identity is copied into production.

Use only isolated Chrome RAM API/Socket.IO fixtures for interactions and screenshots. No production database, Google provider, real AI provider or real SOS is required for this UI redesign. Test widths: 360/768/1024/1440px, plus 1.8× text reflow. Test existing account/Google/medicine/SOS/AI callbacks and compare other-role computed styles against the pre-change baseline.
