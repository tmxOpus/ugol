#!/bin/sh
# Собрать папку dist/ только с файлами игры (без референсов и документа)
# и архив ugol-site.zip — их можно выложить на любой HTTPS-хостинг.
cd "$(dirname "$0")" || exit 1
rm -rf dist ugol-site.zip
mkdir -p dist/js dist/icons
cp index.html style.css manifest.json sw.js dist/
cp js/*.js dist/js/
cp icons/*.png dist/icons/
(cd dist && zip -qr ../ugol-site.zip .)
echo "готово: dist/ и ugol-site.zip"
