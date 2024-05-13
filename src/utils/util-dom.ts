// TODO: probably not performant
export function setStyle(e: Element, style: any) {
  let styleStr = JSON.stringify(style)
    .replace(/[\"{}]/g, ``)
    .replace(/\,/g, ";\n");
  e.setAttribute("style", styleStr);
}

export function pathToSvgDom(d: string): SVGPathElement {
  let blk = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let path = d;
  blk.setAttribute("d", path);
  return blk;
}
