# Release Notes

## v1.2.0 - 2026-05-30

- Switched production API to `https://api.dmajorchoir.com`.
- Switched production admin entry to `https://admin.dmajorchoir.com`.
- Updated Mini Program, Web config, backend CORS defaults, environment examples, release docs, and deployment docs for the ICP-approved domain deployment.

## v1.1.3 - 2026-05-20

- Migrated the temporary trial endpoint to the new Tencent Cloud server.
- Updated Web, Mini Program, backend CORS defaults, environment examples, and deployment docs for the new server.
- Kept the project on temporary IP access while ICP filing was pending.

## v1.1.2 - 2026-05-20

- Switched temporary trial API base URL before ICP filing is complete.
- Updated Web and Mini Program configuration for the temporary Tencent Cloud IP endpoint.

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
