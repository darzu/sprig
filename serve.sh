#!/usr/bin/env sh

set -e
SCRIPTPATH=$(cd `dirname $0` && pwd)

SCRIPTPARENT=$(cd $SCRIPTPATH/.. && pwd)

if [ ! -L public/assets ] || [ ! -e public/assets ] ; then
    echo "Local assets not found; will fall back to remote assets."
    echo "You can link in local assets:"
    echo "\tln -s <assets-dir> public/assets"
    read -p "Proceed with remote assets? [Y/n] " yn
    case $yn in
        [Nn*] ) echo "Quitting!"; exit 0
    esac
fi

python3 -m http.server 4321 -d public > /dev/null 2>&1 &
tsc -w
