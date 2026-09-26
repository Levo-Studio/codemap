# Security

Codemap runs a server on your machine that can read your source code. A flaw in
it matters, so please report one privately.

## Reporting a vulnerability

Use **GitHub's private vulnerability reporting**: the “Report a vulnerability”
button under the repository's **Security** tab. **Never open a public issue**
for a vulnerability, and do not describe it in a pull request, a discussion or
anywhere else public before it is fixed.

A useful report says what an attacker can do, the steps to reproduce it, and
the Codemap, Node.js and operating system versions you tested with. Do not
include your API key, your company's code or anyone's personal data.

You get an answer as soon as I have read it. Once a fix is released, the
advisory is published with credit to you, unless you prefer not to be named.

## What is in scope

Anything that breaks the promises Codemap makes:

- the server accepting a request without the session token, with a wrong token,
  or from a wrong `Origin`, over HTTP or the WebSocket
- the server being reachable from anywhere but `127.0.0.1`
- reading a file outside the project folder through the server
- Codemap writing to the project outside `.codemap/`, or running project code
- a provider key stored anywhere but the operating system's keychain, or
  appearing in a log, a file or a request it does not belong in
- code, prompts or replies being logged or sent anywhere but the provider the
  user chose
- any outgoing request that is not to that provider

## Supported versions

Only the latest release receives security fixes.
