# Caddy with the hint-penaltybox module compiled in via xcaddy, pinned
# to an exact commit. See the module README for the wire contract it
# consumes (X-Rate-Limit-Level, emitted by the CMS's rateLimitHints
# 'header' mode — enabled in apps/www/admin/admin.ts).
FROM caddy:2.11.4-builder AS builder
RUN xcaddy build v2.11.4 \
	--with github.com/hotsauce-team/caddy-hint-penaltybox@d279116e159666bd2551f1d3857750721e93a690

FROM caddy:2.11.4
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
# Fail the image build if the module didn't make it into the binary.
RUN caddy list-modules | grep -q '^http.handlers.hint_penaltybox$'
COPY Caddyfile /etc/caddy/Caddyfile
