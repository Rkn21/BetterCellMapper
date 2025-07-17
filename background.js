let lastExtracted;
let lastTowersBounds;
let lastTowersResponse;

function listener(details)
{
  const del = ';';
  const url = new URL(details.url);  
  if (!url.pathname == 'api.cellmapper.net') return null;
  if (!url.pathname.startsWith("/v6/getTowerInformation")) return null;
  //console.log(details.url);
  
  let filter = browser.webRequest.filterResponseData(details.requestId);
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();  
  let allData = "";

  filter.ondata = event =>
  {	
    //console.log("Received data chunk");
    if (event.data.byteLength === 0) {
      let str = decoder.decode(event.data, {stream: true});
      allData += str;
      filter.write(encoder.encode(str));
    }
    else {
      let str = decoder.decode(event.data, {stream: false});
      allData += str;
      filter.write(encoder.encode(str));
    }
  };
  filter.onstop  = (event) =>
  {
    filter.close();
    try
    {
      var documentJson = JSON.parse(allData);
      const rd = documentJson.responseData;
      const extracted = {
        countryID: rd.Provider.countryID,
        providerID: rd.Provider.providerID,
        RAT: rd.RAT,
        siteID: rd.siteID,
        regionID: rd.regionID,
        cells: Object.keys(rd.cells)
      };
      //console.log('Extracted data:', extracted);
      // Save for content script requests
      lastExtracted = extracted;
    }
    catch (e) { console.log(e); }
  };

  return null;
}

function parseBounds(urlStr)
{
  const params = new URL(urlStr).searchParams;
  return {
    neLat: Number(params.get('boundsNELatitude')),
    neLon: Number(params.get('boundsNELongitude')),
    swLat: Number(params.get('boundsSWLatitude')),
    swLon: Number(params.get('boundsSWLongitude'))
  };
}

function movedSignificantly(prev, curr)
{
  if (!prev) return true;
  const prevArea = (prev.neLat - prev.swLat) * (prev.neLon - prev.swLon);
  const currArea = (curr.neLat - curr.swLat) * (curr.neLon - curr.swLon);
  const left = Math.max(prev.swLon, curr.swLon);
  const right = Math.min(prev.neLon, curr.neLon);
  const bottom = Math.max(prev.swLat, curr.swLat);
  const top = Math.min(prev.neLat, curr.neLat);
  if (left >= right || bottom >= top) return true;
  const inter = (right - left) * (top - bottom);
  const union = prevArea + currArea - inter;
  return inter / union < 0.2;
}

function towersListener(details)
{
  if (!details.url.includes('/v6/getTowers')) return null;
  const bounds = parseBounds(details.url);
  if (!movedSignificantly(lastTowersBounds, bounds) && lastTowersResponse)
  {
    const dataUrl = 'data:application/json;base64,' + btoa(lastTowersResponse);
    return { redirectUrl: dataUrl };
  }
  lastTowersBounds = bounds;

  let filter = browser.webRequest.filterResponseData(details.requestId);
  let decoder = new TextDecoder('utf-8');
  let encoder = new TextEncoder();
  let allData = '';
  filter.ondata = event =>
  {
    let str = decoder.decode(event.data, {stream: true});
    allData += str;
    filter.write(event.data);
  };
  filter.onstop = () =>
  {
    lastTowersResponse = allData;
    filter.close();
  };
  return null;
}

browser.webRequest.onBeforeRequest.addListener(
  listener,
  { urls: ["https://*/*", "http://*/*"] },
  ["blocking", "requestBody"]
);
browser.webRequest.onBeforeRequest.addListener(
  towersListener,
  { urls: [
      "https://api.cellmapper.net/v6/getTowers*",
      "http://api.cellmapper.net/v6/getTowers*"
    ] },
  ["blocking"]
);

// Reply to content scripts asking for tower data
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getTowerData") {
    sendResponse(lastExtracted);
    return true; // keep channel open for async response
  }
});