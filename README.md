# plaud

> **Alpha** — Early test version. Building in public, testing on my own recordings.

Unofficial TypeScript toolkit for the [Plaud](https://www.plaud.ai/) API — core library, CLI, and MCP server.

## Why

[Plaud](https://www.plaud.ai/) makes AI-powered wearable recorders (Plaud Note, Plaud NotePin) that capture meetings, conversations, and voice notes, then transcribe and summarize them in the cloud. Great hardware, but all your data lives behind their app with no official API or export tools.

This toolkit gives you programmatic access to your own recordings. Download audio files, pull transcripts, sync everything to local folders — your data, your workflow. Built as a monorepo with three packages:

- **`@plaud/core`** — Shared library: authentication, API client, config management. Handles token lifecycle automatically (tokens last ~300 days, auto-refresh when within 30 days of expiry).
- **`@plaud/cli`** — Command-line tool to list, download, transcribe, and sync recordings.
- **`@plaud/mcp`** — [MCP server](https://modelcontextprotocol.io/) that exposes your Plaud recordings to AI assistants like Claude, making your voice notes searchable and accessible from any MCP-compatible tool.

## Setup

```bash
git clone https://github.com/sergivalverde/plaud.git
cd plaud && npm install
```

### 1. Login

**Email + password accounts:**

```bash
npx tsx packages/cli/bin/plaud.ts login
```

Enter your email, password, and region. Credentials are stored locally in `~/.plaud/config.json` (mode 0600).

**Google / Apple SSO accounts:**

Plaud stores SSO identities separately from email+password accounts and offers no public way to add a password to an SSO-only account ("Forgot Password" returns `user not exist`; "Login with verification code" creates a brand-new, empty account). To work around this, paste the bearer token your browser already has:

```bash
npx tsx packages/cli/bin/plaud.ts login-sso
```

The command walks you through it:
1. Open [web.plaud.ai](https://web.plaud.ai), sign in with Google or Apple.
2. Open DevTools Console and run `localStorage.tokenstr`.
3. Paste the output (a `Bearer <jwt>` string) into the prompt.

Plaud tokens are valid ~300 days. Within 30 days of expiry the CLI errors out with `Re-run 'plaud login-sso'` — grab a fresh `tokenstr` from the browser and re-run.

### 2. CLI Usage

```bash
# List recordings
npx tsx packages/cli/bin/plaud.ts list

# Get transcript
npx tsx packages/cli/bin/plaud.ts transcript <recording-id>

# Download audio
npx tsx packages/cli/bin/plaud.ts download <recording-id> ./audio/

# Sync all recordings to a folder
npx tsx packages/cli/bin/plaud.ts sync ./plaud-notes/
```

### 3. MCP Server

Add to your Claude config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "plaud": {
      "command": "npx",
      "args": ["tsx", "/path/to/plaud/packages/mcp/src/index.ts"]
    }
  }
}
```

Tools available:
- `plaud_list_recordings` — list all recordings
- `plaud_get_transcript` — get transcript by recording ID
- `plaud_get_recording_detail` — full recording metadata
- `plaud_user_info` — account info
- `plaud_get_mp3_url` — temporary MP3 download URL

## Token Management

Tokens are obtained automatically via email+password and last ~300 days. The library refreshes silently when a token is within 30 days of expiry. No manual intervention needed after initial `plaud login`.

## API

The API was reverse-engineered from the Plaud web app. This is an unofficial project — not affiliated with or endorsed by Plaud.

## License

MIT
