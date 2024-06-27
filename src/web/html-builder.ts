import { FRGBfromV3, parseHex, toFRGB, toHex, toV3 } from "../color/color.js";
import {
  Endesga16Name,
  ENDESGA16,
  AllEndesga16Names,
} from "../color/palettes.js";
import { V3 } from "../matrix/sprig-matrix.js";
import { assert } from "../utils/util-no-import.js";
import { isString } from "../utils/util.js";

// TODO(@darzu): experimenting w/ html template abstractions

// TODO(@darzu): use WebComponents ?
//  https://github.com/mdn/web-components-examples/blob/main/edit-word/index.html

export type MinMaxEditorOpt = {
  // kind: "minMax";
  label: string;
  min: number;
  max: number;
  defaultMin: number;
  defaultMax: number;
  step: number;
  onChange: (min: number, max: number) => void;
};
export type MinMaxEditor = void;

export type NumberEditorOpt = {
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  onChange: (val: number) => void;
};
export type NumberEditor = void;

export type MinMaxV3EditorOpt = {
  // kind: "minMaxV3";
  label: string;
  min: V3.InputT;
  max: V3.InputT;
  defaultMin: V3.InputT;
  defaultMax: V3.InputT;
  step: number;
  onChange: (min: V3.InputT, max: V3.InputT) => void;
};
export type MinMaxV3Editor = void;

export type MinMaxColorEditorOpt = {
  // kind: "minMaxColor";
  label: string;
  defaultMin: V3.InputT;
  defaultMax: V3.InputT;
  onChange: (min: V3.InputT, max: V3.InputT) => void;
};
export type MinMaxColorEditor = void;

export type PaletteColorEditorOpt = {
  // kind: "paletteColor";
  defaultIdx: number;
  onChange: (idx: number) => void;
  onClick: (idx: number) => void;
};

export type PaletteColorEditor = {
  isEnabled: () => boolean;
  doEnable: (enable: boolean) => void;
};

export type ToggleEditorOpt = {
  label: string;
  default: boolean;
  onChange: (boolean: boolean) => void;
};
export type ToggleEditor = {
  doEnable: (enable: boolean) => void;
};

export type Editor =
  | MinMaxEditorOpt
  | MinMaxV3EditorOpt
  | MinMaxColorEditorOpt
  | ToggleEditorOpt
  | PaletteColorEditorOpt;

export interface HtmlBuilder {
  addInfoPanel(title: string): InfoPanel;
}

