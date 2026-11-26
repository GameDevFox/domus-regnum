#!/bin/bash
# Publish the domus build to S3 (+ CloudFront). Runnable from ANY directory — it cds to its own
# location (packages/domus) first, so `yarn build` and the dist/ sync resolve correctly.
#   ./publish.sh   # build (the app, plus packages/manor under /manor/) + sync to S3 (CloudFront invalidation skipped unless the id env var is set)
#   DOMUS_REGNUM_CLOUDFRONT_DISTRIBUTION_ID=E123ABC ./publish.sh   # also invalidate the CDN cache
# Credentials come from the `neko` AWS profile by default (override with AWS_PROFILE).
set -euo pipefail

# Resolve + move to this script's directory so paths don't depend on the caller's CWD.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROFILE="${AWS_PROFILE:-neko}"
# Account-specific ids stay out of the public repo: the gitignored deploy/aws/site.env (repo root)
# may set DOMUS_REGNUM_CLOUDFRONT_DISTRIBUTION_ID, so the invalidation below runs without typing it.
# shellcheck source=/dev/null
[ -f ../../deploy/aws/site.env ] && source ../../deploy/aws/site.env
BUCKET="s3://gamedevfox-domus"

# Vite outputs to dist/ (this used to be CRA's build/).
yarn build

# The manor prototypes (2D and 3D, packages/manor) live under /manor/ on the same site: the Game Demo
# tab links to them. They build after the app so its `dist/` wipe does not take them with it.
MANOR_BASE=/manor/ yarn workspace manor exec vite build --outDir "$PWD/dist/manor" --emptyOutDir

# `--delete` makes the bucket exactly match dist/, clearing stale files (incl. the old CRA layout).
aws s3 sync dist "$BUCKET" --delete --profile "$PROFILE"

# CloudFront serves a cache, so a fresh deploy isn't visible until the cache expires or is invalidated.
# Set DOMUS_REGNUM_CLOUDFRONT_DISTRIBUTION_ID to your distribution id (the IAM user needs
# cloudfront:CreateInvalidation).
if [ -n "${DOMUS_REGNUM_CLOUDFRONT_DISTRIBUTION_ID:-}" ]; then
  aws cloudfront create-invalidation \
    --distribution-id "$DOMUS_REGNUM_CLOUDFRONT_DISTRIBUTION_ID" --paths "/*" --profile "$PROFILE"
else
  echo "NOTE: DOMUS_REGNUM_CLOUDFRONT_DISTRIBUTION_ID not set — skipped CloudFront invalidation; the CDN"
  echo "      may keep serving the previous build until its cache TTL expires. Re-run with"
  echo "      DOMUS_REGNUM_CLOUDFRONT_DISTRIBUTION_ID=<id> set."
fi
