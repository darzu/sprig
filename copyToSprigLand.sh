# set -e
cd ~/sprig
HASH=`git rev-parse --short HEAD`
cd ~/darzu.github.io
rsync -rav --no-links --exclude=".*" --ignore-errors ~/sprig/public/ ~/darzu.github.io/
# cp -r ~/sprig/public/*.js ~/ld54/ #problems w/ .git folder 
git add --all .
git commit -m "from sprig $HASH"
git push
cd ~/sprig