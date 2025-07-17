(function(){
  function addLocateLink() {
    const firstTable = document.querySelector("table.modal_table");
    if (!firstTable) return;

    const rows = firstTable.getElementsByTagName("tr");
    for (let row of rows) {
      const td0 = row.cells[0];
      if (td0 && td0.textContent.trim() === "Actions") {
        // Insert a new table row under 'Actions' with a link to show JSON data if not present in this table
        // Check if this table already has our locate row by label
        const hasLocate = Array.from(firstTable.querySelectorAll('tr'))
          .some(r => r.cells[0] && r.cells[0].textContent.trim() === 'Locate with Google API');
        if (!hasLocate) {
          const newRow = document.createElement("tr");
          const tdLabel = document.createElement("td");
          tdLabel.textContent = "Locate with Google API";
          const tdAction = document.createElement("td");
          const ul = document.createElement("ul");
          ul.style.margin = "0";
          tdAction.appendChild(ul);

          browser.runtime.sendMessage({ action: "getTowerData" })
            .then(data => {
              if (!data) return;
              const radioType = data.RAT.toLowerCase() === "umts" ? "wcdma" : data.RAT.toLowerCase();

              let cachedLocation = null;

              function fetchLocation() {
                if (cachedLocation) return Promise.resolve(cachedLocation);
                let payload;
                if (radioType === "nr") {
                  const towersNr = data.cells.map(id => ({
                    locationAreaCode: Number(data.regionID),
                    mobileCountryCode: Number(data.countryID),
                    mobileNetworkCode: Number(data.providerID),
                    newRadioCellId: Number(id)
                  }));
                  payload = { radioType: "nr", considerIp: false, cellTowers: towersNr };
                } else {
                  const towers = data.cells.map(id => ({
                    radioType,
                    locationAreaCode: Number(data.regionID),
                    mobileCountryCode: Number(data.countryID),
                    mobileNetworkCode: Number(data.providerID),
                    cellId: Number(id)
                  }));
                  payload = { considerIp: false, cellTowers: towers };
                }

                return browser.storage.local.get("apiKey").then(res => {
                  const key = res.apiKey;
                  if (!key) return null;
                  return fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${key}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  })
                    .then(r => r.json())
                    .then(geo => {
                      if (!geo || !geo.location) return null;
                      cachedLocation = geo.location;
                      return cachedLocation;
                    });
                });
              }

              function handleClick(openFn) {
                return e => {
                  e.preventDefault();
                fetchLocation().then(loc => {
                    if (loc) {
                        openFn(loc.lat, loc.lng);
                    } else {
                        showNoResultModal();
                    }
                });
                };
              }

              function openCartoradio(lat, lng) {
                const url = `https://www.cartoradio.fr/index.html#/cartographie/lonlat/${lng}/${lat}`;
                window.open(url, '_blank');
              }

              function openCouvertureMobile(lat, lng) {
                const latInt = Math.round(lat * 100000);
                const lngInt = Math.round(lng * 100000);
                const provider = data.providerID;
                const mncMap = {1:'Oo',20:'Ob',15:'Of',10:'Os'};
                let operatorParams = '';
                Object.entries(mncMap).forEach(([mnc,param]) => {
                  if (Number(mnc)!==provider) operatorParams += `&${param}=0`;
                });
                const techMap = {gsm:'T2G',wcdma:'T3G',lte:'T4G',nr:'T5G'};
                let techParams = Object.values(techMap).map(p=>`&${p}=0`).join('');
                const currentTech = techMap[radioType]||'';
                if (currentTech) techParams = techParams.replace(`&${currentTech}=0`,'');
                const couvUrl = `https://www.couverture-mobile.fr/#lat=${latInt}&lng=${lngInt}&z=17${techParams}&actives=1${operatorParams}`;
                window.open(couvUrl,'_blank');
              }

              function openGoogle(lat, lng) {
                const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                window.open(url, '_blank');
              }

              if (data.countryID === 208) {
                const li1 = document.createElement("li");
                const a1 = document.createElement("a");
                a1.className = 'cellmapper-locate-link';
                a1.href = '#';
                a1.textContent = "Cartoradio";
                a1.addEventListener('click', handleClick(openCartoradio));
                li1.appendChild(a1);
                ul.appendChild(li1);

                const li2 = document.createElement("li");
                const a2 = document.createElement("a");
                a2.className = 'cellmapper-locate-link';
                a2.href = '#';
                a2.textContent = "CouvertureMobile";
                a2.addEventListener('click', handleClick(openCouvertureMobile));
                li2.appendChild(a2);
                ul.appendChild(li2);
              } else {
                const li = document.createElement("li");
                const a = document.createElement("a");
                a.className = 'cellmapper-locate-link';
                a.href = '#';
                a.textContent = "Google Maps";
                a.addEventListener('click', handleClick(openGoogle));
                li.appendChild(a);
                ul.appendChild(li);
              }
            });

          // Append the generated list to tdAction
          tdAction.appendChild(ul);
          // Build and insert row
          newRow.appendChild(tdLabel);
          newRow.appendChild(tdAction);
          row.parentNode.insertBefore(newRow, row.nextSibling);
        }
      }
    }
  }

  /**
   * Display a modal informing the user that no results were returned from Google API.
   */
  function showNoResultModal() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:white;padding:20px;border-radius:5px;max-width:400px;text-align:center;';
    const message = document.createElement('p');
    message.textContent = "No location found via Google API.";
    const btn = document.createElement('button');
    btn.textContent = 'Close';
    btn.style.marginTop = '10px';
    btn.addEventListener('click', () => document.body.removeChild(modal));
    dialog.appendChild(message);
    dialog.appendChild(btn);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
  }
  document.addEventListener("click", () => {
    setTimeout(addLocateLink, 500);
  });

  // Observe dynamic additions of modal tables and re-add Locate row
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          if (node.matches && node.matches('table.modal_table')) addLocateLink();
          else if (node.querySelector && node.querySelector('table.modal_table')) addLocateLink();
        }
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
