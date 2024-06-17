// TODO(@darzu): experimenting w/ html template abstractions

import { V3 } from "../matrix/sprig-matrix.js";

// TODO(@darzu): use WebComponents ?
//  https://github.com/mdn/web-components-examples/blob/main/edit-word/index.html

export type MinMaxEditorOpt = {
  kind: "minMax";
  min: number;
  max: number;
  defaultMin: number;
  defaultMax: number;
  onChange: (min: number, max: number) => void;
};

export type MinMaxV3EditorOpt = {
  kind: "minMaxV3";
  min: V3.InputT;
  max: V3.InputT;
  defaultMin: V3.InputT;
  defaultMax: V3.InputT;
  onChange: (min: V3.InputT, max: V3.InputT) => void;
};

export type MinMaxColorEditorOpt = {
  kind: "minMaxColor";
  min: V3.InputT;
  max: V3.InputT;
  defaultMin: V3.InputT;
  defaultMax: V3.InputT;
  onChange: (min: V3.InputT, max: V3.InputT) => void;
};

export type PaletteColorEditorOpt = {
  kind: "paletteColor";
  defaultIdx: number;
  onChange: (idx: number) => void;
};

export type Editor = MinMaxEditorOpt | MinMaxV3EditorOpt | MinMaxColorEditorOpt;

export interface HtmlBuilder {
  addInfoPanel(title: string): InfoPanel;
}

export interface InfoPanel {
  _div: HTMLDivElement;
  addEditor(editor: Editor): void;
}

function createHtmlBuilder(): HtmlBuilder {
  // TODO(@darzu): impl
  throw "TODO";
}
