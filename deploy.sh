#!/bin/bash
# Deploy frontend to hotworx-team.vercel.app
# Run this from the repo root: ./deploy.sh

set -e
echo "Building and deploying to hotworx-team.vercel.app..."

cd "$(dirname "$0")/frontend"
npm run build
vercel --prod --yes
echo "Done. Live at https://hotworx-team.vercel.app"
