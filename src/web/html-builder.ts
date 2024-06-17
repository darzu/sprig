import { V3 } from "../matrix/sprig-matrix.js";
import { assert } from "../utils/util-no-import.js";

// TODO(@darzu): experimenting w/ html template abstractions

// TODO(@darzu): use WebComponents ?
//  https://github.com/mdn/web-components-examples/blob/main/edit-word/index.html

export type MinMaxEditorOpt = {
  kind: "minMax";
  label: string;
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
  defaultMin: V3.InputT;
  defaultMax: V3.InputT;
  onChange: (min: V3.InputT, max: V3.InputT) => void;
};

export type PaletteColorEditorOpt = {
  kind: "paletteColor";
  defaultIdx: number;
  onChange: (idx: number) => void;
};

export type ToogleEditorOpt = {
  kind: "toggle";
  default: boolean;
  onChange: (boolean: boolean) => void;
};

export type Editor =
  | MinMaxEditorOpt
  | MinMaxV3EditorOpt
  | MinMaxColorEditorOpt
  | ToogleEditorOpt
  | PaletteColorEditorOpt;

export interface HtmlBuilder {
  addInfoPanel(title: string): InfoPanel;
}

export interface InfoPanel {
  _panelDiv: HTMLDivElement;
  addEditor(editor: Editor): void;
}

export function createHtmlBuilder(): HtmlBuilder {
  const infoPanelsHolderEl_ = document.getElementById(
    "infoPanelsHolder"
  ) as HTMLDivElement | null;
  assert(infoPanelsHolderEl_, "no infoPanelsHolder detected");
  const infoPanelsHolderEl = infoPanelsHolderEl_;

  return {
    addInfoPanel,
  };

  function addInfoPanel(title: string): InfoPanel {
    const _panelDiv = mkEl("div", { class: "infoPanel" }, [
      mkEl("h2", {}, title),
    ]);
    infoPanelsHolderEl.appendChild(_panelDiv);

    return {
      _panelDiv,
      addEditor,
    };

    function addEditor(editor: Editor): void {
      if (editor.kind === "minMax") {
        const label = editor.label;
        const minSlider = mkEl("input", {
          type: "range",
          min: editor.min,
          max: editor.max,
          step: 0.1,
          value: editor.defaultMin,
        });
        const minValEl = mkEl("span", { class: "valLabel" });
        const maxSlider = mkEl("input", {
          type: "range",
          min: editor.min,
          max: editor.max,
          step: 0.1,
          value: editor.defaultMax,
        });
        const maxValEl = mkEl("span", { class: "valLabel" });
        const div = mkEl("div", { class: "inputGrid" }, [
          mkEl("label", {}, label),
          mkEl("div", { class: "slider" }, [
            minSlider,
            minValEl,
            mkEl("span", { class: "leftLabel" }, "min"),
          ]),
          mkEl("div", { class: "slider" }, [
            maxSlider,
            maxValEl,
            mkEl("span", { class: "rightLabel" }, "max"),
          ]),
        ]);
        const oninput = () => {
          const newMin = parseFloat(minSlider.value);
          const newMax = parseFloat(maxSlider.value);
          minValEl.textContent = newMin.toFixed(1);
          maxValEl.textContent = newMax.toFixed(1);
          editor.onChange(newMin, newMax);
        };
        minSlider.oninput = oninput;
        maxSlider.oninput = oninput;

        oninput();

        _panelDiv.appendChild(div);
      } else {
        throw `TODO: editor ${editor.kind}`;
      }
    }
  }
}

// TODO(@darzu): REFACTOR. use this everywhere
export function mkEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
  children?: HTMLElement[] | string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (let [key, val] of Object.entries(attributes))
    e.setAttribute(key, val.toString());
  if (children)
    if (typeof children === "string") e.textContent = children;
    else for (let c of children) e.appendChild(c);
  return e;
}

`
<div class="infoPanel paintingPanel">
      <h2>Painting</h2>

      <div class="inputGrid">
        <label>
          Pos
        </label>
        <div class="sliderV3">
          <input type="range" id="minSize0" min="0" max="5" step="0.1" />
          <input type="range" id="minSize1" min="0" max="5" step="0.1" />
          <input type="range" id="minSize2" min="0" max="5" step="0.1" />
          <span id="minSizeVal0" class="valLabel">?</span>
          <span id="minSizeVal1" class="valLabel">?</span>
          <span id="minSizeVal2" class="valLabel">?</span>
        </div>

        <div class="sliderV3">
          <input type="range" id="maxSize0" min="0" max="5" step="0.1" />
          <input type="range" id="maxSize1" min="0" max="5" step="0.1" />
          <input type="range" id="maxSize2" min="0" max="5" step="0.1" />
          <span id="maxSizeVal0" class="valLabel">?</span>
          <span id="maxSizeVal1" class="valLabel">?</span>
          <span id="maxSizeVal2" class="valLabel">?</span>
        </div>
      </div>

      <div class="inputGrid">
        <label>
          Color
        </label>
        <div class="colorPickerV2">
          <input type="color" />
          <input type="color" />
        </div>
      </div>

    </div>
    `;
