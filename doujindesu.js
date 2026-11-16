// ID: ext_doujindesu
// NAME: Doujindesu (ID)
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #1b1b1b
// ICON: https://www.google.com/s2/favicons?domain=doujin.desu.xxx&sz=64
// REFERER: https://doujin.desu.xxx/

/**
 * Doujindesu Extension for KonMik
 * Source: https://doujin.desu.xxx
 * API:    https://doujin.desu.xxx/api
 */

var KonmikExtension = (function () {
    const BASE = 'https://doujin.desu.xxx';
    const API = 'https://doujin.desu.xxx/api';
    const APP_SECRET = 'dfdf72051dbfdc7d76889ebd31324e74';
    const SALT = 'doujindesu-scrapers-cannot-read-this-super-secret-salt-2026-v2';
    const HOUR_MS = 3600000;
    const LIMIT = 24;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer': 'https://doujin.desu.xxx/',
        'x-app-secret': APP_SECRET,
        'Accept': 'application/json, */*'
    };

    // ─── Decryptor (from Doujindesu index.js / Tachiyomi) ───────────────────────

    function toSigned32(x) {
        let y = BigInt(x) & 0xFFFFFFFFn;
        if (y >= 0x80000000n) y -= 0x100000000n;
        return Number(y);
    }

    function wH(e) {
        const t = SALT + '_' + e;
        let a = 0;
        for (let i = 0; i < t.length; i++) {
            a = (a << 5) - a + t.charCodeAt(i);
            a = toSigned32(a);
        }
        let l = a !== 0 ? BigInt(Math.abs(a)) : 123456789n;
        let res = '';
        for (let i = 0; i < 32; i++) {
            l = (l * 1664525n + 1013904223n) % 4294967296n;
            res += String.fromCharCode(33 + Number(l % 93n));
        }
        return res;
    }

    function lU() {
        const now = Date.now();
        const t = Math.floor(now / HOUR_MS);
        return [wH(t), wH(t - 1), wH(t + 1)];
    }

    function yre(encryptedHex, key) {
        const bytes = [];
        for (let i = 0; i < encryptedHex.length; i += 2) {
            bytes.push(parseInt(encryptedHex.substr(i, 2), 16));
        }
        let d = 42;
        const keyLen = key.length;
        let res = '';
        for (let idx = 0; idx < bytes.length; idx++) {
            const byteVal = bytes[idx];
            const keyChar = key.charCodeAt(idx % keyLen);
            const k = byteVal ^ keyChar ^ (idx * 13) ^ d;
            res += String.fromCharCode(k & 0xFF);
            d = (d + byteVal) % 256;
        }
        return res;
    }

    function decrypt(encryptedHex) {
        for (const key of lU()) {
            try {
                const decoded = yre(encryptedHex, key);
                return decodeURIComponent(decoded);
            } catch (e) {
                // Try next candidate key
            }
        }
        return null;
    }

    // ─── Network & Helpers ───────────────────────────────────────────────────────

    async function fetchJson(url) {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data._enc_resp_) {
            const decrypted = decrypt(data._enc_resp_);
            if (!decrypted) throw new Error('Gagal mendekripsi respon API Doujindesu');
            return JSON.parse(decrypted);
        }
        return data;
    }

    function cleanSynopsis(raw) {
        if (!raw) return 'Tidak ada sinopsis.';
        return raw
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .trim();
    }

    // ─── KonMik Extension Methods ───────────────────────────────────────────────

    async function getList(page, query, filters) {
        const p = page > 0 ? page : 1;
        const offset = (p - 1) * LIMIT;
        const sort = (filters && filters.sort === 'popular') ? 'rating' : 'latest_chapter';

        let url = `${API}/manga?limit=${LIMIT}&offset=${offset}&sort=${sort}`;
        if (query && query.trim()) {
            url += `&search=${encodeURIComponent(query.trim())}`;
        }

        const items = await fetchJson(url);
        if (!Array.isArray(items)) return { manga_list: [] };

        const mangaList = items.map(item => {
            let cover = item.cover_url || '';
            if (cover.startsWith('/')) cover = BASE + cover;

            let latestChapter = '';
            if (item.chapters && item.chapters.length > 0) {
                const ch = item.chapters[0];
                latestChapter = ch.chapter_number != null ? `Ch. ${ch.chapter_number}` : 'Ch. 1';
            }

            return {
                id: item.slug || item.id,
                title: (item.title || '').trim(),
                cover_url: cover,
                latest_chapter: latestChapter,
                rating: item.rating ? String(item.rating) : '-',
                views: item.views ? String(item.views) : '-'
            };
        });

        return { manga_list: mangaList };
    }

    async function getDetail(slugOrUrl) {
        let slug = slugOrUrl;
        if (slug.includes('/')) {
            const segments = slug.split('/').filter(Boolean);
            slug = segments[segments.length - 1];
        }

        const url = `${API}/manga/${encodeURIComponent(slug)}`;
        const manga = await fetchJson(url);
        if (!manga) throw new Error('Data komik tidak ditemukan');

        let cover = manga.cover_url || '';
        if (cover.startsWith('/')) cover = BASE + cover;

        // Parse genres from term_list (format: Name:type:id|Name:type:id)
        const genres = [];
        if (manga.term_list) {
            const terms = manga.term_list.split('|');
            for (const t of terms) {
                const parts = t.split(':');
                if (parts.length >= 2 && parts[1] === 'genre') {
                    genres.push(parts[0].trim());
                }
            }
        }

        // Chapters parsing
        const rawChapters = manga.chapters || [];
        const chapters = rawChapters.map(ch => {
            let dateStr = '-';
            if (ch.created_at) {
                try {
                    const d = new Date(ch.created_at);
                    if (!isNaN(d.getTime())) {
                        dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                    }
                } catch (e) {}
            }

            const chNum = ch.chapter_number != null ? String(ch.chapter_number) : '';
            return {
                id: ch.id,
                title: ch.title ? ch.title.trim() : (chNum ? `Chapter ${chNum}` : 'Chapter'),
                endpoint: ch.id,
                date: dateStr,
                _num: ch.chapter_number != null ? parseFloat(ch.chapter_number) : 0
            };
        });

        // Urutkan chapter terbaru di paling atas
        chapters.sort((a, b) => b._num - a._num);
        chapters.forEach(c => { delete c._num; });

        return {
            title: (manga.title || 'Unknown Title').trim(),
            cover_url: cover,
            description: cleanSynopsis(manga.description),
            author: manga.author || 'Doujindesu Creator',
            artist: manga.author || 'Doujindesu Creator',
            rating: manga.rating ? String(manga.rating) : '-',
            views: manga.views ? String(manga.views) : '-',
            genres: genres.length > 0 ? genres : ['Doujin'],
            chapters: chapters
        };
    }

    async function getChapterImages(endpoint) {
        let chapterId = endpoint;
        if (chapterId.includes('/')) {
            const segments = chapterId.split('/').filter(Boolean);
            chapterId = segments[segments.length - 1];
        }

        const url = `${API}/chapters/${encodeURIComponent(chapterId)}`;
        const chapData = await fetchJson(url);
        if (!chapData || !chapData.content_urls) {
            throw new Error('Gagal memuat gambar halaman chapter Doujindesu');
        }

        return chapData.content_urls;
    }

    return {
        getList: getList,
        getDetail: getDetail,
        getChapterImages: getChapterImages
    };
})();
