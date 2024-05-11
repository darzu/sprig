export function range(length: number): number[] {
  return ((new Array(length) as any).fill(null) as number[]).map((_, i) => i);
}

export function edges<T>(ts: T[]): [T | null, T | null][] {
  return range(ts.length + 1).map((i) => [ts[i - 1] || null, ts[i] || null]);
}

export function zip<T, U>(ts: T[], us: U[]): [T, U][] {
  return ts.map((t, i) => <[T, U]>[t, us[i]]);
}

export function never(x: never): never {
  throw new Error("Unexpected object: " + x);
}

export function asMap<T>(
  ts: T[],
  key: (t: T) => string
): { [name: string]: T } {
  return ts.reduce((p, n) => {
    p[key(n)] = n;
    return p;
  }, {} as { [name: string]: T });
}

export function mapObj<V, U>(
  o: { [key: number]: V },
  fn: (v: V) => U
): { [key: number]: U };
export function mapObj<V, U>(
  o: { [key: string]: V },
  fn: (v: V) => U
): { [key: string]: U } {
  const n: any = {};
  Object.keys(o).forEach((k) => {
    n[k] = fn(o[k]);
  });
  return n;
}

export function values<V>(o: { [key: number]: V }): V[];
export function values<V>(o: { [key: string]: V }): V[] {
  return Object.keys(o).map((k) => o[k]);
}

export namespace ajax {
  function getFileInternal(
    url: string,
    respType: XMLHttpRequestResponseType | undefined,
    callback: (status: number | null, r: XMLHttpRequest) => void
  ) {
    // TODO @darzu: use Fetch (https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    if (respType) xhr.responseType = respType;
    xhr.onload = function () {
      var status = xhr.status;
      if (status === 200) {
        callback(null, xhr);
      } else {
        callback(status, xhr);
      }
    };
    xhr.send();
  }
  function getFile(
    url: string,
    respType?: XMLHttpRequestResponseType
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      getFileInternal(url, respType, (status, result: XMLHttpRequest) => {
        let resp =
          respType === "document" ? result.responseXML : result.response;
        if (!status || status === 200) {
          resolve(resp);
        } else {
          reject(status);
        }
      });
    });
  }
  export function getJson(url: string): Promise<any> {
    return getFile(url, "json");
  }
  export function getText(url: string): Promise<string> {
    return getFile(url, "text");
  }
  export function getXml(url: string): Promise<HTMLElement> {
    return getFile(url, "document").then(
      (xmlResp: Document) => xmlResp.documentElement
    );
  }
}

// TODO: probably not performant
export function setStyle(e: Element, style: any) {
  let styleStr = JSON.stringify(style)
    .replace(/[\"{}]/g, ``)
    .replace(/\,/g, ";\n");
  e.setAttribute("style", styleStr);
}
