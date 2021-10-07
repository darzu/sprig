# Getting Started
```
cd src
tsc -w
```

```
cd public
python -m SimpleHTTPServer 4321
# or
python3 -m http.server 4321
```

For WebGPU experience, use Chrome Canary:
https://web.dev/gpu-compute/

For UTF-8 (not needed):
```
python3 -c "from http.server import test, SimpleHTTPRequestHandler as RH; RH.extensions_map={k:v+';charset=UTF-8' for k,v in RH.extensions_map.items()}; test(RH)"
```
