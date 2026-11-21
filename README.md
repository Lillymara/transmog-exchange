# Transmog Exchange

A community transmog catalog for **Gemstone IV**. Players share their
transmog items with the Lich script `transmog_inventory.lic`; anyone can
search the combined catalog on the web.

**Live site:** https://gs4.lmthings.com/transmog/

## For players

1. Scan your locker: `;transmog_inventory`
2. Pick a display name: `;transmog_inventory setname <name>`
3. Publish: `;transmog_inventory upload` (again after any change)
4. Remove your listing: `;transmog_inventory clearweb confirm`

Your display name is bound to a random token the script keeps in
`transmog/transmog_config.json`. Copy that file to a new machine to keep
your name.

## How it runs

One Cloudflare Worker (`src/worker.js`) serves the site from `site/` and
the API at `/transmog/api/`, backed by a D1 (SQLite) database.

| Route | Purpose |
|---|---|
| `POST /transmog/api/upload` | `{player_name, discord_name, token, items[]}` replaces that player's items |
| `POST /transmog/api/clear` | `{token}` removes that player |
| `GET /transmog/api/search?q=&loc=&limit=&offset=` | search (alt names are never returned) |
| `GET /transmog/api/stats` | item and player counts |
| `GET /transmog/api/players` | display names |

Tokens are stored only as SHA-256 hashes.

## Development

```
npm install
npm run db:init:local   # create the local database
npm run dev             # http://localhost:8787/transmog/
npm run deploy          # needs `npx wrangler login`
```

`npm run db:init` applies `schema.sql` to the live database (safe to rerun).

The `index.html` / `404.html` at the repo root are only a redirect for the
old GitHub Pages address (lillymara.github.io/transmog-exchange).