export interface InfoPanel {
  _panelDiv: HTMLDivElement;
  addText(txt: string): void;
  addHTML(html: string): void; // TODO(@darzu): remove all uses, move into other editors
  addMinMaxEditor(e: MinMaxEditorOpt): MinMaxEditor;
  addNumberEditor(e: NumberEditorOpt): NumberEditor;
  addMinMaxV3Editor(e: MinMaxV3EditorOpt): MinMaxV3Editor;
  addMinMaxColorEditor(e: MinMaxColorEditorOpt): MinMaxColorEditor;
  addToggleEditor(e: ToggleEditorOpt): ToggleEditor;
  addPaletteColorEditor(e: PaletteColorEditorOpt): PaletteColorEditor;
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
      addText,
      addHTML,
      addMinMaxColorEditor,
      addMinMaxV3Editor,
      addMinMaxEditor,
      addNumberEditor,
      addPaletteColorEditor,
      addToggleEditor,
    };

    function addText(txt: string): void {
      _panelDiv.insertAdjacentText("beforeend", txt);
    }

    function addHTML(html: string): void {
      _panelDiv.insertAdjacentHTML("beforeend", html);
    }

    function addMinMaxEditor(editor: MinMaxEditorOpt): void {
      const label = editor.label;
      const minSlider = mkEl("input", {
        type: "range",
        min: editor.min,
        max: editor.max,
        step: editor.step,
        value: editor.defaultMin,
      });
      const maxSlider = mkEl("input", {
        type: "range",
        min: editor.min,
        max: editor.max,
        step: editor.step,
        value: editor.defaultMax,
      });

      const minValEl = mkEl("span", { class: "valLabel" });
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

      const fractDigits = fractionDigitsFromStepSize(editor.step);
      const oninput = () => {
        const newMin = parseFloat(minSlider.value);
        const newMax = parseFloat(maxSlider.value);
        minValEl.textContent = newMin.toFixed(fractDigits);
        maxValEl.textContent = newMax.toFixed(fractDigits);
        editor.onChange(newMin, newMax);
      };
      oninput();

      minSlider.oninput = oninput;
      maxSlider.oninput = oninput;

      _panelDiv.appendChild(div);
    }

    function addNumberEditor(editor: NumberEditorOpt): NumberEditor {
      const label = editor.label;
      const slider = mkEl("input", {
        type: "range",
        min: editor.min,
        max: editor.max,
        step: editor.step,
        value: editor.default,
      });

      const valEl = mkEl("span", { class: "valLabel" });

      const div = mkEl("div", { class: "inputGrid" }, [
        mkEl("label", {}, label),
        mkEl("div", { class: "slider" }, [slider, valEl]),
      ]);

      const fractDigits = fractionDigitsFromStepSize(editor.step);
      const oninput = () => {
        const newVal = parseFloat(slider.value);
        valEl.textContent = newVal.toFixed(fractDigits);
        editor.onChange(newVal);
      };
      oninput();

      slider.oninput = oninput;

      _panelDiv.appendChild(div);
    }

    function addMinMaxV3Editor(editor: MinMaxV3EditorOpt): void {
      const label = editor.label;

      const min0 = mkEl("input", {type: "range", min: editor.min[0], max: editor.max[0], step: editor.step, value: editor.defaultMin[0] }); // prettier-ignore
      const min1 = mkEl("input", {type: "range", min: editor.min[1], max: editor.max[1], step: editor.step, value: editor.defaultMin[1] }); // prettier-ignore
      const min2 = mkEl("input", {type: "range", min: editor.min[2], max: editor.max[2], step: editor.step, value: editor.defaultMin[2] }); // prettier-ignore

      const max0 = mkEl("input", {type: "range", min: editor.min[0], max: editor.max[0], step: editor.step, value: editor.defaultMax[0] }); // prettier-ignore
      const max1 = mkEl("input", {type: "range", min: editor.min[1], max: editor.max[1], step: editor.step, value: editor.defaultMax[1] }); // prettier-ignore
      const max2 = mkEl("input", {type: "range", min: editor.min[2], max: editor.max[2], step: editor.step, value: editor.defaultMax[2] }); // prettier-ignore

      const min0Lbl = mkEl("span", { class: "valLabel" });
      const min1Lbl = mkEl("span", { class: "valLabel" });
      const min2Lbl = mkEl("span", { class: "valLabel" });
      const max0Lbl = mkEl("span", { class: "valLabel" });
      const max1Lbl = mkEl("span", { class: "valLabel" });
      const max2Lbl = mkEl("span", { class: "valLabel" });

      const fractDigits = fractionDigitsFromStepSize(editor.step);
      const oninput = () => {
        const newMin: V3.InputT = [
          parseFloat(min0.value),
          parseFloat(min1.value),
          parseFloat(min2.value),
        ];
        const newMax: V3.InputT = [
          parseFloat(max0.value),
          parseFloat(max1.value),
          parseFloat(max2.value),
        ];
        min0Lbl.textContent = newMin[0].toFixed(fractDigits);
        min1Lbl.textContent = newMin[1].toFixed(fractDigits);
        min2Lbl.textContent = newMin[2].toFixed(fractDigits);
        max0Lbl.textContent = newMax[0].toFixed(fractDigits);
        max1Lbl.textContent = newMax[1].toFixed(fractDigits);
        max2Lbl.textContent = newMax[2].toFixed(fractDigits);
        editor.onChange(newMin, newMax);
      };

      oninput();

      min0.oninput = min1.oninput = min2.oninput = oninput;
      max0.oninput = max1.oninput = max2.oninput = oninput;

      const div = mkEl("div", { class: "inputGrid" }, [
        mkEl("label", {}, label),
        mkEl("div", { class: "sliderV3" }, [
          min0,
          min1,
          min2,
          min0Lbl,
          min1Lbl,
          min2Lbl,
        ]),
        mkEl("div", { class: "sliderV3" }, [
          max0,
          max1,
          max2,
          max0Lbl,
          max1Lbl,
          max2Lbl,
        ]),
      ]);

      _panelDiv.appendChild(div);
    }

    function addMinMaxColorEditor(editor: MinMaxColorEditorOpt): void {
      const color0 = mkEl("input", {
        type: "color",
        value: toHex(FRGBfromV3(editor.defaultMin)),
      });
      const color1 = mkEl("input", {
        type: "color",
        value: toHex(FRGBfromV3(editor.defaultMax)),
      });
      const div = mkEl("div", { class: "inputGrid" }, [
        mkEl("label", {}, editor.label),
        mkEl("div", { class: "colorPickerV2" }, [color0, color1]),
      ]);

      const oninput = () => {
        const c0 = toV3(toFRGB(parseHex(color0.value)));
        const c1 = toV3(toFRGB(parseHex(color1.value)));
        editor.onChange(c0, c1);
      };

      oninput();

      color0.oninput = oninput;
      color1.oninput = oninput;

      _panelDiv.appendChild(div);
    }

    function addToggleEditor(e: ToggleEditorOpt): ToggleEditor {
      const checked = e.default ? "checked" : "";
      const toggle = mkEl("input", {
        type: "checkbox",
        ...(checked ? { checked } : {}),
      });
      const lbl = mkEl("label", { class: "switch" }, [toggle, e.label]);

      lbl.onchange = () => {
        e.onChange(toggle.checked);
      };

      _panelDiv.appendChild(lbl);

      return {
        doEnable,
      };

      function doEnable(enable: boolean) {
        toggle.checked = enable;
      }
    }

    function addPaletteColorEditor(
      editor: PaletteColorEditorOpt
    ): PaletteColorEditor {
      const swatches = AllEndesga16Names.map((name, i) => {
        const checked = i === editor.defaultIdx ? "checked" : "";
        const el = mkEl("input", {
          type: "radio",
          class: name,
          ...(checked ? { checked } : {}),
        });
        el.onchange = () => {
          swatches.forEach((el2, i2) => {
            el2.checked = i2 === i;
          });
          editor.onChange(i);
        };
        el.onclick = () => {
          editor.onClick(i);
        };
        return el;
      });

      const div = mkEl("div", { class: "paintColorPicker" }, swatches);

      _panelDiv.appendChild(div);

      return {
        doEnable,
        isEnabled,
      };

      function isEnabled(): boolean {
        return !swatches[0].classList.contains("disabled");
      }

      function doEnable(enable: boolean) {
        if (enable) swatches.forEach((el) => el.classList.remove("disabled"));
        else swatches.forEach((el) => el.classList.add("disabled"));
      }
    }
  }
}

function fractionDigitsFromStepSize(step: number): number {
  return step >= 1 ? 0 : Math.ceil(Math.log10(1 / step));
}

// TODO(@darzu): REFACTOR. use this everywhere
export function mkEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
  children?: (HTMLElement | string)[] | string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (let [key, val] of Object.entries(attributes))
    e.setAttribute(key, val.toString());
  if (children)
    if (isString(children)) e.textContent = children;
    else
      for (let c of children) {
        if (isString(c)) e.insertAdjacentText("beforeend", c);
        else e.appendChild(c);
      }
  return e;
}
