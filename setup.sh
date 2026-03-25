#!/bin/bash
set -e

echo "🌱 PlantCare Tracker v2 — Setup"
echo "================================"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Setup API env
if [ ! -f "apps/api/.env" ]; then
    echo "⚙️  Creating apps/api/.env from example..."
    cp apps/api/.env.example apps/api/.env
    echo "⚠️  Please edit apps/api/.env and set JWT_SECRET before production use!"
fi

# Run migrations
echo "🗄️  Running database migrations..."
cd apps/api
pnpm db:migrate

# Ask about seed
read -p "🌱 Insert demo data? (alice@example.com / password123) [y/N] " seed
if [[ $seed =~ ^[Yy]$ ]]; then
    pnpm db:seed
fi

cd ../..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Start development:"
echo "  pnpm dev"
echo ""
echo "Access:"
echo "  Frontend: http://localhost:5173"
echo "  API:      http://localhost:3000"
echo ""
