# dotenvx-keychain

`dotenvx-keychain` is a CLI wrapper around `dotenvx` that stores `DOTENV_PRIVATE_KEY`
in native OS secret stores instead of keeping plaintext key material in the working
tree.

The implementation is in progress. Product and design documents live under `docs/`.

## Development

This project targets Node.js 20 or newer.

Install dependencies:

```bash
npm install
```

Run the test suite:

```bash
npm test
```

Useful verification commands during development:

```bash
npm run typecheck
npm run build
npm run pack:smoke
```
