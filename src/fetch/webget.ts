// TODO @darzu: use Fetch (https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
function getFileInternal(
  url: string,
  respType: XMLHttpRequestResponseType | undefined,
  callback: (status: number | null, r: XMLHttpRequest) => void
) {
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
      let resp = respType === "document" ? result.responseXML : result.response;
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
export function getBytes(url: string): Promise<ArrayBuffer> {
  return getFile(url, "arraybuffer");
}
export function getXml(url: string): Promise<HTMLElement> {
  return getFile(url, "document").then(
    (xmlResp: Document) => xmlResp.documentElement
  );
}
