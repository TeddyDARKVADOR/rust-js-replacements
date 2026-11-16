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

1. checks that the tag names a package and matches the version in its `package.json`;
2. builds the addon for the 8 targets (glibc targets with the NAPI-RS cross toolchain for
   glibc 2.17, musl targets with zig, macOS and Windows on their own runners) and loads the
   binaries that can run on the build machine;
3. builds the main package, runs its tests, publishes the platform packages, then the main
   package, with npm provenance.

## One-time setup

1. **npm account** with two-factor authentication enabled.
2. **npm organization** named `rust-js-replacements`: npmjs.com, your avatar, *Add Organization*,
   free plan (unlimited public packages). If the name is taken, choose another scope and rename it
   in `packages/*/package.json` (`name`), `catalog.json` (`packageName`), and the READMEs.
3. **Access token**: npmjs.com, *Access Tokens*, *Generate New Token*, *Granular Access Token*:
   - Expiration: the maximum allowed (write tokens expire; renew the secret when it does).
   - *Bypass two-factor authentication*: checked (the workflow cannot type a 2FA code).
   - Packages and scopes: *Read and write*, for the `@rust-js-replacements` scope.
4. **GitHub secret**: repository *Settings*, *Secrets and variables*, *Actions*,
   *New repository secret*, name `NPM_TOKEN`, value: the token.

Optional, after the first release: configure **trusted publishing** on npmjs.com for each of the
published packages (*Settings*, *Trusted Publisher*, GitHub Actions, repository
`TeddyDARKVADOR/rust-js-replacements`, workflow `release.yml`). npm then authenticates the workflow
without a token, and the `NPM_TOKEN` secret can be deleted. Trusted publishing can only be
configured once a package exists, which is why the first release uses a token.

## Releasing a version

1. Set the new version in `packages/<package>/package.json` (for example, `0.1.0`), and update the
   package README if behavior changed.
2. Commit, push to `main`, and wait for CI to pass.
3. Tag and push the tag:

   ```sh
   git tag string-width-v0.1.0
   git push origin string-width-v0.1.0
   ```

4. Follow the *Release* workflow in the *Actions* tab (about 10 to 15 minutes).
5. Check the result:

   ```sh
   npm view @rust-js-replacements/string-width
   cd "$(mktemp -d)" && npm init -y >/dev/null && npm install @rust-js-replacements/string-width
   node -e "import('@rust-js-replacements/string-width').then((m) => console.log(m.default('\u{53E4}')))"
   ```

6. The website switches to the npm install instructions by itself (it queries the registry). Set
   `status` to `RELEASED` in `packages/<package>/catalog.json` and in the root README catalog.

## When a release fails

- **Before publishing** (tag check, build, or tests): fix the problem, delete the tag
  (`git tag -d string-width-v0.1.0 && git push origin :refs/tags/string-width-v0.1.0`), and tag
  again.
- **During publishing**: npm never accepts the same version twice. If some packages were published,
  increase the version (for example, `0.1.1`) and release again.
