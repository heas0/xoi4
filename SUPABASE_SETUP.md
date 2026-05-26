# Supabase setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_WORLD_ID=default`
4. Run `npm run build` or `npm run dev`.

The app keeps working in local-only mode when the env vars are missing or Supabase is unavailable.

## GitHub Pages deploy

Deploy uses a local production build and publishes only `dist` to the `gh-pages` branch:

```bash
npm run deploy
```

Do not commit `.env`. Vite embeds `VITE_*` values into the public JavaScript bundle during build, so these values must be safe to expose in the browser. For Supabase this means using only the project URL, anon key, and a world id; never use a service role key in this app.
