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

- the server accepting a request without the session, with a wrong one, or
  from a wrong `Origin` or `Host`, over HTTP or the WebSocket
- the token in the printed address letting in more than one browser
- the server being reachable from anywhere but `127.0.0.1`
- reading a file outside the project folder through the server
- Codemap writing anywhere outside the project's `.codemap/` folder (a
  `.codemap` a repository commits as a link, or with links in it, is refused),
  or running project code
- Codemap using a cache it did not seal on this machine: what a repository
  commits in `.codemap/` is never read
- the cache being readable by another user of the machine
- code the user keeps out of git, in any `.gitignore`, `.git/info/exclude` or
  their own excludes file, being sent to a provider
- a provider key stored anywhere but the operating system's keychain, or
  appearing in a log, a file or a request it does not belong in
- code, prompts or replies being logged or sent anywhere but the provider the
  user chose
- any outgoing request that is not to that provider

## Known limits

These are known, and not treated as vulnerabilities:

- The session cookie is named after Codemap's port, but browsers send cookies
  to every port of a host. Another server on `127.0.0.1` that the browser
  visits receives it while Codemap runs.
- Ollama is reached over plain HTTP on its fixed port, `11434`. Another user of
  the machine who binds that port while Ollama is not running receives the
  prompts, which carry code.
- Anyone who holds the session can make the server build many maps or ask many
  questions; the session only ever belongs to the user who started Codemap.
- Stopped while a request is out, Codemap leaves the `claude` command it
  started to finish or time out, with its empty temporary folder.
- A key pasted into code is masked before the code is sent to be explained
  only where it has a shape providers issue; any other secret in code is sent
  as it is written.
- The user's own excludes file is found in `~/.gitconfig` and the git config
  of their config folder; a file those include with `[include]` is not read,
  and neither is the system's git config.
- On Windows, the cache's folder and files are not checked for their owner,
  links in them are not refused by the system, and their permissions are not
  narrowed: they keep what the folder around them allows.

## Supported versions

Only the latest release receives security fixes.
