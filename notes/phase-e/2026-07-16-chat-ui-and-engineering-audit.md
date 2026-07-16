# Chat UI and engineering audit (2026-07-16)

## Scope

- Reviewed the `/chat` Daily Desk and the shared chat composer.
- Traced the Daily Desk actions into poem browsing, quiz, and immersion routes.
- Reviewed chat and immersion request, persistence, scrolling, mobile, accessibility, and cost controls.

## Completed in this pass

- Enlarged the Daily Desk vine while reducing its saturation, contrast, and opacity so it reads as a paper texture instead of foreground content.
- Replaced the two vertical bookmarks with a visible horizontal learning action rail.
- Converted the shared composer to a fixed floating desk with bottom safe-area spacing and content clearance.
- Added textarea growth, `Shift+Enter` line breaks, IME composition protection, an accessible label, and a named icon send action.
- Removed automatic focus to prevent mobile keyboards from opening on page entry.
- Added Playwright smoke assertions for the Daily Desk actions and fixed composer.

## Engineering findings

### P0 before public release

- Rotate the Langfuse and Tencent credentials that appeared in collaboration screenshots, then confirm the old credentials are invalid.

### P1 next engineering pass

- Rebuild chat model context from authoritative database messages instead of trusting the complete client-provided history.
- Add request/message idempotency so retries cannot duplicate user messages or leave partially persisted turns.
- Add provider output limits, abort propagation, and timeouts; one visible chat request can currently fan out into recall, generation, extraction, and embedding calls.
- Stop returning raw provider/database errors to the browser and remove user text or memory contents from production logs.
- Add rate and count limits to conversation creation, not only message generation.
- Add Memory correction/deletion and retention controls for a product aimed at students.
- Change streaming auto-scroll so it follows only while the reader remains near the bottom.

### P2 quality backlog

- Give opening-message failures a visible retry action.
- Add focus trapping and focus restoration to the conversation-history drawer.
- Improve low-contrast small text tokens before claiming WCAG AA.
- Add mobile viewport coverage for Daily Desk, chat, immersion, and virtual-keyboard behavior.
- Add behavioral tests for authorization, replay/idempotency, rate limits, and stream failures.

## Verification

- `pnpm exec tsc --noEmit`: passed.
- `pnpm build`: passed.
- `pnpm exec playwright test --list`: 3 tests collected after using a workspace-local temporary cache.
- Authenticated visual capture was blocked by the current Neon TLS connection reset; browser-level visual comparison still needs one successful signed-in run.

