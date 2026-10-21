# Explicit Angular lesson completion

The backend contract was read from `../EnterpriseLMS/docs/lesson-completion-ui-contract.md`; backend files remain untouched. This document supersedes the percentage-editor UI descriptions in student-progress.md.

Changed files:
- `src/app/features/student-viewer/student-progress.service.ts`: removes percentage editing; requires separate lesson confirmation; sends existing POST start/complete with `{}`; clears confirmation on refresh, denial, context change and mutation recovery.
- `src/app/features/student-viewer/student-progress.component.ts`: removes FormsModule.
- `src/app/features/student-viewer/student-progress.component.html`: Not started / In progress / Completed from record existence and completion flag; read-only exact stored percentage and timestamps; explicit Start lesson and confirmed Mark lesson complete; completed lessons hide completion controls.
- `src/app/features/student-viewer/student-progress.service.spec.ts`: exact empty completion payload and CSRF, duplicate protection, cancellation, Completed enrollment gates, uncertain completion recovery and confirmation cleanup.
- `src/app/features/student-viewer/student-progress.component.spec.ts`: state display, fractional legacy completed records and timestamps, no editor, cancellation without mutation.
- `docs/explicit-lesson-completion.md`: implementation and validation record.

Course progress is displayed from the server response. Enrollment completion retains its separate confirmation and `{confirmed:true}` payload. Completed enrollment remains readable with learner writes blocked. Existing safe errors, GET-only recovery, session/context guards and stale response cleanup remain in place. Navigation, media, quizzes and assignments have no new progress writes. Assignment files, including the pending file-selection fix, were left untouched. Backend repeat behavior is unchanged.

Validation (2026-10-19):
- `npm.cmd run build -- --configuration production`: passed.
- `npm.cmd test -- --watch=false --browsers=ChromeHeadless`: 212 passed, 0 failed.
- `git diff --check`: passed for tracked changes.
- Direct UTF-8 text checks of all untracked files: passed for trailing spaces/tabs, conflict markers and final newline.

PowerShell blocked the npm.ps1 wrapper, so npm.cmd was used. The initial sandbox build failed on directory resolution; the sandbox test browser failed to launch. Both requested checks passed when rerun outside the sandbox. Karma emitted its existing builder deprecation warning and mocked media URL 404 warnings; no test failed. No packages installed, database access, live smoke execution, smoke-file replacement, host restart, staging, commits, pushes or branch switches were performed.

Live verification gaps: tests use HttpTestingController, not a running BFF or database. Cookie/CSRF behavior against a live authenticated session, actual persisted timestamps, cross-tab enrollment races, playback and assignment upload interactions were not exercised live.
