#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if version type argument is provided
if [ -z "$1" ]; then
  print_error "Please provide a version type: patch, minor, or major"
  print_info "Usage: ./release.sh [patch|minor|major]"
  exit 1
fi

VERSION_TYPE=$1

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  print_error "Version type must be one of: patch, minor, major"
  exit 1
fi

print_info "Preparing to release $VERSION_TYPE version"

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  print_error "You must be on the main branch to create a release"
  print_info "Current branch: $CURRENT_BRANCH"
  exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  print_error "You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Pull latest changes
print_info "Pulling latest changes from origin..."
git pull origin main

# Run type checking
print_info "Running type check..."
if ! npm run type-check; then
  print_error "Type checking failed. Please fix type errors before releasing."
  exit 1
fi

# Run build to ensure it builds correctly
print_info "Testing build..."
if ! npm run build; then
  print_error "Build failed. Please fix build errors before releasing."
  exit 1
fi

# Update version and create commit/tag
print_info "Updating version and creating release commit..."
npm version $VERSION_TYPE -m "Release v%s"

# Get the new version for display
NEW_VERSION=$(node -p "require('./package.json').version")

# Update CHANGELOG.md
print_info "Updating CHANGELOG..."
echo ""
echo "What changes should be included in this release?"
echo "Enter changelog entries (one per line). Press Ctrl+D when done:"
echo ""

# Read changelog entries from user
CHANGELOG_ENTRIES=""
while IFS= read -r line; do
  if [ -n "$line" ]; then
    CHANGELOG_ENTRIES="${CHANGELOG_ENTRIES}- ${line}\n"
  fi
done

if [ -n "$CHANGELOG_ENTRIES" ]; then
  # Get current date
  CURRENT_DATE=$(date +"%Y-%m-%d")
  
  # Create the new changelog entry
  NEW_ENTRY="## $NEW_VERSION - $CURRENT_DATE\n\n### ${VERSION_TYPE^}\n${CHANGELOG_ENTRIES}\n"
  
  # Insert the new entry after the header (line 8)
  sed -i.bak "8a\\
\\
$NEW_ENTRY" CHANGELOG.md
  
  # Remove backup file
  rm CHANGELOG.md.bak
  
  # Add CHANGELOG to the commit
  git add CHANGELOG.md
  git commit --amend --no-edit
  
  print_info "CHANGELOG.md updated"
else
  print_warning "No changelog entries provided, skipping CHANGELOG update"
fi

# Push changes and tags
print_info "Pushing changes and tags to origin..."
git push origin main --tags

print_info "🎉 Release process completed!"
print_info "Released version: v$NEW_VERSION"
print_info ""
print_info "You can view the release at:"
print_info "https://github.com/marhaasa/weave/releases"