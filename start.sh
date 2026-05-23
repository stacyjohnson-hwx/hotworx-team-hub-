#!/bin/bash
# Kill anything on the dev ports first
lsof -ti:3001,5173 | xargs kill -9 2>/dev/null
sleep 1

echo "Starting backend..."
cd "$(dirname "$0")/backend"
npm run dev &

# Wait for backend to be ready
sleep 4

echo "Starting frontend..."
cd "$(dirname "$0")/frontend"
npm run dev
