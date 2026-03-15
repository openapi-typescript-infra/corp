# DevEx

## Prerequisites

### mise

We use [mise](https://mise.jdx.dev) to manage tool versions (Node, etc.) and shared environment variables across the monorepo. Both the web service and mobile app read env vars from `mise.toml`, so this is the single source of truth for local development configuration.

Install it:

```
curl https://mise.jdx.dev/install.sh | sh
```

Then add the activation hook to your shell profile (`~/.zshrc` or `~/.bashrc`):

```
eval "$(mise activate zsh)"   # or bash
```

Restart your shell, then trust the project config:

```
cd /path/to/justtellme
mise trust
```

After this, `mise` will automatically activate the correct Node version and set env vars whenever you `cd` into the repo. You can verify with:

```
mise env | grep APP_ENV
```

### gcloud

Running the stack requires a configured gcloud client. To keep credentials isolated, the `mise.toml` points `CLOUDSDK_CONFIG` at a dedicated directory:

```
gcloud config configurations create justtellme --project=justtellme-dev
```

## Running locally

Run the proxy which will bind to 127.0.0.2 and add a DNS resolver on Mac (the whole proxy thing doesn't really work on Windows).

```
yarn proxy
```

And finally, you can run services selectively or you can use our nifty service runner:

```
yarn run-local
```
