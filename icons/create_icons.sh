#!/bin/bash
# Simple script to create placeholder icons
# In production, replace these with proper icon files

# Create a simple colored square as placeholder
for size in 16 48 128; do
  convert -size ${size}x${size} xc:#2563eb -gravity center -pointsize $((size/3)) -fill white -annotate +0+0 "Q" icons/icon${size}.png 2>/dev/null || \
  echo "Creating placeholder for icon${size}.png"
done
