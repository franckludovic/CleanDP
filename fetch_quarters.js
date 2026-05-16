const quarters = [
  'Mboppi', 'Nkongmondo', 'Ngodi', 'Kassalafam', 'Nkololoun', 'Brazzaville', 
  'Madagascar', 'Nylon', 'Tergal', 'Bilongue', 'Ndogsimbi', 'Logpom', 'Lendi', 
  'Malangue', 'Denver', 'Santa Barbara', 'Bonateki', 'Bonatone', 'Bessengue', 
  'Makea', 'Mabanda', 'Ndobo', 'Bonassama', 'Sodiko', 'Mambanda', 'Logbaba', 
  'Yassa', 'Japoma', 'Bali', 'Bwang-Bakoko', 'PK10', 'PK11', 'PK12', 'PK13'
];
const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchAll() {
  const result = {};
  for (let q of quarters) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}, Douala, Cameroon`, {
        headers: {'User-Agent': 'Antigravity/1.0'}
      });
      const data = await res.json();
      if(data && data.length > 0) {
        result[q] = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch(e) { }
    await delay(1200); // Respect Nominatim rate limits (1 req/s)
  }
  console.log(JSON.stringify(result, null, 2));
}

fetchAll();
