# set -e
cd ~/sprig
HASH=`git rev-parse --short HEAD`
cd ~/ld54
rsync -rav --exclude=".*" --ignore-errors ~/sprig/public/ ~/ld54/
# cp -r ~/sprig/public/*.js ~/ld54/ #problems w/ .git folder 
git add --all .
git commit -m "from sprig $HASH"
git push
cd ~/sprig