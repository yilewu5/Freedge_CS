// ====== 初始化 Firebase ======
const firebaseConfig = {
    apiKey: "AIzaSyDCnxi5yYqPMSnEojPfnXgqBE2_Oi-X1OY",
    authDomain: "freedge-yzu.firebaseapp.com",
    databaseURL: "https://freedge-yzu-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "freedge-yzu",
    appId: "1:577649251490:web:9fb4af3ee7c4d9d06f33fb"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

// ====== Leaflet 地圖 ======
let map = L.map('mapid').setView([25.0330, 121.5654], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
let markers = {}; 

// ====== DOM 元素 ======
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const welcomeSection = document.getElementById("welcome");
const uploadSection = document.getElementById("upload");
const welcomeText = document.getElementById("welcomeText");
const foodForm = document.getElementById("foodForm");
const foodListDiv = document.getElementById("foodList");
const useMyLocationBtn = document.getElementById("useMyLocationBtn");
const foodLocationInput = document.getElementById("foodLocation");
const foodImageInput = document.getElementById("foodImage");

let tempLat = null;
let tempLon = null;

// ====== Auth ======
registerBtn.addEventListener("click", async () => {
    try { await auth.createUserWithEmailAndPassword(emailInput.value, passwordInput.value); alert("Signed up successfully!"); }
    catch (e) { alert("Failed to sign up: " + e.message); }
});

loginBtn.addEventListener("click", async () => {
    try { await auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value); }
    catch (e) { alert("Failed to log in: " + e.message); }
});

logoutBtn.addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(user => {
    if (user) {
        welcomeSection.style.display = "block";
        uploadSection.style.display = "block";
        welcomeText.textContent = `Welcome! ${user.email}`;
        loadFoods();
    } else {
        welcomeSection.style.display = "none";
        uploadSection.style.display = "none";
        foodListDiv.innerHTML = "";
        clearAllMarkers();
    }
});

// ====== 使用者 GPS ======
useMyLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) return alert("Your browser does not support location services.");
    useMyLocationBtn.disabled = true;
    useMyLocationBtn.textContent = "Getting location...";
    navigator.geolocation.getCurrentPosition(pos => {
        tempLat = pos.coords.latitude;
        tempLon = pos.coords.longitude;
        useMyLocationBtn.textContent = "Location obtained";
        useMyLocationBtn.disabled = false;
        foodLocationInput.value = `My location (lat:${tempLat.toFixed(5)}, lon:${tempLon.toFixed(5)})`;
        map.setView([tempLat, tempLon], 15);
    }, err => {
        alert("Failed to get location: " + (err.message || err.code));
        useMyLocationBtn.disabled = false;
        useMyLocationBtn.textContent = "Use my location";
    }, { enableHighAccuracy: true, timeout: 10000 });
});

// ====== 上傳表單 ======
foodForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("Please log in first.");

    const name = document.getElementById("foodName").value.trim();
    const locationText = foodLocationInput.value.trim();
    const file = foodImageInput.files[0];

    if (!name || !file || (!locationText && tempLat === null)) return alert("Please fill in all fields and upload an image");

    const reader = new FileReader();
    reader.onload = async function(event) {
        const base64Image = event.target.result;

        let lat = tempLat ?? 0;
        let lon = tempLon ?? 0;

        const newRef = db.ref("foods").push();
        await newRef.set({
            name,
            locationText,
            lat,
            lon,
            imageUrl: base64Image,
            ownerUid: user.uid,
            ownerEmail: user.email || null,
            claimedBy: null,
            claimedAt: null,
            createdAt: Date.now()
        });

        tempLat = null;
        tempLon = null;
        useMyLocationBtn.textContent = "Use my location";
        foodForm.reset();
        alert("Posted successfully!");
    };
    reader.readAsDataURL(file);
});

// ====== 讀取資料 ======
function loadFoods() {
    const foodsRef = db.ref("foods");
    foodsRef.off();
    foodsRef.on("value", snapshot => {
        const data = snapshot.val() || {};
        renderFoodList(data);
        renderMapMarkers(data);
    });
}

// ====== 清地圖 ======
function clearAllMarkers() {
    for (const k in markers) { try { map.removeLayer(markers[k]); } catch(e) {} }
    markers = {};
}

