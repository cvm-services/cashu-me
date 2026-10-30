# Extension signing key rotation — 2026-10-30

The historical `extension.pem` and `key.pem` files were exposed in git history.
They have been removed from every ref, but a key that was public must be
considered compromised.

## Current key

The signing key is **not stored in this repository**. The private key lives in
the fleet secret store; only its public half is pinned here.

- New extension ID: `daekhcibgcgnlppcdmollegbfebnpglo`
- Public key: pinned in `extension/manifest.json` as `key`.
- Private key: materialize it to a `0600` file outside the repository, then pack:

```bash
chrome --pack-extension=extension --pack-extension-key=/path/to/key.pem
```

## Store action

The old key signed the old extension ID. Publish a new store item with the new
ID; do not attempt to reuse the old key or ID. Never commit the private key or
a generated `*.pem`/`*.nsec` file.
