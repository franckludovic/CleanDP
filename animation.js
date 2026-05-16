const BASE_COORDS = [4.029941, 9.747009];
const animatedTrucks = {}; // Store animated markers: id -> { marker, targetMarker }

const QUARTIERS_DATA = {
    "Akwa": { lat: 4.0433, lng: 9.7022 },
    "Bali": { lat: 4.0399, lng: 9.6930 },
    "Bassa": { lat: 4.0333, lng: 9.7500 },
    "Beedi": { lat: 4.0667, lng: 9.7833 },
    "Bépanda": { lat: 4.0500, lng: 9.7167 },
    "Bessengue": { lat: 4.0292, lng: 9.7966 },
    "Bilongue": { lat: 4.0150, lng: 9.7394 },
    "Bonabéri": { lat: 4.0667, lng: 9.6500 },
    "Bonamoussadi": { lat: 4.0833, lng: 9.7333 },
    "Bonanjo": { lat: 4.0416, lng: 9.6953 },
    "Bonapriso": { lat: 4.0322, lng: 9.7061 },
    "Bonassama": { lat: 4.0822, lng: 9.6649 },
    "Bonateki": { lat: 4.0703, lng: 9.7175 },
    "Bonatone": { lat: 4.0613, lng: 9.7079 },
    "Brazzaville": { lat: 4.0233, lng: 9.7292 },
    "Cité des Palmiers": { lat: 4.0583, lng: 9.7667 },
    "Deido": { lat: 4.0583, lng: 9.7094 },
    "Denver": { lat: 4.0915, lng: 9.7323 },
    "Japoma": { lat: 4.0323, lng: 9.8226 },
    "Kassalafam": { lat: 4.0339, lng: 9.7128 },
    "Kotto": { lat: 4.0758, lng: 9.7575 },
    "Lendi": { lat: 4.1247, lng: 9.7753 },
    "Logbaba": { lat: 4.0328, lng: 9.7603 },
    "Logbessou": { lat: 4.0833, lng: 9.7750 },
    "Logpom": { lat: 4.0769, lng: 9.7711 },
    "Mabanda": { lat: 4.0706, lng: 9.6573 },
    "Madagascar": { lat: 4.0336, lng: 9.7360 },
    "Makepé": { lat: 4.0667, lng: 9.7417 },
    "Malangue": { lat: 4.0684, lng: 9.7613 },
    "Mambanda": { lat: 4.0627, lng: 9.6592 },
    "Mboppi": { lat: 4.0442, lng: 9.7172 },
    "Ndobo": { lat: 4.1018, lng: 9.6360 },
    "Ndogbong": { lat: 4.0500, lng: 9.7500 },
    "Ndogpassi": { lat: 4.0167, lng: 9.7667 },
    "Ndogsimbi": { lat: 4.0404, lng: 9.7311 },
    "Ndokoti": { lat: 4.0417, lng: 9.7417 },
    "New Bell": { lat: 4.0253, lng: 9.7194 },
    "Ngodi": { lat: 3.9852, lng: 9.7888 },
    "Nkololoun": { lat: 4.0334, lng: 9.7195 },
    "Nkongmondo": { lat: 4.0350, lng: 9.6996 },
    "Nyalla": { lat: 4.0167, lng: 9.7833 },
    "Nylon": { lat: 4.0282, lng: 9.7307 },
    "PK10": { lat: 4.0491, lng: 9.7727 },
    "PK11": { lat: 4.0510, lng: 9.7767 },
    "PK12": { lat: 4.0429, lng: 9.7062 },
    "PK13": { lat: 4.0429, lng: 9.7062 },
    "PK14": { lat: 4.0833, lng: 9.8000 },
    "PK8": { lat: 4.0667, lng: 9.7667 },
    "Santa Barbara": { lat: 4.0843, lng: 9.7410 },
    "Sodiko": { lat: 4.0977, lng: 9.6623 },
    "Yassa": { lat: 3.9913, lng: 9.8103 }
};
const QUARTIERS_LIST = Object.keys(QUARTIERS_DATA).sort();

