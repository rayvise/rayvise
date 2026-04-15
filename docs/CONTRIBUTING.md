# Contributing to Rayvise

Thank you for your interest in contributing! Rayvise is an MIT-licensed open source project and all contributions are welcome — code, documentation, bug reports, and feature ideas.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [License](#license)

---

## Code of Conduct

Be respectful and constructive. We're here to build something useful together. Harassment, discrimination, or abusive behavior of any kind will not be tolerated.

---

## Ways to Contribute

- **Report bugs** — open a GitHub issue with reproduction steps
- **Suggest features** — open a GitHub issue describing the use case
- **Improve docs** — fix typos, clarify setup steps, add examples
- **Submit code** — bug fixes, features, or refactors via pull request

---

## Reporting Bugs

Before opening a new issue, search existing issues to avoid duplicates bug reports.

Include in your bug report:
- **OS and version** (macOS, Windows, Linux + version)
- **Rayvise version** (from the app or `package.json`)
- **Steps to reproduce**
- **Expected vs. actual behavior**
- **Logs or screenshots** if applicable

---

## Suggesting Features

Open a GitHub issue with the `enhancement` label. Describe:
- The problem you're trying to solve
- Your proposed solution or idea
- Any alternatives you considered

For large features, open an issue for discussion before starting a pull request — this avoids wasted effort if the direction doesn't align with the project.

---

## Development Setup

See [DEV_GETTING_STARTED.md](DEV_GETTING_STARTED.md) for full setup instructions.

Rayvise is a [Tauri 2.0](https://v2.tauri.app) app and runs on **macOS, Windows, and Linux**. Make sure you have the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) installed for your platform before running locally.

Key commands:

```bash
pnpm install          # Install dependencies
pnpm tauri dev        # Start dev server + native window
pnpm lint             # Lint
pnpm format           # Format
pnpm check            # Lint + format together
pnpm tauri build      # Production build
```

---

## Making Changes

1. Fork the repository and clone your fork
2. Create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/my-bug
   ```
3. Make your changes
4. Run `pnpm check` to lint and format before committing
5. Commit using [conventional commit messages](#commit-messages)
6. Push your branch and open a pull request against `main`

### Branch naming

| Prefix | Use for |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code cleanup without behavior change |
| `chore/` | Build, tooling, dependencies |

---

## Pull Request Process

- Keep PRs focused — one feature or fix per PR
- Link the related issue in the PR description (e.g., `Closes #42`)
- Fill out the PR template if one is provided
- A maintainer will review and may request changes
- PRs are merged once approved and CI passes

---

## Code Style

- **Frontend**: TypeScript + React. Use the `#/` path alias for internal imports (e.g., `#/components/...`)
- **Backend**: Rust, standard `rustfmt` formatting
- Prettier and ESLint are configured — run `pnpm check` before opening a PR
- Tailwind CSS classes are auto-sorted by Prettier on format

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add per-app prompt fallback
fix: correct selected text write on Windows
docs: update getting started guide
chore: bump tauri to 2.1
```

- Use the imperative mood ("add" not "added")
- Keep the subject line under 72 characters
- Add a body for non-obvious changes

---

## License

By contributing to Rayvise, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
