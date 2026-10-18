#!/bin/sh
# Поднять версию игры: index.html и sw.js получают новый номер,
# телефоны скачают обновление при следующем запуске с интернетом.
cd "$(dirname "$0")" || exit 1
V=$(($(sed -n "s/^const VERSION = '\([0-9]*\)';/\1/p" sw.js) + 1))
sed -i '' -E "s/\?v=[0-9]+\"/?v=$V\"/g" index.html
sed -i '' -E "s/^const VERSION = '[0-9]+';/const VERSION = '$V';/" sw.js
echo "версия $V"