function startAnimationLoop(mapInstance, onFinishReturn) {
    function animate() {
        const now = Date.now();
        Object.keys(animatedTrucks).forEach(id => {
            const truck = animatedTrucks[id];
            if (!truck.active) return;

            const elapsed = now - truck.startTime;
            let progress = elapsed / truck.duration;
            if (progress > 1) progress = 1;

            let currentLat, currentLng;
            let remainingPath = [];

            if (truck.routeCoords && truck.routeCoords.length > 1) {
                // Interpolate along actual road route
                const point = getPointAlongRoute(truck.routeCoords, mapInstance, progress);
                currentLat = point[0];
                currentLng = point[1];
                remainingPath = getRemainingRouteCoords(truck.routeCoords, mapInstance, progress);
            } else {
                // Fallback straight line interpolation
                currentLat = truck.startPos[0] + (truck.endPos[0] - truck.startPos[0]) * progress;
                currentLng = truck.startPos[1] + (truck.endPos[1] - truck.startPos[1]) * progress;
                remainingPath = [[currentLat, currentLng], truck.endPos];
            }
            
            truck.marker.setLatLng([currentLat, currentLng]);

            // Update path line
            if (truck.pathLine) {
                truck.pathLine.setLatLngs(remainingPath);
            }

            // Distance calculation
            const remainingDist = mapInstance.distance([currentLat, currentLng], truck.endPos);
            // If using route, we could use actual remaining route dist, but direct is fine for alert.
            const isArriving = remainingDist < 100;
            const el = truck.marker.getElement();
            if (el) {
                const bubble = el.querySelector('.marker-bubble-small');
                if (bubble) {
                    if (isArriving) bubble.classList.add('truck-arriving');
                    else bubble.classList.remove('truck-arriving');
                }
            }

            // Update Popup telemetry
            if (truck.marker.isPopupOpen()) {
                const targetTime = new Date(truck.startTime + truck.duration);
                const timeStr = targetTime.getHours().toString().padStart(2, '0') + ':' + targetTime.getMinutes().toString().padStart(2, '0');
                
                const isArrived = progress >= 1;
                const statusText = isArrived ? "Arrivé à destination" : (truck.status === 'dispatched' ? 'En route vers ' + (truck.quartier || 'Zone Personnalisée') : 'En route vers la base');
                
                truck.marker.getPopup().setContent(`
                    <b>Camion Hysacam</b><br>
                    ${statusText}<br>
                    <hr style="margin:4px 0; border:0; border-top:1px solid #ddd;">
                    <b>Distance:</b> ${Math.round(remainingDist)}m / ${Math.round(truck.totalDist)}m<br>
                    ${!isArrived ? `<b>Arrivée prévue:</b> ${timeStr}` : '<b>Prêt pour collecte</b>'}
                `);
            }

            // Finish return
            if (progress >= 1 && truck.status === 'returning' && !truck.finished) {
                truck.finished = true;
                mapInstance.removeLayer(truck.marker);
                if (truck.pathLine) mapInstance.removeLayer(truck.pathLine);
                if (onFinishReturn) onFinishReturn(id);
                delete animatedTrucks[id];
            }
        });
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

function updateAnimatedTrucks(mapInstance, reports, isPopulationView = false) {
    const activeIds = new Set(reports.map(r => r.id));

    // Cleanup missing
    Object.keys(animatedTrucks).forEach(id => {
        if (!activeIds.has(Number(id))) {
            if (animatedTrucks[id].marker) mapInstance.removeLayer(animatedTrucks[id].marker);
            if (animatedTrucks[id].targetMarker) mapInstance.removeLayer(animatedTrucks[id].targetMarker);
            if (animatedTrucks[id].pathLine) mapInstance.removeLayer(animatedTrucks[id].pathLine);
            delete animatedTrucks[id];
        }
    });

    reports.forEach(r => {
        const isDispatched = r.status === 'dispatched';
        const isReturning = r.status === 'returning';
        
        if (!isDispatched && !isReturning) return; // Pending is handled separately

        const startPos = isDispatched ? BASE_COORDS : [r.lat, r.lng];
        const endPos = isDispatched ? [r.lat, r.lng] : BASE_COORDS;
        const startTimeStr = isDispatched ? r.dispatch_start : r.return_start;
        const startTime = startTimeStr ? new Date(startTimeStr).getTime() : Date.now();
        
        let duration = 10 * 60 * 1000; // Default 10 min
        if (r.time) {
            const [hours, mins] = r.time.split(':').map(Number);
            const target = new Date(startTime);
            target.setHours(hours, mins, 0, 0);
            if (target.getTime() < startTime) {
                target.setDate(target.getDate() + 1);
            }
            duration = target.getTime() - startTime;
        } else if (r.dispatch_eta) {
            duration = r.dispatch_eta * 60 * 1000;
        }
        if (duration < 60000) duration = 60000; // minimum 1 min

        if (!animatedTrucks[r.id]) {
            // Create target marker
            let targetMarker = null;
            if (isDispatched) {
                targetMarker = L.marker([r.lat, r.lng], {
                    icon: L.divIcon({
                        className: 'hysacam-target',
                        html: '<div class="marker-bubble" style="border-color:#28a745; background:#e8f5e9;"><span class="marker-emoji">📍</span></div>',
                        iconSize: [44, 44],
                        iconAnchor: [22, 44]
                    })
                }).addTo(mapInstance);
                
                // Keep the popup info
                let popupContent = `<b>Planning Hysacam</b><br>Collecte: ${r.quartier}<br>Arrivée prévue: ${r.time}`;
                targetMarker.bindPopup(popupContent);
            }

            // Create moving truck marker
            const truckMarker = L.marker(startPos, {
                icon: L.divIcon({
                    className: 'truck-marker',
                    html: '<div class="marker-bubble-small"><span class="marker-emoji">🚛</span></div>',
                    iconSize: [36, 36],
                    iconAnchor: [18, 36],
                    popupAnchor: [0, -36]
                }),
                zIndexOffset: 1000 // Keep truck on top
            }).addTo(mapInstance);

            // Create path line
            const pathLine = L.polyline([startPos, endPos], {
                color: '#28a745',
                weight: 4,
                dashArray: '10, 10',
                opacity: 0.8,
                className: 'animated-path'
            }).addTo(mapInstance);

            const targetTime = new Date(startTime + duration);
            const timeStr = targetTime.getHours().toString().padStart(2, '0') + ':' + targetTime.getMinutes().toString().padStart(2, '0');
            const totalDist = mapInstance.distance(startPos, endPos);

            const truckPopup = `
                <b>Camion Hysacam</b><br>
                En route ${isDispatched ? 'vers ' + (r.quartier || 'Zone Personnalisée') : 'vers la base'}<br>
                <hr style="margin:4px 0; border:0; border-top:1px solid #ddd;">
                <b>Distance:</b> ${Math.round(totalDist)}m / ${Math.round(totalDist)}m<br>
                <b>Arrivée prévue:</b> ${timeStr}
            `;
            truckMarker.bindPopup(truckPopup);

            animatedTrucks[r.id] = {
                marker: truckMarker,
                targetMarker: targetMarker,
                pathLine: pathLine,
                startPos,
                endPos,
                startTime,
                duration,
                totalDist, // initial guess
                status: r.status,
                quartier: r.quartier,
                active: true,
                finished: false,
                routeCoords: null // Will be populated async
            };

            // Fetch actual road route
            fetchRoute(startPos, endPos).then(coords => {
                if (animatedTrucks[r.id] && coords) {
                    animatedTrucks[r.id].routeCoords = coords;
                    
                    // Update total distance to match route
                    let routeDist = 0;
                    for (let i = 0; i < coords.length - 1; i++) {
                        routeDist += mapInstance.distance(coords[i], coords[i+1]);
                    }
                    animatedTrucks[r.id].totalDist = routeDist;
                    
                    // Instantly update the path to the real road
                    animatedTrucks[r.id].pathLine.setLatLngs(coords);
                }
            });

        } else {
            // Update state if changed
            const truck = animatedTrucks[r.id];
            if (truck.status !== r.status) {
                truck.status = r.status;
                truck.startPos = startPos;
                truck.endPos = endPos;
                truck.startTime = startTime;
                truck.duration = duration;
                truck.finished = false;
                truck.totalDist = mapInstance.distance(startPos, endPos);
                truck.routeCoords = null; // reset route
                
                if (truck.pathLine) {
                    truck.pathLine.setLatLngs([startPos, endPos]);
                }

                if (isReturning && truck.targetMarker) {
                    mapInstance.removeLayer(truck.targetMarker);
                    truck.targetMarker = null;
                }

                // Fetch new route for return
                fetchRoute(startPos, endPos).then(coords => {
                    if (animatedTrucks[r.id] && coords) {
                        animatedTrucks[r.id].routeCoords = coords;
                        let routeDist = 0;
                        for (let i = 0; i < coords.length - 1; i++) {
                            routeDist += mapInstance.distance(coords[i], coords[i+1]);
                        }
                        animatedTrucks[r.id].totalDist = routeDist;
                    }
                });
            }
        }
    });
}

// --- OSRM Routing Helpers ---

async function fetchRoute(startPos, endPos) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startPos[1]},${startPos[0]};${endPos[1]},${endPos[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
            return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); // GeoJSON is [lng, lat]
        }
    } catch (e) {
        console.error("OSRM Routing error:", e);
    }
    return [startPos, endPos]; // Fallback straight line
}

