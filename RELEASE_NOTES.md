# Release Notes

## v1.1.1 - 2026-05-20

- Added `GET` and `PUT` compatibility for `/api/profile`.
- Improved Mini Program request retry and diagnostics for `ERR_CONNECTION_RESET`.
- Added loading state for member profile save.

## v1.1.0 - 2026-05-20

- Replaced `db.json` runtime storage with SQLite (`data/dmajor.sqlite`).
- Added migrations, seed, JSON migration, and backup scripts.
- Added member management, role permission configuration, profile editing, avatar upload, section-change review, and leave approval.
- Expanded library resource types to include video score and rehearsal video.
- Added video playback speed controls: 0.75x, 1x, 1.25x, 1.5x.
- Updated WeChat Mini Program member flows for warm attendance confirmation, leave reason input, profile editing, avatar upload, and video playback.
