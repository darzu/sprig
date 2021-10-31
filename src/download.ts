export function setupObjImportExporter() {
  function ondrag() {
    console.log("drag!");
    document.body.style.opacity = "0.5";
  }
  async function onfile(f: File) {
    console.log("drop!");
    document.body.style.opacity = "unset";

    const txt = await f.text();
    console.log(txt);
  }

  setDropHandlersOnElement(document.body, ondrag, onfile);
}

function setDropHandlersOnElement(
  el: HTMLElement,
  ondrag: () => void,
  onfile: (file: File) => Promise<void>
) {
  // ref: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
  setDropHandlersOnElementInternal(
    el,
    (ev: DragEvent) => {
      ev.preventDefault();
      ondrag();
    },
    async (ev: DragEvent) => {
      ev.preventDefault();
      if (!ev.dataTransfer) {
        console.error(`.dataTransfer isn't available on drag-n-drop!`);
        return;
      }

      if (ev.dataTransfer.items) {
        // Use DataTransferItemList interface to access the file(s)
        for (let i = 0; i < ev.dataTransfer.items.length; i++) {
          // If dropped items aren't files, reject them
          if (ev.dataTransfer.items[i].kind === "file") {
            let file = ev.dataTransfer.items[i].getAsFile();
            if (file) await onfile(file);
          }
        }
      } else {
        // Use DataTransfer interface to access the file(s)
        for (let i = 0; i < ev.dataTransfer.files.length; i++) {
          const file = ev.dataTransfer.files[i];
          if (file) await onfile(file);
        }
      }
    }
  );
}

function setDropHandlersOnElementInternal(
  el: HTMLElement,
  dragOverCb: (ev: DragEvent) => void,
  dropCb: (ev: DragEvent) => Promise<void>
) {
  if ((window as any).__sprigondrag) throw `We've already set drop handlers!`;

  (window as any).__sprigondrag = dragOverCb;
  (window as any).__sprigondrop = dropCb;

  el.setAttribute("ondrop", "window.__sprigondrop(event);");
  el.setAttribute("ondragover", "window.__sprigondrag(event);");
}