function getPointAlongRoute(coords, mapInstance, progress) {
    if (!coords || coords.length === 0) return null;
    if (coords.length === 1) return coords[0];
    if (progress >= 1) return coords[coords.length - 1];

    let totalDist = 0;
    const segments = [];
    for (let i = 0; i < coords.length - 1; i++) {
        const d = mapInstance.distance(coords[i], coords[i+1]);
        segments.push(d);
        totalDist += d;
    }

    const targetDist = totalDist * progress;
    let currDist = 0;
    
    for (let i = 0; i < coords.length - 1; i++) {
        const d = segments[i];
        if (currDist + d >= targetDist) {
            const segProgress = d === 0 ? 0 : (targetDist - currDist) / d;
            const p1 = coords[i];
            const p2 = coords[i+1];
            return [
                p1[0] + (p2[0] - p1[0]) * segProgress,
                p1[1] + (p2[1] - p1[1]) * segProgress
            ];
        }
        currDist += d;
    }
    return coords[coords.length - 1];
}

function getRemainingRouteCoords(coords, mapInstance, progress) {
    if (!coords || coords.length === 0) return [];
    if (progress >= 1) return [coords[coords.length - 1]];

    let totalDist = 0;
    const segments = []; 
    for (let i = 0; i < coords.length - 1; i++) {
        const d = mapInstance.distance(coords[i], coords[i+1]);
        segments.push(d);
        totalDist += d;
    }

    const targetDist = totalDist * progress;
    let currDist = 0;
    
    for (let i = 0; i < coords.length - 1; i++) {
        const d = segments[i];
        if (currDist + d >= targetDist) {
            const segProgress = d === 0 ? 0 : (targetDist - currDist) / d;
            const p1 = coords[i];
            const p2 = coords[i+1];
            const currentPos = [
                p1[0] + (p2[0] - p1[0]) * segProgress,
                p1[1] + (p2[1] - p1[1]) * segProgress
            ];
            return [currentPos, ...coords.slice(i+1)];
        }
        currDist += d;
    }
    return [coords[coords.length - 1]];
}
