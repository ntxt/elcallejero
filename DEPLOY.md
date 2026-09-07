# Deploying

The site is a static build of `web/`. Netlify runs only the JavaScript build —
the Python pipeline stays local, and the Málaga bundles it produces are committed
under `web/public/data`.

## First-time setup

1. **Connect the repository.** In Netlify, *Add new site → Import an existing
   project* → GitHub → `ntxt/elcallejero`. `netlify.toml` supplies the build
   settings, so leave the form's defaults alone:

   | | |
   |---|---|
   | Base directory | `web` |
   | Build command | `npm ci && npm run build` |
   | Publish directory | `dist` (relative to the base) |
   | Node | 20 |

2. **Add the domain.** *Domain management → Add a domain* →
   `callejero.ntxt.net`. Netlify will ask you to prove ownership by DNS.

3. **Point DNS at it.** In whatever hosts the `ntxt.net` zone, add:

   ```
   callejero.ntxt.net.   CNAME   <site-name>.netlify.app.
   ```

   Use the `.netlify.app` hostname Netlify shows for this site, not an IP — the
   address behind it changes. A CNAME is correct here because this is a
   subdomain; an apex domain would need Netlify's ALIAS/A records instead.

4. **Wait for the certificate.** Netlify issues Let's Encrypt automatically once
   the CNAME resolves, usually within a few minutes. Then turn on *Force HTTPS*.

## Deploying a change

Pushing to `main` deploys. Pull requests get deploy previews.

If the change is to the **data** rather than the viewer, rebuild and commit the
bundles first — Netlify will not do it for you:

```sh
make build CITY=malaga && make terrain CITY=malaga && make web
git add web/public/data && git commit -m "data: rebuild Málaga bundle"
```

## Adding a city to the deployed site

```sh
make build CITY=granada && make terrain CITY=granada
cp data/out/granada.*json web/public/data/
```

then add it to `CITIES` in `web/src/App.tsx` and commit both.

## The standalone demo

`make single` (or `npm run artifact` in `web/`) produces one self-contained HTML
file with the data inlined, for publishing somewhere that serves a page and
nothing else. It is not part of the Netlify build.
