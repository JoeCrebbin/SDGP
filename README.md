# SDGP

Systems development :D

How to use:

1. Clone the repo.
2. Run the command `npm install` from the project root to install the packages from package.json.
3. Run `npm install --save-dev electron-rebuild` (Linux) or `npx electron-rebuild` (Mac) to rebuild the packages for this version of Electron.
4. Run `npm start` to start the application.

## CI/CD (GitHub Actions)

This repository now includes a GitHub Actions workflow at `.github/workflows/ci-cd.yml`.

- CI runs on pull requests to `main` and pushes to `main`.
- CD runs on pushed tags that start with `v` (for example, `v1.0.0`).
- Release builds generate Windows installer assets in `dist/` and attach them to the GitHub release.

### Triggering a release build

1. Commit and push your changes to `main`.
2. Create and push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```
