# Skoleuka action design system (November 2026)

Every interactive control is labelled by **what it does**, not its former
CSS name, color, page, or perceived importance. See `public/action-system.css`.
It is deliberately loaded **after** the legacy stylesheets on:
- `/`: public landing, weekly plan, family overview, accounts, activities, QR, dialogs.
- `/barn/`: child app, day selection, homework helper and quizzes.
- `/drift/`: operations login, controls and school disclosures.

| Role / class | Appearance | Examples |
| --- | --- | --- |
| `sk-action--navigate` | Solid forest-green button | Open week plan, go to family/another view |
| `sk-action--modal` | White outline with green text | Add/edit child, add/edit activity, show QR, report error, open account |
| `sk-action--disclosure` | Pale green outlined surface | Show more, show all messages, expand details / accordion |
| `sk-action--submit` | Solid forest-green button | Save, confirm, start or submit form |
| `sk-action--utility` | Quiet, pale neutral outline | Refresh, retry, copy, check status |
| `sk-action--danger` | Restrained red outline | Remove child/device/family, revoke access |
| `sk-action--link` | Underlined text link | Source PDF, external documentation, small secondary text navigation |
| `sk-action--close` | 40px rounded icon-only button | Dismiss dialog |
| `sk-action--choice` | Preserve segmented/tile styling | App navigation tabs, weekdays, language switcher, quiz options |
| `sk-action--card` | Preserve full-card styling | Whole child card opens child view |

## Usage

In static HTML or a dynamic template:

```html
<button type="button" class="family-light-button sk-action sk-action--modal">Vis QR-kode</button>
<button type="button" class="sk-action sk-action--disclosure" aria-expanded="false">Vis alle</button>
<button type="button" class="family-open sk-action sk-action--navigate">Åpne ukeplan</button>
<details><summary class="sk-action sk-action--disclosure">Se lekser</summary>...</details>
```

- **One semantic role per control**. Use the existing event handlers, element IDs, data attributes, and accessibility state, unchanged.
- An action that opens a native modal is `modal`, even if it was previously
  styled like a dark primary CTA. A form submit is `submit`.
- Keep `aria-expanded` accurate on toggles; native `details[open]` works
  automatically. **Buttons and native `<details>/<summary>` now use the exact
  same CSS-only 8px chevron.** It is aligned to the far right of the control
  (never a separate text line), rotates when expanded, and responds to reduced
  motion. Do **not** type Unicode arrows into labels or add another
  `<span class="chevron">` or `::after` glyph in feature-specific CSS.
- Reserve `data-sk-chevron="off"` for intentional **icon-only controls**
  such as the mobile settings gear. It is not a general workaround for
  conflicting styles; remove old manual chevrons instead.
- Preserve existing layout visibility: mobile-only controls must not be
  exposed on desktop simply because a new disclosure uses `display:flex`.
- Choices and whole-card buttons are *not* restyled as ordinary action pills:
  their nav/tile layout remains recognisable.
- Background, border, typography, radius, hover, keyboard focus, disabled
  and reduced-motion are centralized; existing layout widths/grid/visibility
  remain owned by the page-specific styles. Avoid new one-off button colors.
- Source links, warnings, form field validation, progress checkboxes and the
  informational category badges are **not** buttons and must not become CTAs.

## QA / safety

`tests/action-design-system.test.mjs` verifies action classification in
static and generated markup. `tests/browser/action-design-system.test.mjs`
checks computed styles and existing disclosure interaction on desktop/mobile.
All previous family/child browser flows remain required. This is **visual
consistency only**: no changes to AI parsing, API routes, Supabase schemas,
family records or progress state.
