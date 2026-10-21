# LockIn – Trading Journal

Static site. No backend, no database, no build step.

## Deploy on Vercel
1. Go to vercel.com/new and drag this whole folder in (or push it to GitHub and import the repo).
2. Framework preset: **Other**. Leave Build Command and Output Directory empty.
3. Deploy. Open the URL on your phone and tap **Add to Home Screen**.

CLI alternative: run `npx vercel --prod` inside this folder.

## Where data lives
Everything is stored on each person's own device (browser storage + IndexedDB for screenshots).
Nothing is uploaded. Clearing site data erases it, so use Settings > Export everything now and then.
