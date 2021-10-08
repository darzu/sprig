#!/bin/sh

python3 -m http.server 4321 -d public > /dev/null 2>&1 &
tsc -w
