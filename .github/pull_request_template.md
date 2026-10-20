## Summary

<!-- What does this change do, and why? -->

Closes #

## Checks

Run the checks for the parts you touched. CI runs the same commands.

**Frontend** (`frontend/`)

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

**Indexer** (`indexer/`)

- [ ] `npx prisma generate`
- [ ] `npx tsc --noEmit`
- [ ] `npm test`
- [ ] `npm run build`

**Contracts** (`contracts/`)

- [ ] `cargo fmt --all -- --check`
- [ ] `cargo clippy --all-targets -- -D warnings`
- [ ] `cargo test`
- [ ] `cargo build --release --target wasm32v1-none`

**Docker** (only if a Dockerfile or `docker-compose.yml` changed)

- [ ] `docker compose config --quiet`

## Notes

<!-- Anything a reviewer should know: screenshots, follow-ups, or things you left out on purpose. -->