// ====== marker 與 popup ======
function renderMapMarkers(data) {
    clearAllMarkers();
    for (const id in data) {
        const f = data[id];
        const lat = parseFloat(f.lat);
        const lon = parseFloat(f.lon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

        const iconUrl = f.claimedBy ? "https://i.imgur.com/1FH0pPh.png" : "https://i.imgur.com/Hu1QG5H.png";
        const marker = L.marker([lat, lon], { icon: L.icon({iconUrl, iconSize:[36,36]}) }).addTo(map);

        let popupHtml = `<div style="min-width:180px">
            <b>${escapeHtml(f.name)}</b><br>
            <img src="${f.imageUrl}" width="160" style="display:block;margin:6px 0;"><br>
            <small>Posted by: ${escapeHtml(f.ownerEmail || "Anonymous")}</small><br>
            ${f.claimedBy ? `<small>Already claimed by ${escapeHtml(f.claimedBy)} (${f.claimedAt ? new Date(f.claimedAt).toLocaleString() : ""})</small><br>` : ""}
            <div style="margin-top:6px;">`;

        const currentUser = auth.currentUser;
        if (!f.claimedBy && currentUser && f.ownerUid !== currentUser.uid) popupHtml += `<button id="claim_${id}">I want it</button> `;
        if (f.claimedBy && currentUser && f.claimedBy === (currentUser.email || currentUser.uid)) popupHtml += `<button id="confirm_${id}">Got it</button> `;
        if (currentUser && f.ownerUid === currentUser.uid) popupHtml += `<button id="remove_${id}">Withdraw food</button>`;
        popupHtml += `</div></div>`;

        marker.bindPopup(popupHtml);
        marker.on('popupopen', () => {
            const claimBtn = document.getElementById(`claim_${id}`);
            if (claimBtn) claimBtn.onclick = async () => { await claimFoodTransaction(id); marker.closePopup(); };
            const confirmBtn = document.getElementById(`confirm_${id}`);
            if (confirmBtn) confirmBtn.onclick = async () => { await confirmFood(id); marker.closePopup(); };
            const removeBtn = document.getElementById(`remove_${id}`);
            if (removeBtn) removeBtn.onclick = async () => { if(confirm("Do you really want to withdraw this post?")) await removeFood(id); marker.closePopup(); };
        });
        markers[id] = marker;
    }
}

// ====== 列表顯示 ======
function renderFoodList(data) {
    foodListDiv.innerHTML = "";
    const user = auth.currentUser;
    Object.entries(data).forEach(([id,f]) => {
        const div = document.createElement("div");
        div.className = "foodItem";
        div.style.border = "1px solid #ddd";
        div.style.padding = "8px";
        div.style.margin = "8px 0";
        div.innerHTML = `
            <h4>${escapeHtml(f.name)}</h4>
            <div>Location: ${escapeHtml(f.locationText)}</div>
            <div><img src="${f.imageUrl}" style="max-width:160px;"></div>
            <div>Posted by: ${escapeHtml(f.ownerEmail || "Anonymous")}</div>
            ${f.claimedBy ? `<div>Already claimed by ${escapeHtml(f.claimedBy)} (${f.claimedAt ? new Date(f.claimedAt).toLocaleString() : ""})</div>` : ""}
        `;
        const btnDiv = document.createElement("div");
        btnDiv.style.marginTop="6px";
        if (!f.claimedBy && user && f.ownerUid !== user.uid) {
            const b = document.createElement("button"); b.textContent="I want it"; b.onclick=async()=>{await claimFoodTransaction(id);}; btnDiv.appendChild(b);
        }
        if (f.claimedBy && user && f.claimedBy === (user.email || user.uid)) {
            const b = document.createElement("button"); b.textContent="Got it"; b.onclick=async()=>{await confirmFood(id);}; btnDiv.appendChild(b);
        }
        if (user && f.ownerUid === user.uid) {
            const b = document.createElement("button"); b.textContent="Withdraw post"; b.onclick=async()=>{if(confirm("Do you really want to withdraw this post?")) await removeFood(id);}; btnDiv.appendChild(b);
        }
        div.appendChild(btnDiv);
        foodListDiv.appendChild(div);
    });
}

// ====== 交易與刪除 ======
async function claimFoodTransaction(id) {
    const user = auth.currentUser; if(!user) throw new Error("Please log in first.");
    const ref = db.ref(`foods/${id}`);
    await ref.transaction(current => {
        if(current && !current.claimedBy){current.claimedBy=user.email||user.uid;current.claimedAt=Date.now(); return current;}
    });
}
async function confirmFood(id){ await db.ref(`foods/${id}`).remove(); }
async function removeFood(id){ await db.ref(`foods/${id}`).remove(); }

// ====== 防 XSS ======
<<<<<<< HEAD
function escapeHtml(str){ if(!str && str!==0)return ""; return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
=======
function escapeHtml(str){ if(!str && str!==0)return ""; return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
>>>>>>> 138ef557e404ebb3b74f143e17e97daed70c4398
