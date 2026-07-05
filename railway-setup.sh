#!/bin/bash

# Kohedha API - Railway Free Deployment Script

echo "🚂 Kohedha API - Railway Deployment"
echo "===================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "📝 Logging in to Railway..."
railway login

# Initialize project
echo "🎯 Initializing Railway project..."
railway init

# Add PostgreSQL
echo "🗄️  Adding PostgreSQL database..."
railway add

echo ""
echo "⚠️  IMPORTANT: Select 'PostgreSQL' from the list"
echo ""
read -p "Press Enter after selecting PostgreSQL..."

# Set environment variables
echo "🔧 Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set BEACON_TTL_MS=7200000

# Deploy the application
echo "🚀 Deploying application..."
railway up

# Wait for deployment
echo "⏳ Waiting for deployment to complete..."
sleep 30

# Connect to database to enable PostGIS
echo ""
echo "📊 Enabling PostGIS extension..."
echo "   Running: railway connect postgres"
echo ""
echo "   Please run this command in the PostgreSQL shell:"
echo "   CREATE EXTENSION IF NOT EXISTS postgis;"
echo ""
read -p "Press Enter to open database shell..."
railway connect postgres

# Run migrations
echo "🗃️  Running database migrations..."
railway run npm run migrate

# Get the deployment URL
echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your API is live at:"
railway domain
echo ""
echo "🧪 Test it:"
echo "   curl \$(railway domain)/health"
echo ""
echo "📝 To view logs:"
echo "   railway logs"
echo ""
echo "💰 Free tier includes:"
echo "   - 500 execution hours/month"
echo "   - PostgreSQL database included"
echo "   - HTTPS enabled automatically"
echo ""
echo "🎉 Deployment successful!"
