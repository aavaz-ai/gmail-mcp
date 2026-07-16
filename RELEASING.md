# Releasing

Releases are explicit while the connector is in beta. Pushing `main` never publishes an npm package.

## First repository push

1. Create `aavaz-ai/gmail-mcp` as an empty public repository without generated files.
2. Push the reviewed initial commit to `main`.
3. Require the `CI / validate` check on `main` after the repository exists.
4. Enable GitHub secret scanning and private vulnerability reporting.

## First npm publication

Trusted Publishing cannot bootstrap an unpublished package. `@enterpret/gmail-mcp` must first be created by an authorized `@enterpret` npm owner using the required interactive authentication and 2FA.

Validate the exact source revision and build one reviewed tarball outside the repository:

```bash
npm ci
npm run check
npm audit --omit=dev --audit-level=high
npm pack --pack-destination /absolute/reviewed-artifact-directory
node scripts/packed-npx-smoke.mjs /absolute/reviewed-artifact-directory/enterpret-gmail-mcp-0.1.0.tgz
```

Inspect and install that exact tarball in a clean temporary consumer. Confirm its package name, version, contents, checksum, CLI version, and exact four-tool discovery immediately before the separately authorized bootstrap publication. Publish the reviewed tarball itself rather than repacking the source directory. Never place npm credentials or Gmail tokens in repository files, workflow inputs, or logs.

After publication, compare the registry tarball and integrity to the reviewed artifact and repeat the installed CLI and four-tool discovery checks.

## Trusted Publishing

After the npm package exists:

1. Create a protected GitHub environment named `npm` with required reviewers.
2. Configure npm Trusted Publishing with these exact values:
   - organization: `aavaz-ai`
   - repository: `gmail-mcp`
   - workflow filename: `release.yml`
   - environment: `npm`
   - allowed action: `npm publish`
3. Bump `package.json`, `package-lock.json`, and `src/contract.ts` together in a reviewed pull request.
4. Run the `Publish npm package` workflow manually from the exact reviewed `main` revision. The workflow packs once, smokes that tarball, and publishes that same file with provenance.
5. Verify registry identity, provenance, tarball contents, checksum, CLI version, and exact four-tool discovery.

Do not add automatic semantic release until the beta release history is established and the version source-of-truth contract is tested. This avoids publishing a version derived from unrelated or inherited Git history.
