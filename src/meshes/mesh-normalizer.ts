import { exportObj, importObj, isParseError } from "./import_obj.js";
import { exportSprigMesh } from "./import_sprigmesh.js";

export function setupObjImportExporter() {
  function ondrag() {
    // console.log("drag!");
    document.body.style.opacity = "0.5";
  }
  async function onfile(f: File) {
    // console.log("drop!");
    document.body.style.opacity = "unset";

    if (!f.name.endsWith(".obj")) {
      console.warn(`only .obj file imports are supported right now`);
      // TODO(@darzu): implement?
      return;
    }

    // load the file
    const txt = await f.text();

    // import the mesh(es)
    const meshesOpt = importObj(txt);
    if (isParseError(meshesOpt)) {
      console.error(`Failed to import .obj mesh file because:\n${meshesOpt}`);
      return;
    }

    let allMeshStrs: string[] = [];
    let idxOffset = 0;
    for (let i = 0; i < meshesOpt.length; i++) {
      const opt = meshesOpt[i];
      // make any changes we want for perf or size
      // TODO(@darzu): do we want to unshare here? makes file a little bigger
      // const mesh = unshareProvokingVertices(meshOpt);
      const mesh = opt;

      // let dataView = new DataView(buf);
      // dataView.setFloat32(
      // btoa
      // atob

      // export it again
      if (mesh.pos.length) {
        let meshExpStr = exportObj(mesh, idxOffset);
        if (allMeshStrs.length > 0)
          // append object name
          meshExpStr = `o obj${i}\n${meshExpStr}`;
        allMeshStrs.push(meshExpStr);
        idxOffset += mesh.pos.length;
      }
      // TODO(@darzu): sprigland custom mesh format doesn't seem worth it yet
      // const meshExp = exportSprigMesh(mesh);
      // const meshExpStr = JSON.stringify(meshExp);
    }
    const res = allMeshStrs.join("\n");

    // download it
    const newName = f.name.replace(".obj", ".sprig.obj");
    triggerDownload(newName, res);
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

export function triggerDownload(filename: string, body: string) {
  const fakeBtn = document.createElement("a");
  fakeBtn.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(body)
  );
  fakeBtn.setAttribute("download", filename);
  document.body.appendChild(fakeBtn);
  fakeBtn.click();
  setTimeout(() => {
    // TODO(@darzu): throws error?
    document.removeChild(fakeBtn);
  }, 500);
}
