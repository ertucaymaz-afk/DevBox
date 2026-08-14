# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Status

The SignPath Foundation application dossier is prepared and the project is publishing the unsigned release required by the Foundation's eligibility conditions. Submission, review, onboarding and certificate availability are separate external states; none is represented as complete without evidence from SignPath. Current public preview artifacts are unsigned and their `release-manifest.json` files state `NOT_SIGNED`. No self-signed certificate is represented as a public release identity.

## Roles

The initial maintainer currently performs all three roles while the project has one maintainer:

- Author: [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)
- Reviewer: [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)
- Approver: [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)

The project will separate these duties when additional trusted maintainers join. GitHub and SignPath accounts participating in build or signing must use multi-factor authentication.

## Trusted build and origin

Only artifacts that satisfy all of the following may be submitted for public signing:

1. The source commit is reachable from this public GitHub repository.
2. The build runs on a GitHub-hosted Windows runner using the workflow stored in the same commit.
3. Dependencies are restored from `pnpm-lock.yaml` with frozen-lockfile enforcement.
4. Type checks, tests, the production build, the product-truth audit, packaging verification, secret scanning, and release inventory checks pass.
5. The unsigned artifact is uploaded with `actions/upload-artifact@v4` and submitted by the official SignPath GitHub integration after onboarding.
6. SignPath origin verification binds the signing request to the GitHub repository, workflow, commit, and build artifact.
7. A designated approver manually approves the signing request.

Workflow and dependency changes require the same review as application code. Release workflows use least-privilege GitHub permissions and do not run untrusted pull-request code with signing credentials.

## Artifact identity

Signed files must use consistent product metadata:

- Product: `DevBox`
- Publisher/certificate subject: the identity issued through SignPath Foundation
- File and product version: the version in `package.json` and the release tag
- Original filename: `DevBox.exe` for the installed application and `DevBox-Setup.exe` for the installer

Every release includes SHA-256 checksums, a release manifest, third-party notices, and a CycloneDX SBOM. Signing does not replace hash verification or release testing.

## Revocation and incident response

If a signed artifact is suspected of compromise, maintainers will stop distribution, mark the affected GitHub release, notify SignPath, request certificate or artifact revocation when appropriate, publish indicators/hashes, and issue a repaired release from a clean reviewed commit. Compromised credentials or unauthorized workflow changes are treated as security incidents.
