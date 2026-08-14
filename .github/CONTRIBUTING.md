# Contributing to DevBox

## Principles

- Implement real behavior. Do not add demo data, fake integrations, simulated success, placeholder progress, or claims that are not supported by runtime evidence.
- Keep secrets, personal data, private repository content, generated artifacts, and local state out of commits.
- Fail closed when a trust root, credential, provider, executable, or external service is unavailable.
- Add or update tests for changed contracts and user-visible behavior.
- Preserve accessibility, keyboard access, context-menu behavior, and reduced-motion support.

## Development workflow

1. Create a focused branch.
2. Run `pnpm install --frozen-lockfile`.
3. Make a bounded change with tests.
4. Run `pnpm verify`.
5. For packaging changes, also run `pnpm package:installer`, `pnpm release:prepare`, and `pnpm release:verify` on Windows.
6. Explain actual evidence and remaining limitations in the pull request.

Do not commit `node_modules`, `dist`, `release`, `outputs`, `work`, `evidence`, `research`, `.env` files, databases, logs, or credentials.

## Pull requests

Pull requests must explain the problem, the implemented behavior, tests run, security/privacy effects, rollback approach, and any honest limitations. Changes to signing, update, installer, workflow, permission, IPC, process, path, network, or credential boundaries require explicit reviewer attention.
