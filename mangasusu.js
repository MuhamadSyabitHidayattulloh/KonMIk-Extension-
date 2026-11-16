// ID: ext_mangasusu
// NAME: Mangasusu (ID)
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #6c5ce7
// ICON: https://www.google.com/s2/favicons?domain=mangasusuku.com&sz=64
// REFERER: https://mangasusuku.com/

/**
 * Mangasusu Extension for KonMik
 * Source: https://mangasusuku.com
 * Theme:  MangaThemesia
 */

var KonmikExtension = (function () {
    const BASE = 'https://mangasusuku.com';
    const MANGA_DIR = '/komik';

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer': 'https://mangasusuku.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    };

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    async function fetchHtml(url) {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    }

    function decodeHtmlEntities(str) {
        if (!str) return '';
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#8217;/g, "'")
            .replace(/&#8216;/g, "'")
            .replace(/&#8220;/g, '"')
            .replace(/&#8221;/g, '"')
            .replace(/&#8211;/g, '-')
            .replace(/&#8212;/g, '--')
            .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(n); })
            .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
    }

    function extractMatch(regex, str, defaultVal = '') {
        const m = str.match(regex);
        return m ? m[1].trim() : defaultVal;
    }

    function base64Decode(str) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        str = String(str).replace(/=+$/, '');
        for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
            buffer = chars.indexOf(buffer);
        }
        return output;
    }

    // ─── KonMik Extension Methods ───────────────────────────────────────────────

    async function getList(page, query, filters) {
        const p = page > 0 ? page : 1;
        let url;

        if (query && query.trim()) {
            url = `${BASE}${MANGA_DIR}/?title=${encodeURIComponent(query.trim())}&page=${p}`;
        } else {
            const sort = (filters && filters.sort === 'popular') ? 'popular' : 'update';
            url = `${BASE}${MANGA_DIR}/?order=${sort}&page=${p}`;
        }

        const html = await fetchHtml(url);
        const cardRegex = /<div[^>]*class="[^"]*bsx[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
        const mangaList = [];
        const seen = new Set();
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            const cardHtml = match[1];

            const uMatch = cardHtml.match(/<a[^>]*href="([^"]+)"/i);
            const tMatch = cardHtml.match(/<a[^>]*title="([^"]+)"/i);
            if (!uMatch) continue;

            let itemUrl = uMatch[1].trim();
            if (itemUrl.startsWith('/')) itemUrl = BASE + itemUrl;

            if (seen.has(itemUrl)) continue;
            seen.add(itemUrl);

            const title = tMatch ? tMatch[1].trim() : extractMatch(/<div[^>]*class="tt"[^>]*>([\s\S]*?)<\/div>/i, cardHtml);

            let cover = '';
            const imgTag = cardHtml.match(/<img[^>]+>/i);
            if (imgTag) {
                const srcMatch = imgTag[0].match(/(?:data-lazy-src|data-src|data-cfsrc|src)="([^"]+)"/i);
                if (srcMatch) cover = srcMatch[1].trim();
            }
            if (cover.startsWith('/')) cover = BASE + cover;

            const epMatch = cardHtml.match(/<(?:div|span)[^>]*class="(?:epxs|chapternum)"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);
            const latestChapter = epMatch ? decodeHtmlEntities(epMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

            const rateMatch = cardHtml.match(/<div[^>]*class="numscore"[^>]*>([\s\S]*?)<\/div>/i);
            const rating = rateMatch ? rateMatch[1].trim() : '-';

            mangaList.push({
                id: itemUrl,
                title: decodeHtmlEntities(title).trim(),
                cover_url: cover,
                latest_chapter: latestChapter,
                rating: rating,
                views: '-'
            });
        }

        return { manga_list: mangaList };
    }

    async function getDetail(slugOrUrl) {
        let url = slugOrUrl;
        if (!url.startsWith('http')) {
            const cleanSlug = slugOrUrl.replace(/^\/+|\/+$/g, '');
            url = `${BASE}${MANGA_DIR}/${cleanSlug}/`;
        }

        const html = await fetchHtml(url);

        let title = extractMatch(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i, html, 'Unknown Title');
        title = decodeHtmlEntities(title.replace(/<[^>]+>/g, '').trim());

        let cover = extractMatch(/<div[^>]*class="thumb"[^>]*>[\s\S]*?<img[^>]*(?:data-lazy-src|data-src|data-cfsrc|src)="([^"]+)"/i, html);
        if (!cover) {
            cover = extractMatch(/property="og:image"[\s\S]*?content="([^"]+)"/i, html)
                 || extractMatch(/content="([^"]+)"[\s\S]*?property="og:image"/i, html);
        }
        if (cover.startsWith('/')) cover = BASE + cover;

        let desc = extractMatch(/<div[^>]*class="(?:entry-content|desc)"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i, html);
        if (!desc) {
            desc = extractMatch(/<div[^>]*class="(?:entry-content|desc)"[^>]*>([\s\S]*?)<\/div>/i, html);
        }
        desc = desc ? desc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : 'Tidak ada deskripsi.';
        desc = decodeHtmlEntities(desc);

        const rating = extractMatch(/<div[^>]*class="numscore"[^>]*>([\s\S]*?)<\/div>/i, html, '-');

        let author = extractMatch(/Author\s*<\/[^>]+>[\s\S]*?<i>([^<]+)<\/i>/i, html)
                  || extractMatch(/<b>Author<\/b>[\s\S]*?<span>([^<]+)<\/span>/i, html)
                  || extractMatch(/<tr>\s*<td>Author<\/td>\s*<td>([^<]+)<\/td>/i, html)
                  || 'Mangasusu Creator';
        author = decodeHtmlEntities(author.replace(/<[^>]+>/g, '').trim()) || 'Mangasusu Creator';

        let artist = extractMatch(/Artist\s*<\/[^>]+>[\s\S]*?<i>([^<]+)<\/i>/i, html)
                  || extractMatch(/<b>Artist<\/b>[\s\S]*?<span>([^<]+)<\/span>/i, html)
                  || extractMatch(/<tr>\s*<td>Artist<\/td>\s*<td>([^<]+)<\/td>/i, html)
                  || author;
        artist = decodeHtmlEntities(artist.replace(/<[^>]+>/g, '').trim()) || author;

        const genres = [];
        const genreAreaMatch = html.match(/<span[^>]*class="mgen"[^>]*>([\s\S]*?)<\/span>/i);
        if (genreAreaMatch) {
            const aTags = [...genreAreaMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)];
            for (const a of aTags) {
                const g = decodeHtmlEntities(a[1].trim());
                if (g && !genres.includes(g)) genres.push(g);
            }
        }
        if (genres.length === 0) {
            const genrez = [...html.matchAll(/<a[^>]*href="[^"]*\/genres\/[^"]*"[^>]*>([^<]+)<\/a>/gi)];
            for (const g of genrez) {
                const name = decodeHtmlEntities(g[1].trim());
                if (name && !genres.includes(name)) genres.push(name);
            }
        }

        const chapMatches = [...html.matchAll(/<(?:div[^>]*class="eph-num"|li[^>]*data-num="[^"]*")[^>]*>([\s\S]*?)<\/(?:div|li)>/gi)];
        const chapters = [];
        const seen = new Set();

        for (const m of chapMatches) {
            const block = m[1];
            const aMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
            if (!aMatch) continue;

            let chapUrl = aMatch[1].trim();
            if (!chapUrl || chapUrl.startsWith('#') || chapUrl.includes('{{') || chapUrl.includes('javascript:')) continue;
            if (chapUrl.startsWith('/')) chapUrl = BASE + chapUrl;

            if (seen.has(chapUrl)) continue;
            seen.add(chapUrl);

            let chapTitle = extractMatch(/<span[^>]*class="chapternum"[^>]*>([\s\S]*?)<\/span>/i, block);
            if (!chapTitle) {
                chapTitle = extractMatch(/<span[^>]*class="lch"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i, block);
            }
            if (!chapTitle) {
                chapTitle = extractMatch(/<a[^>]*>([\s\S]*?)<\/a>/i, block);
            }
            chapTitle = decodeHtmlEntities(chapTitle.replace(/<[^>]+>/g, '').trim()) || 'Chapter';

            let dateStr = extractMatch(/<span[^>]*class="chapterdate"[^>]*>([\s\S]*?)<\/span>/i, block, '-');
            dateStr = decodeHtmlEntities(dateStr.replace(/<[^>]+>/g, '').trim());

            let chNum = 0;
            const numM = chapTitle.match(/(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i);
            if (numM) chNum = parseFloat(numM[1]);

            chapters.push({
                id: chapUrl,
                title: chapTitle,
                endpoint: chapUrl,
                date: dateStr,
                _num: chNum
            });
        }

        chapters.sort((a, b) => b._num - a._num);
        chapters.forEach(c => { delete c._num; });

        return {
            title: title,
            cover_url: cover,
            description: desc,
            author: author,
            artist: artist,
            rating: rating,
            views: '-',
            genres: genres.length > 0 ? genres : ['Manhwa', 'Manga'],
            chapters: chapters
        };
    }

    async function getChapterImages(endpoint) {
        const html = await fetchHtml(endpoint);

        // 1. Check for data:text/javascript;base64 with ts_reader
        const b64Match = html.match(/src="data:text\/javascript;base64,([^"]+)"/i);
        if (b64Match) {
            try {
                const decoded = base64Decode(b64Match[1]);
                const jsonMatch = decoded.match(/["']?(?:images|imageUrls)["']?\s*[:=]\s*(\[.*?\])/);
                if (jsonMatch) {
                    const list = JSON.parse(jsonMatch[1]);
                    if (Array.isArray(list) && list.length > 0) {
                        return list.map(u => u.startsWith('/') ? BASE + u : u);
                    }
                }
            } catch (e) {}
        }

        // 2. Check for inline ts_reader.run or JSON image list
        const inlineMatch = html.match(/["']?(?:images|imageUrls)["']?\s*[:=]\s*(\[.*?\])/);
        if (inlineMatch) {
            try {
                const list = JSON.parse(inlineMatch[1]);
                if (Array.isArray(list) && list.length > 0) {
                    return list.map(u => u.startsWith('/') ? BASE + u : u);
                }
            } catch (e) {}
        }

        // 3. Fallback: Parse img tags from div#readerarea
        const readerAreaMatch = html.match(/<div[^>]*id="readerarea"[^>]*>([\s\S]*?)<\/div>/i);
        if (readerAreaMatch) {
            const areaHtml = readerAreaMatch[1];
            const imgTags = [...areaHtml.matchAll(/<img[^>]+>/gi)];
            const imgs = [];
            for (const tagMatch of imgTags) {
                const tag = tagMatch[0];
                const srcMatch = tag.match(/(?:data-lazy-src|data-src|data-cfsrc|src)="([^"]+)"/i);
                if (srcMatch) {
                    let u = srcMatch[1].trim();
                    if (u && !u.startsWith('data:image') && !u.includes('placeholder')) {
                        if (u.startsWith('/')) u = BASE + u;
                        imgs.push(u);
                    }
                }
            }
            if (imgs.length > 0) return imgs;
        }

        return [];
    }

    return {
        getList: getList,
        getDetail: getDetail,
        getChapterImages: getChapterImages
    };
})();
