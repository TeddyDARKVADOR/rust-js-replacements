# Releasing

Packages are published to npm by `.github/workflows/release.yml` when a tag
`<package>-v<version>` is pushed, for example `string-width-v0.1.0`.

## What gets published

For a package with a native addon, npm receives one package per platform plus the main package:

```text
@rust-js-replacements/string-width                   JavaScript, addon loader, WebAssembly module
@rust-js-replacements/string-width-linux-x64-gnu     prebuilt addon for this platform only
@rust-js-replacements/string-width-linux-x64-musl
@rust-js-replacements/string-width-linux-arm64-gnu
@rust-js-replacements/string-width-linux-arm64-musl
@rust-js-replacements/string-width-darwin-x64
@rust-js-replacements/string-width-darwin-arm64
@rust-js-replacements/string-width-win32-x64-msvc
@rust-js-replacements/string-width-win32-arm64-msvc
```

The main package lists the platform packages as optional dependencies, each restricted to its
`os`, `cpu`, and `libc`, so `npm install` downloads only the binary for the user's machine. Users
need no Rust toolchain.

The workflow:

1. checks that the tag names a package, matches the version in its `package.json`, and that the
   package `CHANGELOG.md` has a section for that version;
2. builds the addon for the 8 targets (glibc targets with the NAPI-RS cross toolchain for
   glibc 2.17, musl targets with zig, macOS and Windows on their own runners) and loads the
   binaries that can run on the build machine;
3. builds the main package, runs its tests, publishes the platform packages, then the main
   package, with npm provenance;
4. creates a GitHub release for the tag, with the `CHANGELOG.md` section of that version.

## Authentication: trusted publishing

The workflow holds no npm token. npm authenticates it through **trusted publishing** (OpenID
Connect), configured on npmjs.com for each published package: *Settings*, *Trusted Publisher*,
GitHub Actions, repository `TeddyDARKVADOR/rust-js-replacements`, workflow `release.yml`, and in
*Permissions* tick **npm publish**. New configurations allow only *npm stage publish* by default,
and the workflow publishes directly, so without that box it fails with `403 OIDC permission denied
for this action`. It requires npm 11.5.1 or later, which the workflow installs.

Trusted publishing can only be configured on a package that exists. The first release of a new
package (and of each of its platform packages) therefore needs a temporary granular access token:

1. npmjs.com, *Access Tokens*, *Generate New Token*, *Granular Access Token*, with
   *Bypass two-factor authentication* checked (it is off by default and cannot be added later;
   without it, `npm publish` fails with `EOTP`), *Read and write* on the `@rust-js-replacements`
   scope.
2. Add it as the GitHub secret `NPM_TOKEN`, and in the publish step of `release.yml`, set
   `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` and `registry-url: https://registry.npmjs.org` in
   `actions/setup-node`.
3. After the release, configure trusted publishing on every new package, revert the workflow, and
   delete the token and the secret.

npm stops accepting such tokens for direct publishing in January 2027. After that, create each new
package by hand once (`npm publish` from your machine, with your 2FA code), then configure trusted
publishing on it before the first release by the workflow.

## Releasing a version

1. Set the new version in `packages/<package>/package.json` (for example, `0.1.1`).
2. Add a section for it at the top of `packages/<package>/CHANGELOG.md`, with the heading
   `## 0.1.1` (the version alone, as the workflow looks it up).
3. Commit, push to `main`, and wait for CI to pass.
4. Tag and push the tag:

   ```sh
   git tag string-width-v0.1.1
   git push origin string-width-v0.1.1
   ```

5. Follow the *Release* workflow in the *Actions* tab (about 10 to 15 minutes).
6. Check the result. A newly published version can take a few minutes to appear on the registry
   (a new package first shows a `0.0.0-stage` placeholder):

   ```sh
   npm view @rust-js-replacements/string-width
   cd "$(mktemp -d)" && npm init -y >/dev/null && npm install @rust-js-replacements/string-width
   node -e "import('@rust-js-replacements/string-width').then((m) => console.log(m.default('\u{53E4}')))"
   ```

7. The website shows the new version by itself (it queries the registry). For a first release, set
   `status` to `RELEASED` in `packages/<package>/catalog.json` and in the root README catalog.

## When a release fails

- **Before publishing** (tag check, build, or tests): fix the problem, delete the tag
  (`git tag -d string-width-v0.1.0 && git push origin :refs/tags/string-width-v0.1.0`), and tag
  again.
- **During publishing**: npm never accepts the same version twice. If some packages were published,
  increase the version (for example, `0.1.1`) and release again.
