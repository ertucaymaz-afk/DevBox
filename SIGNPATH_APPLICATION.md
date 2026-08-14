# SignPath Foundation open-source application dossier

## Project identity

- Project name: DevBox
- Repository: https://github.com/ertucaymaz-afk/DevBox
- Homepage: https://github.com/ertucaymaz-afk/DevBox#readme
- License: Apache License 2.0 (OSI approved)
- Primary artifact: Windows x64 NSIS installer, `DevBox-Setup.exe`
- Product type: Windows-first autonomous engineering desktop
- Tagline: Evidence-backed local engineering desktop with real provider, terminal, Git and integration paths.

## Application description

DevBox is an Electron/React Windows desktop application for working with local software projects through persistent conversations, bounded file operations, Git inspection, real ConPTY terminals, worktrees, durable jobs, a loopback API and health-checked external provider integrations. The project prohibits fabricated capability states: unavailable credentials, tools, protocols, signing identities or remote services remain unavailable and produce explicit errors.

The current `0.1.x` line is a functional preview. It is published under Apache-2.0 without a proprietary edition or paid feature gate. The initial maintainer is actively developing and releasing the project. As a newly public project, it does not yet claim independent adoption, package-manager popularity or third-party reputation that cannot be demonstrated.

## Governance and security

- Public contribution guide: `CONTRIBUTING.md`
- Public code of conduct: `CODE_OF_CONDUCT.md`
- Public vulnerability policy: `SECURITY.md`
- Public privacy/data-flow policy: `PRIVACY.md`
- Signing roles and incident response: `CODE_SIGNING_POLICY.md`
- License: `LICENSE`
- Build and verification workflow: `.github/workflows/ci.yml`

The initial maintainer performs author, reviewer and signing-approver roles because the project currently has one maintainer. Accounts participating in release signing must use MFA. The project will separate duties when additional trusted maintainers join.

## Trusted build proposal

1. A protected GitHub Actions workflow checks out the reviewed public commit on a GitHub-hosted Windows runner.
2. Node.js and the pinned pnpm release restore `pnpm-lock.yaml` with frozen-lockfile enforcement.
3. Type checks, unit/contract tests, production build, product-truth audit, installer packaging, release inventory and hash verification pass.
4. `actions/upload-artifact@v4` uploads `release/devbox-package` without local signing keys.
5. After SignPath onboarding supplies the organization/project/policy identifiers, the official SignPath GitHub action submits the artifact with origin verification bound to repository, workflow, commit and artifact.
6. A designated approver manually approves the signing request in SignPath.
7. The signed artifact is downloaded, its Authenticode chain and metadata are verified, and matching SHA-256 values plus SBOM and release manifest are published.

No repository workflow currently pretends to submit to SignPath: the signing job will be enabled only after SignPath provides real identifiers and a trust root.

## Current evidence and honest limitations

- Local TypeScript, unit/contract, production-build, truth-audit and Electron E2E checks pass.
- Windows installer packaging and SHA-256 release inventory are functional.
- Existing preview installers report Authenticode `NotSigned`.
- SignPath application review, identity validation, project onboarding and certificate issuance are external manual decisions and are not represented as complete until SignPath confirms them.

