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

browser.webRequest.onBeforeRequest.addListener( listener, {urls: ["https://*/*","http://*/*"]}, ["blocking","requestBody"] );

// Reply to content scripts asking for tower data
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getTowerData") {
    sendResponse(lastExtracted);
    return true; // keep channel open for async response
  }
});