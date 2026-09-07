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
   | Base directory | *(leave empty)* |
   | Build command | `cd web && npm ci && npm run build` |
   | Publish directory | `web/dist` |
   | Node | 20 |

   **Leave the base directory empty.** If it is set, Netlify resolves
   `netlify.toml` relative to it and the root config is only partly read — the
   build still succeeds, so the breakage is silent: caching and security headers
   simply never apply. Check for it with
   `curl -sI https://callejero.ntxt.net/assets/<hashed>.js | grep -i cache`,
   which should report `max-age=31536000, immutable` and not `max-age=0`.

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

## Troubleshooting DNS

`ntxt.net` is delegated to `ns1/ns2/ns3.domena.pl`, not to Netlify DNS, so adding
the domain in Netlify does **not** create the record. Both steps are needed.

Ask the authoritative nameserver directly — it skips every cache and separates a
missing record from a slow one:

```sh
dig @ns1.domena.pl callejero.ntxt.net CNAME +short   # should print <site>.netlify.app.
dig @1.1.1.1       callejero.ntxt.net        +short   # the public view
```

`NXDOMAIN` with the `aa` flag from the authoritative server means the record does
not exist and nothing is propagating. Once it answers correctly, resolvers that
already asked hold the negative answer for up to the zone's SOA minimum — 3600s
here — and *that* wait is real propagation.

Until Netlify has issued the certificate, the site answers HTTPS with its default
`*.netlify.app` wildcard, which does not cover this hostname. Test over HTTP, or
pin the address, until then:

```sh
curl -sI --resolve callejero.ntxt.net:80:$(dig +short @1.1.1.1 callejero.ntxt.net A | tail -1) \
  http://callejero.ntxt.net/
```

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
