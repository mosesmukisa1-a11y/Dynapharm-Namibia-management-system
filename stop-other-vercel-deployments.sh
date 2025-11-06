#!/bin/bash

# Script to stop all Vercel deployments except the correct one
# Correct deployment: dynapharm-namibia-management-system-pi

set -e

TEAM_ID="team_qFWDX1wCnfnvezFivR8cUUZA"
CORRECT_PROJECT_NAME="dynapharm-namibia-management-system-pi"

echo "🔍 Checking Vercel authentication..."
if ! vercel whoami &>/dev/null; then
    echo "❌ Not authenticated with Vercel. Please run: vercel login"
    exit 1
fi

echo "✅ Authenticated with Vercel"
echo ""

echo "📋 Listing all projects for team: $TEAM_ID"
PROJECTS=$(vercel projects list --team "$TEAM_ID" --json 2>/dev/null || echo "[]")

if [ "$PROJECTS" = "[]" ] || [ -z "$PROJECTS" ]; then
    echo "⚠️  Could not list projects. Trying without team flag..."
    PROJECTS=$(vercel projects list --json 2>/dev/null || echo "[]")
fi

if [ "$PROJECTS" = "[]" ] || [ -z "$PROJECTS" ]; then
    echo "❌ No projects found or unable to list projects"
    echo "💡 Try running: vercel projects list"
    exit 1
fi

echo "Found projects:"
echo "$PROJECTS" | jq -r '.[] | "  - \(.name) (\(.id))"'

echo ""
echo "🔍 Looking for correct project: $CORRECT_PROJECT_NAME"
CORRECT_PROJECT_ID=$(echo "$PROJECTS" | jq -r ".[] | select(.name == \"$CORRECT_PROJECT_NAME\") | .id")

if [ -z "$CORRECT_PROJECT_ID" ] || [ "$CORRECT_PROJECT_ID" = "null" ]; then
    echo "⚠️  Could not find project: $CORRECT_PROJECT_NAME"
    echo "Available projects:"
    echo "$PROJECTS" | jq -r '.[] | "  - \(.name)"'
    echo ""
    read -p "Enter the project name to keep (or press Enter to exit): " MANUAL_PROJECT
    if [ -z "$MANUAL_PROJECT" ]; then
        exit 1
    fi
    CORRECT_PROJECT_ID=$(echo "$PROJECTS" | jq -r ".[] | select(.name == \"$MANUAL_PROJECT\") | .id")
    CORRECT_PROJECT_NAME="$MANUAL_PROJECT"
fi

if [ -z "$CORRECT_PROJECT_ID" ] || [ "$CORRECT_PROJECT_ID" = "null" ]; then
    echo "❌ Project not found"
    exit 1
fi

echo "✅ Found correct project: $CORRECT_PROJECT_NAME ($CORRECT_PROJECT_ID)"
echo ""

# List all projects except the correct one
OTHER_PROJECTS=$(echo "$PROJECTS" | jq -r ".[] | select(.id != \"$CORRECT_PROJECT_ID\") | .id")

if [ -z "$OTHER_PROJECTS" ]; then
    echo "✅ No other projects found. Only the correct project exists."
    exit 0
fi

echo "📦 Projects to remove:"
echo "$PROJECTS" | jq -r ".[] | select(.id != \"$CORRECT_PROJECT_ID\") | \"  - \(.name) (\(.id))\"" 

echo ""
read -p "⚠️  Are you sure you want to remove these projects? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Cancelled"
    exit 0
fi

echo ""
echo "🗑️  Removing other projects..."

for PROJECT_ID in $OTHER_PROJECTS; do
    PROJECT_NAME=$(echo "$PROJECTS" | jq -r ".[] | select(.id == \"$PROJECT_ID\") | .name")
    echo "  Removing: $PROJECT_NAME ($PROJECT_ID)"
    
    # Try to remove the project
    if vercel projects rm "$PROJECT_ID" --team "$TEAM_ID" --yes 2>/dev/null; then
        echo "    ✅ Removed: $PROJECT_NAME"
    else
        echo "    ⚠️  Could not remove: $PROJECT_NAME (may need manual removal from dashboard)"
    fi
done

echo ""
echo "✅ Done! Keeping only: $CORRECT_PROJECT_NAME"
echo "🌐 Correct deployment: https://${CORRECT_PROJECT_NAME}.vercel.app"

