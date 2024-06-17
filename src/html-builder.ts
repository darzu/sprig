// TODO(@darzu): experimenting w/ html template abstractions

// TODO(@darzu): use WebComponents ?
//  https://github.com/mdn/web-components-examples/blob/main/edit-word/index.html

interface ElementOpts {
  class: string;
  id: string;
}
interface HtmlBuilder {
  currentEl: HTMLElement;
  pushDiv(opt?: ElementOpts): HTMLDivElement;
  insertDiv(opt?: ElementOpts): HTMLDivElement;
  pop(): void;
  addH2(opt?: ElementOpts): void;
}

const html = [
  {
    div: {
      _class: "infoPanel",
      h2: "Shipyard",
      _text: `The ship is defined with paths and constraints.
      These then procedurally generate a mesh and metadata (e.g. colliders), which support runtime modification.`,
    },
  },
  {
    div: {
      _class: "infoPanel",
      h2: "Controls",
      ul: [
        { li: "Drag to pan" },
        { li: "Scroll to zoom" },
        { li: "Refresh to reset" },
        {
          li: {
            _text: "Click to: ",
            span: {
              _id: "clickModeString",
            },
          },
        },
      ],
    },
  },
];
