# Getting Started
```
tsc -w

cd public
python -m SimpleHTTPServer 4321
python3 -m http.server 4321
```

For UTF-8:
```
python3 -c "from http.server import test, SimpleHTTPRequestHandler as RH; RH.extensions_map={k:v+';charset=UTF-8' for k,v in RH.extensions_map.items()}; test(RH)"
```

# Code Structure

tast: Typescript AST
bast: Blocks AST
sast: Sized AST
rast: Renderable AST

# References
https://www.typescriptlang.org/docs/handbook/gulp.html

https://github.com/microsoft/TypeScript/wiki/Architectural-Overview
https://github.com/Microsoft/TypeScript/wiki/Using-the-Language-Service-API
https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API

## Colors

### Accessability
https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
https://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef

### Color Spaces (CAM/UCS)
https://bottosson.github.io/posts/oklab/
https://www.w3.org/TR/css-color-4/
https://drafts.csswg.org/css-color/#lab-colors
https://drafts.csswg.org/css-color/#color-conversion-code
https://en.wikipedia.org/wiki/Color_appearance_model
https://en.wikipedia.org/wiki/Bezold–Brücke_shift
https://www.handprint.com/HP/WCL/wcolor.html
https://www.cl.cam.ac.uk/teaching/1516/AdvGraph/02_Light_and_colour.pdf
https://observablehq.com/@mattdesl/perceptually-smooth-multi-color-linear-gradients
https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/lab()
https://en.wikipedia.org/wiki/Color_difference

### Rainbows / Palettes
https://ai.googleblog.com/2019/08/turbo-improved-rainbow-colormap-for.html