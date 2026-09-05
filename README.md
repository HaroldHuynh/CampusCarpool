# CampusCarpool

A responsive ride-request board backed by Supabase.

## Run it

1. Open your Supabase project and run `DemoSite/supabase.sql` in the SQL Editor.
2. Serve the site locally:

   ```sh
   cd DemoSite
   python3 -m http.server 8000
   ```

3. Visit `http://localhost:8000`.

The current Supabase project URL and publishable key are configured at the top of `DemoSite/app.js`. Replace them to use another project. The included policies allow public reading and posting for this demo. For production, add Supabase Auth and restrict inserts to authenticated campus accounts.
