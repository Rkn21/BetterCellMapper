(function(){
  function addLocateLink() {
    document.querySelectorAll("table.modal_table").forEach((table) => {
      const rows = table.getElementsByTagName("tr");
      for (let row of rows) {
        const td0 = row.cells[0];
        if (td0 && td0.textContent.trim() === "Actions") {
          // Insert a new table row under 'Actions' with a link to show JSON data if not present in this table
          const hasLocate = Array.from(table.getElementsByTagName('tr'))
            .some(r => r.cells[0] && r.cells[0].textContent.trim() === 'Locate');
          if (!hasLocate) {
            const newRow = document.createElement("tr");
            const tdLabel = document.createElement("td");
            tdLabel.textContent = "Locate";
            const tdAction = document.createElement("td");
            const a = document.createElement("a");
            a.href = "#";
            a.className = "cellmapper-locate-link";
            a.textContent = "JS DATA";
            // Change click handler to request data on demand
            a.addEventListener("click", e => {
              e.preventDefault();
              browser.runtime.sendMessage({ action: "getTowerData" })
                .then(data => {
                  if (!data) return alert("No data available");
                  // Build payload for Google Geolocation API
                  const radioType = data.RAT.toLowerCase() === "umts" ? "wcdma" : data.RAT.toLowerCase();
                  let payload;
                  if (radioType === "nr") {
                    // 5G: radioType at root, towers without radioType
                    const towersNr = data.cells.map(id => {
                      const t = {
                        locationAreaCode: Number(data.regionID),
                        mobileCountryCode: Number(data.countryID),
                        mobileNetworkCode: Number(data.providerID)
                      };
                      t.newRadioCellId = Number(id);
                      return t;
                    });
                    payload = { radioType: "nr", considerIp: false, cellTowers: towersNr };
                  } else {
                    // 2G/3G/4G: each tower with radioType and cellId
                    const towers = data.cells.map(id => ({
                      radioType,
                      locationAreaCode: Number(data.regionID),
                      mobileCountryCode: Number(data.countryID),
                      mobileNetworkCode: Number(data.providerID),
                      cellId: Number(id)
                    }));
                    payload = { considerIp: false, cellTowers: towers };
                  }
                  // Retrieve API key and call Google Geolocation
                  browser.storage.local.get("apiKey").then(res => {
                    const key = res.apiKey;
                    if (!key) return alert("API key not set in options");
                    fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${key}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload)
                    })
                      .then(r => r.json())
                      .then(geo => {
                        if (!geo || !geo.location) return alert('No geolocation result from Google API, Request payload: ' + JSON.stringify(payload));
                        const lat = geo.location.lat;
                        const lng = geo.location.lng;
                        // Choose link based on countryID (MCC)
                        const mcc = data.countryID;
                        let url;
                        if (mcc === 208) {
                          // Cartoradio expects lon/lat
                          url = `https://www.cartoradio.fr/index.html#/cartographie/lonlat/${lng}/${lat}`;
                        } else {
                          // Google Maps query lat,lng
                          url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                        }
                        // Open in new tab
                        window.open(url, '_blank');
                      });
                  });
                });
            });
            // Wrap link in UL/LI to show bullet like other Actions
            const ul = document.createElement("ul");
            ul.style.margin = "0";
            const li = document.createElement("li");
            li.appendChild(a);
            ul.appendChild(li);
            tdAction.appendChild(ul);
            newRow.appendChild(tdLabel);
            newRow.appendChild(tdAction);
            row.parentNode.insertBefore(newRow, row.nextSibling);
          }
        }
      }
    });
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
