// TODO: probably not performant
export function setStyle(e: Element, style: any) {
  let styleStr = JSON.stringify(style)
    .replace(/[\"{}]/g, ``)
    .replace(/\,/g, ";\n");
  e.setAttribute("style", styleStr);
}
