# Cashu.me fork — dual-host PWA publish toolchain
#
# ONE build artifact, TWO hosts (see .github/workflows/pwa-pages.yml):
#   GitHub Pages   https://pwa.orangesync.tech       (public, free HTTPS)
#   VPS            https://pwa-vps.orangesync.tech   (self-hosted, Caddy)
#
# Only PUBLIC_PATH and the CVM_* endpoint values may differ per host; both are
# injected at build time (quasar.config.js), so the code is never forked.
#
# The self-host leg (Caddy vhost + artifact install + DNS) is IaC in
# OpenTollGate/tollgate-infrastructure-kit:
#   make -C <kit> pwa-dns      # Cloudflare records (runs anywhere)
#   make -C <kit> pwa-deploy   # installs the artifact on vps2 (needs SSH)

PUBLIC_PATH ?= /
PWA_ARTIFACT ?= dist-pwa.tar.gz
PWA_DIST_DIR ?= dist/pwa
PWA_URL ?= https://pwa.orangesync.tech
PWA_VPS_URL ?= https://pwa-vps.orangesync.tech
KIT ?= ../tollgate-infrastructure-kit

export PUBLIC_PATH

.PHONY: pwa-build pwa-artifact pwa-pages pwa-vps pwa-verify pwa-clean

node_modules: package-lock.json
	npm ci

pwa-build: node_modules
	PUBLIC_PATH=$(PUBLIC_PATH) npm run build:pwa

# The exact bytes both hosts serve, plus the sha256 the VPS leg verifies.
pwa-artifact: pwa-build
	tar --numeric-owner --owner=0 --group=0 -czf $(PWA_ARTIFACT) -C $(PWA_DIST_DIR) .
	sha256sum $(PWA_ARTIFACT) > $(PWA_ARTIFACT).sha256
	cat $(PWA_ARTIFACT).sha256

# Trigger + watch the Pages/VPS publish workflow on the default branch.
pwa-pages:
	gh workflow run pwa-pages.yml --ref main
	sleep 5
	gh run list --workflow=pwa-pages.yml --limit 3

# Self-host leg: Cloudflare records + Caddy vhost + artifact install on vps2.
pwa-dns:
	$(MAKE) -C $(KIT) pwa-dns

pwa-vps:
	$(MAKE) -C $(KIT) pwa-deploy

# Read the live state back from both hosts.
pwa-verify:
	@echo "== canonical (GitHub Pages) =="
	curl -fsS -o /dev/null -w "index       %{http_code} %{content_type}\n" $(PWA_URL)/
	curl -fsS -o /dev/null -w "manifest    %{http_code} %{content_type}\n" $(PWA_URL)/manifest.webmanifest
	curl -fsS -o /dev/null -w "sw          %{http_code} %{content_type}\n" $(PWA_URL)/sw.js
	@echo "== self-host (VPS, gated on SSH) =="
	curl -fsS -o /dev/null -w "index       %{http_code}\n" $(PWA_VPS_URL)/ || echo "vps leg unreachable"

pwa-clean:
	rm -rf $(PWA_DIST_DIR) $(PWA_ARTIFACT) $(PWA_ARTIFACT).sha256
