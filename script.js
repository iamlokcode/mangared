const API_BASE = "https://api.mangadex.org";
const PROXY = "https://corsproxy.io/?";
let currentMangaId = ""; 
let mangaChapters = [];

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => { 
    fetchMangas(); 
    loadHistory(); 
});

// --- REGISTRO DO SERVICE WORKER (PARA INSTALAR NO ANDROID) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('MANGARED: App pronto para uso offline!'))
            .catch(err => console.log('Erro ao carregar motor do App', err));
    });
}

// --- LÓGICA DE CAPAS ---
function getCoverUrl(manga) {
    const coverRel = manga.relationships.find(r => r.type === 'cover_art');
    if (!coverRel || !coverRel.attributes) return "https://via.placeholder.com/256x384?text=Sem+Capa";
    const fileName = coverRel.attributes.fileName;
    return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`;
}

async function fetchMangas() {
    try {
        const url = `${API_BASE}/manga?limit=24&includes[]=cover_art&order[followedCount]=desc&contentRating[]=safe`;
        const res = await fetch(`${PROXY}${encodeURIComponent(url)}`);
        const data = await res.json();
        renderMangas(data.data);
    } catch (e) { console.error("Erro na API"); }
}

function renderMangas(list) {
    const grid = document.getElementById('mangaGrid');
    if(!grid) return;
    grid.innerHTML = list.map(m => {
        const cover = getCoverUrl(m);
        const title = m.attributes.title.en || Object.values(m.attributes.title)[0];
        return `
            <div class="manga-card" onclick="showChapterList('${m.id}', '${title.replace(/'/g, "\\'")}', '${cover}')">
                <img src="${cover}" referrerpolicy="no-referrer">
                <p>${title.substring(0,25)}...</p>
            </div>`;
    }).join('');
}

// --- BUSCA ---
async function executeSearch() {
    const query = document.getElementById('searchInput').value;
    if (!query) return;
    document.getElementById('heroBanner').style.display = 'none';
    const url = `${API_BASE}/manga?title=${query}&limit=20&includes[]=cover_art`;
    const res = await fetch(`${PROXY}${encodeURIComponent(url)}`);
    const data = await res.json();
    renderMangas(data.data);
}

// --- LISTA DE CAPÍTULOS ---
async function showChapterList(id, title, cover) {
    currentMangaId = id;
    document.getElementById('homeView').style.display = 'none';
    const view = document.getElementById('chapterView');
    view.style.display = 'block';
    window.scrollTo(0,0);
    view.innerHTML = `
        <button onclick="window.location.reload()" class="btn-back">← Voltar</button>
        <div style="display:flex; gap:20px; margin-top:20px; flex-wrap:wrap;">
            <img src="${cover}" id="currCover" style="width:180px; border-radius:8px;" referrerpolicy="no-referrer">
            <div style="flex:1; min-width:250px;">
                <h1 id="currTitle">${title}</h1>
                <div id="chaptersGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(75px,1fr)); gap:8px; margin-top:20px;"></div>
            </div>
        </div>`;

    const res = await fetch(`${PROXY}${encodeURIComponent(API_BASE + '/manga/' + id + '/feed?translatedLanguage[]=pt-br&order[chapter]=asc&limit=500')}`);
    const data = await res.json();
    mangaChapters = data.data.filter((v,i,a)=>a.findIndex(t=>(t.attributes.chapter === v.attributes.chapter))===i);
    
    document.getElementById('chaptersGrid').innerHTML = mangaChapters.slice().reverse().map(c => `
        <div style="background:#111; padding:10px; text-align:center; cursor:pointer; border-radius:4px; font-weight:bold; border:1px solid #222;" 
             onclick="openReader('${c.id}', '${c.attributes.chapter}')">
            ${c.attributes.chapter || "Extra"}
        </div>`).join('');
}

// --- LEITOR COM ANÚNCIOS ---
async function openReader(chapterId, num) {
    saveToHistory(currentMangaId, document.getElementById('currTitle').innerText, document.getElementById('currCover').src, num);
    document.getElementById('chapterView').style.display = 'none';
    document.getElementById('readerView').style.display = 'block';
    document.getElementById('chapterTitle').innerText = "Capítulo " + num;
    window.scrollTo(0,0);

    const res = await fetch(`${PROXY}${encodeURIComponent(API_BASE + '/at-home/server/' + chapterId)}`);
    const srv = await res.json();
    
    const pagesHtml = srv.chapter.data.map((f, i) => {
        let img = `<img src="${srv.baseUrl}/data/${srv.chapter.hash}/${f}" referrerpolicy="no-referrer">`;
        // Espaço para anúncio no meio da leitura (página 3)
        if (i === 2) img += `<div class="ad-slot"><div class="ad-box">ANÚNCIO DISPONÍVEL</div></div>`;
        return img;
    }).join('');

    const idx = mangaChapters.findIndex(c => c.id === chapterId);
    const prev = mangaChapters[idx - 1], next = mangaChapters[idx + 1];

    const nav = `
        <div class="ad-slot"><div class="ad-box">ANÚNCIO FINAL</div></div>
        <div style="display:flex; justify-content:center; gap:15px; padding:30px 0;">
            ${prev ? `<button class="btn-red" onclick="openReader('${prev.id}', '${prev.attributes.chapter}')">← ANTERIOR</button>` : ''}
            ${next ? `<button class="btn-red" onclick="openReader('${next.id}', '${next.attributes.chapter}')">PRÓXIMO →</button>` : ''}
        </div>`;

    document.getElementById('pagesContainer').innerHTML = pagesHtml + nav;
}

// --- SISTEMA DE HISTÓRICO ---
function saveToHistory(mangaId, title, cover, chapterNum) {
    let history = JSON.parse(localStorage.getItem('mangaHistory')) || [];
    history = history.filter(item => item.id !== mangaId);
    history.unshift({ id: mangaId, title: title, cover: cover, chapter: chapterNum });
    if (history.length > 4) history.pop();
    localStorage.setItem('mangaHistory', JSON.stringify(history));
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('mangaHistory')) || [];
    const section = document.getElementById('continueReadingSection');
    const grid = document.getElementById('continueGrid');
    if (!section || !grid) return;

    if (history.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    grid.innerHTML = history.map(m => `
        <div class="manga-card" onclick="showChapterList('${m.id}', '${m.title.replace(/'/g, "\\'")}', '${m.cover}')">
            <div class="history-badge" style="position:absolute; top:8px; right:8px; background:rgba(255,0,0,0.9); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; z-index:10;">
                Cap. ${m.chapter}
            </div>
            <img src="${m.cover}" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/256x384?text=Erro+na+Capa'">
            <p>${m.title.substring(0,20)}...</p>
        </div>`).join('');
}

function backToChapters() { 
    document.getElementById('readerView').style.display = 'none'; 
    document.getElementById('chapterView').style.display = 'block'; 
}

function clearHistory() { 
    localStorage.removeItem('mangaHistory'); 
    location.reload(); 
}