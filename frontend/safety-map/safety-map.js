const API_URL = "/api/incidents";

// Default map position: Dhaka
const map = L.map("map").setView([23.8103, 90.4125], 12);

// OpenStreetMap
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const incidentCount = document.getElementById("incidentCount");
const mapMessage = document.getElementById("mapMessage");

async function loadIncidents() {
    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error("Unable to load incidents.");
        }

        const data = await response.json();

        const incidents = data.incidents || [];

        incidentCount.textContent = `${incidents.length} incident(s)`;

        if (incidents.length === 0) {
            mapMessage.textContent = "No reported incidents found.";
            return;
        }

        let displayedCount = 0;

        for (const incident of incidents) {
            const coordinates = await getCoordinates(incident);

            if (!coordinates) {
                continue;
            }

            const marker = L.marker(coordinates).addTo(map);

            marker.bindPopup(`
                <div>
                    <h3>${escapeHTML(incident.title)}</h3>

                    <p>
                        <strong>Category:</strong>
                        ${escapeHTML(incident.category)}
                    </p>

                    <p>
                        <strong>Location:</strong>
                        ${escapeHTML(incident.location)}
                    </p>

                    <p>
                        ${escapeHTML(incident.description)}
                    </p>

                    <p>
                        <strong>Reported:</strong>
                        ${new Date(incident.createdAt).toLocaleString()}
                    </p>
                </div>
            `);

            displayedCount++;
        }

        mapMessage.textContent =
            `${displayedCount} incident(s) displayed on the map.`;

    } catch (error) {
        console.error(error);

        mapMessage.textContent =
            "Could not load the safety map.";
    }
}


// If latitude/longitude exist, use them.
// Otherwise convert the location text into coordinates.
async function getCoordinates(incident) {

    if (
        typeof incident.latitude === "number" &&
        typeof incident.longitude === "number"
    ) {
        return [
            incident.latitude,
            incident.longitude
        ];
    }

    if (
        typeof incident.lat === "number" &&
        typeof incident.lng === "number"
    ) {
        return [
            incident.lat,
            incident.lng
        ];
    }

    if (!incident.location) {
        return null;
    }

    try {

        const url =
            "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
            encodeURIComponent(incident.location);

        const response = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });

        const results = await response.json();

        if (!results.length) {
            return null;
        }

        return [
            Number(results[0].lat),
            Number(results[0].lon)
        ];

    } catch (error) {

        console.error(
            "Could not find location:",
            incident.location,
            error
        );

        return null;
    }
}


function escapeHTML(value) {

    if (value === undefined || value === null) {
        return "";
    }

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// Back button
document
    .getElementById("backButton")
    .addEventListener("click", () => {

        window.location.href = "/dashboard.html";

    });


loadIncidents();