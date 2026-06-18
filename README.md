# Transmog Exchange

A community transmog catalog for **Gemstone IV**. Players share their
transmog item inventory via a Lich in-game command; anyone can search
the combined catalog on the web.

**Live site:** https://lillymara.github.io/transmog-exchange/

---

## For Players

1. Make sure you have `transmog_inventory.lic` and have run a scan:
   ```
   ;transmog_inventory
   ```
2. Upload your catalog to the exchange:
   ```
   ;transmog_inventory upload
   ```
   Your character name is claimed on first upload — only your machine
   can overwrite it. Re-upload any time after a new scan to refresh.

---

## Project Setup

### 1. Supabase (database — free tier)

1. Create a free project at https://supabase.com
2. Go to **Database → SQL Editor → New query**
3. Paste the contents of [`schema.sql`](schema.sql) and click **Run**
4. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long JWT string)

### 2. Fill in credentials

**`app.js`** (web search frontend):
```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

**`transmog_inventory.lic`** (Lich script — two constants near the top):
```ruby
SUPABASE_URL      = "https://YOUR_PROJECT_REF.supabase.co".freeze
SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY".freeze
```

### 3. Enable GitHub Pages

1. Push all files to the `main` branch of this repo
2. Go to **Settings → Pages**
3. Source: **Deploy from a branch** → `main` → `/ (root)` → Save
4. Site will be live at `https://lillymara.github.io/transmog-exchange/`

---

## How the token system works

- On first upload, `transmog_inventory.lic` auto-generates a random UUID
  and saves it to `transmog/transmog_config.json` in your Lich scripts
  folder. Players never see or manage it.
- A character name is bound to the token that first uploaded it.
  Any future upload for that name must supply the same token.
- Players can own multiple character names as long as they upload from
  the same machine (same `transmog_config.json`).
- If a player changes machines, they can copy `transmog_config.json`
  to the new machine to retain their claims.

---

## Files

| File | Purpose |
|---|---|
| `index.html` / `style.css` / `app.js` | Web search interface (GitHub Pages) |
| `schema.sql` | Supabase database + function setup |
| `transmog_inventory.lic` | Lich script (scan + upload) — distribute to players |
