# Contributing

Thank you for your interest in contributing to `playwright-synthetic-plugin`!

## Development Setup

```bash
git clone https://github.com/EmanueleMinotto/playwright-synthetic-plugin.git
cd playwright-synthetic-plugin
npm install
```

## Scripts

- `npm run build` — Build the project
- `npm test` — Run unit tests
- `npm run test:e2e` — Run e2e tests (requires `npx playwright install chromium`)
- `npm run typecheck` — Type check without emitting
- `npm run dev` — Watch mode for development

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/). All commit messages must follow this format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat` — A new feature
- `fix` — A bug fix
- `docs` — Documentation changes
- `test` — Adding or updating tests
- `refactor` — Code refactoring (no feature or fix)
- `chore` — Maintenance tasks (dependencies, CI, etc.)
- `perf` — Performance improvements

### Examples

```
feat(guard): allow RegExp block rules
fix(reporter): ignore skipped journeys
docs: update README with reporter configuration
test(metrics): cover label escaping
```

## Code Quality

- **Linting**: Run `npm run typecheck` before submitting a PR to ensure type safety
- **Testing**: All new features and bug fixes must include unit tests. Run `npm test` to verify
- **Coverage**: Aim to maintain or improve test coverage with every change

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes following the conventions above
3. Ensure all tests pass (`npm test`)
4. Ensure the project builds (`npm run build`)
5. Ensure type checking passes (`npm run typecheck`)
6. Submit a pull request with a clear description of the changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
