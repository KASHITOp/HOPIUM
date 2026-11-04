# Deploying HOPIUM's website on Vercel

Only needed if the agent cannot deploy for you. Takes about 3 minutes.

1. Vercel dashboard > **Add New... > Project** > import **KASHITOp/HOPIUM** (or open the existing `hopium` project > Settings > Git and connect it).
2. **Root Directory:** `web`. Framework preset: **Next.js** (auto-detected). Leave build and install commands empty.
3. **Environment Variables** (Production and Preview):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://pnctzcczifowlhdchdhg.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your publishable key (`sb_publishable_...`, safe to expose; RLS makes it read-only) |
   | `NEXT_PUBLIC_DATA_MODE` | `live` |
   | `NEXT_PUBLIC_SITE_URL` | the production URL, e.g. `https://hopium.vercel.app` |
4. Settings > Functions > **Function Region:** `bom1` (Mumbai).
5. **Production Branch:** `main`. Deploy.
6. Settings > Analytics: enable **Web Analytics** (cookieless; already disclosed in the Privacy Policy).

Never add the Supabase service-role key to Vercel. The site only reads.
