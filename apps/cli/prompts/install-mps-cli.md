# Prompt: Install MPS CLI from a Local npm Tarball

You are working on the user's own computer. Install the Markdown Publication
Studio CLI (`mps`) from a local npm tarball in the user's workspace.

Use the tarball path supplied by the user if one was provided. Otherwise, locate
the project workspace and search only its `release/npm/` directory for files
named `markdown-publication-cli-*.tgz`. If there are multiple candidates,
inspect their package names and versions and choose the highest version. Do not
download the CLI package from npm or publish anything. If no local tarball is
available, stop and tell the user where you looked.

Check that Node.js 22.21.1 or newer and npm are installed before proceeding. If
the Node.js requirement is not met, stop and report the installed version; do
not upgrade Node.js. Install the selected tarball for the current user with:

```sh
npm install --global "/absolute/path/to/markdown-publication-cli-VERSION.tgz"
```

Use the platform's appropriate shell syntax. npm may fetch the tarball's
declared runtime dependencies from the user's configured npm registry. If the
global install fails because its prefix is not writable, do not use `sudo` or
silently edit shell startup files. Report the npm prefix and offer a user-owned
prefix setup for the user's approval.

Verify the installation by running `mps --version --json` and
`mps describe --json`. Confirm that the command resolves through `PATH`, the
reported version matches the selected tarball, and both commands return valid
JSON. If the npm global bin directory is missing from `PATH`, report its path
and give the user the appropriate shell-specific PATH instruction without
changing startup files.

Finally, run `mps doctor --json`. If it reports that the desktop application is
missing or incompatible, distinguish that runtime issue from CLI installation
and explain that a compatible desktop app must be installed and launched once.
Do not open or modify publication files. Summarize the tarball path, installed
version, verification results, and any remaining user action.
