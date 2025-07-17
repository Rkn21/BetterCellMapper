let lastExtracted;
let lastTowerRequest = null;
let lastTowerResponse = null;
let towerStats = { total: 0, avoided: 0 };

browser.storage.local.get('towerStats').then(res => {
  if (res.towerStats) towerStats = res.towerStats;
});

function saveStats() {
  browser.storage.local.set({ towerStats });
}

function resetCache() {
  lastTowerRequest = null;
  lastTowerResponse = null;
}

function listener(details) {
  const del = ';';
  const url = new URL(details.url);
  if (url.hostname !== 'api.cellmapper.net') return null;
  if (!url.pathname.startsWith('/v6/getTowerInformation')) return null;
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

browser.webRequest.onBeforeRequest.addListener( listener, {urls: ["https://*/*","http://*/*"]}, ["blocking","requestBody"] );

// Reply to content scripts asking for tower data
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getTowerData") {
    sendResponse(lastExtracted);
    return true; // keep channel open for async response
  }
});

function computeArea(b) {
  return Math.abs((b.neLat - b.swLat) * (b.neLon - b.swLon));
}

function intersectionArea(a, b) {
  const neLat = Math.min(a.neLat, b.neLat);
  const neLon = Math.min(a.neLon, b.neLon);
  const swLat = Math.max(a.swLat, b.swLat);
  const swLon = Math.max(a.swLon, b.swLon);
  if (neLat <= swLat || neLon <= swLon) return 0;
  return (neLat - swLat) * (neLon - swLon);
}

function movedSignificantly(newReq, lastReq) {
  if (!lastReq) return true;
  const areaLast = computeArea(lastReq.bounds);
  const inter = intersectionArea(newReq.bounds, lastReq.bounds);
  const coverage = inter / areaLast;
  if (coverage < 0.2) return true;
  const areaNew = computeArea(newReq.bounds);
  const zoomChange = Math.abs(areaNew - areaLast) / areaLast;
  return zoomChange > 1;
}

function onGetTowers(details) {
  const url = new URL(details.url);
  if (url.hostname !== 'api.cellmapper.net' || !url.pathname.startsWith('/v6/getTowers')) {
    return;
  }

  towerStats.total += 1;

  const req = {
    bounds: {
      neLat: parseFloat(url.searchParams.get('boundsNELatitude')),
      neLon: parseFloat(url.searchParams.get('boundsNELongitude')),
      swLat: parseFloat(url.searchParams.get('boundsSWLatitude')),
      swLon: parseFloat(url.searchParams.get('boundsSWLongitude'))
    },
    MCC: url.searchParams.get('MCC'),
    MNC: url.searchParams.get('MNC'),
    RAT: url.searchParams.get('RAT')
  };

  if (
    lastTowerRequest &&
    lastTowerResponse &&
    req.MCC === lastTowerRequest.MCC &&
    req.MNC === lastTowerRequest.MNC &&
    req.RAT === lastTowerRequest.RAT &&
    !movedSignificantly(req, lastTowerRequest)
  ) {
    towerStats.avoided += 1;
    saveStats();
    const dataUrl = 'data:application/json,' + encodeURIComponent(lastTowerResponse);
    return { redirectUrl: dataUrl };
  }

  lastTowerRequest = req;
  saveStats();

  let filter = browser.webRequest.filterResponseData(details.requestId);
  let decoder = new TextDecoder('utf-8');
  let allData = '';

  filter.ondata = event => {
    allData += decoder.decode(event.data, {stream: true});
    filter.write(event.data);
  };

  filter.onstop = () => {
    filter.close();
    lastTowerResponse = allData;
    saveStats();
  };

  return {};
}

browser.webRequest.onBeforeRequest.addListener(
  onGetTowers,
  { urls: ['https://api.cellmapper.net/v6/getTowers*'] },
  ['blocking']
);

browser.webRequest.onBeforeRequest.addListener(
  resetCache,
  { urls: ['https://www.cellmapper.net/*'], types: ['main_frame'] }
);

browser.tabs.onRemoved.addListener(resetCache);