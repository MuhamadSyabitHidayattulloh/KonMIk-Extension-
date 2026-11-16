// ID: ext_doujindesu
// NAME: Doujindesu
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #e91e63
// ICON: https://www.google.com/s2/favicons?domain=doujin.desu.xxx&sz=64
// REFERER: https://doujin.desu.xxx/

var KonmikExtension = (function () {
  var BASE = 'https://doujin.desu.xxx';
  var API = BASE + '/api';
  var APP_SECRET = 'dfdf72051dbfdc7d76889ebd31324e74';
  var SALT = 'doujindesu-scrapers-cannot-read-this-super-secret-salt-2026-v2';
  var HOUR_MS = 3600000;
  var LIMIT = 24;
  var headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    'Referer': BASE + '/',
    'x-app-secret': APP_SECRET,
    'Accept': 'application/json, */*'
  };

  function toSigned32(value) {
    return value | 0;
  }

  function makeKey(hour) {
    var text = SALT + '_' + hour;
    var hash = 0;
    for (var i = 0; i < text.length; i++) hash = toSigned32((hash << 5) - hash + text.charCodeAt(i));
    var state = hash !== 0 ? Math.abs(hash) : 123456789;
    var key = '';
    for (var j = 0; j < 32; j++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      key += String.fromCharCode(33 + (state % 93));
    }
    return key;
  }

  function decrypt(hex) {
    var hour = Math.floor(Date.now() / HOUR_MS);
    var hours = [hour, hour - 1, hour + 1];
    for (var h = 0; h < hours.length; h++) {
      var key = makeKey(hours[h]);
      var carry = 42;
      var encoded = '';
      for (var i = 0; i + 1 < hex.length; i += 2) {
        var byte = parseInt(hex.slice(i, i + 2), 16);
        if (isNaN(byte)) continue;
        var value = (byte ^ key.charCodeAt((i / 2) % key.length) ^ ((i / 2) * 13) ^ carry) & 255;
        encoded += '%' + ('0' + value.toString(16)).slice(-2);
        carry = (carry + byte) % 256;
      }
      try { return decodeURIComponent(encoded.replace(/\+/g, '%20')); } catch (e) {}
    }
    throw new Error('Gagal mendekripsi respons Doujindesu');
  }

  async function request(url) {
    var response = await fetch(url, { headers: headers });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var text = await response.text();
    var payload = JSON.parse(text);
    if (payload && payload._enc_resp_) payload = JSON.parse(decrypt(payload._enc_resp_));
    return payload;
  }

  function listUrl(page, sort, search) {
    var params = ['limit=' + LIMIT, 'offset=' + ((page - 1) * LIMIT), 'sort=' + encodeURIComponent(sort || 'latest_chapter')];
    if (search) params.push('search=' + encodeURIComponent(search));
    return API + '/manga?' + params.join('&');
  }

  function itemToComic(item) {
    var cover = item.cover_url || '';
    if (cover.charAt(0) === '/') cover = BASE + cover;
    return {
      id: item.slug || '',
      title: item.title || item.slug || '',
      cover_url: cover,
      latest_chapter: item.chapters && item.chapters.length ? String(item.chapters[0].chapter_number || '') : '',
      rating: '',
      views: ''
    };
  }

  return {
    async getList(page, query, filters) {
      page = Math.max(1, Number(page) || 1);
      var sort = filters && filters.sort === 'popular' ? 'rating' : 'latest_chapter';
      var data = await request(listUrl(page, sort, (query || '').trim()));
      var items = Array.isArray(data) ? data : (data.mangaList || data.manga_list || data.data || []);
      return { manga_list: items.map(itemToComic) };
    },

    async getDetail(slug) {
      slug = String(slug || '').replace(/^.*\//, '').replace(/\/$/, '');
      var item = await request(API + '/manga/' + encodeURIComponent(slug));
      if (item.data) item = item.data;
      var cover = item.cover_url || '';
      if (cover.charAt(0) === '/') cover = BASE + cover;
      var chapters = (item.chapters || []).map(function (chapter) {
        var number = chapter.chapter_number == null ? '' : String(chapter.chapter_number);
        var endpoint = chapter.id || chapter.url || '';
        return {
          id: String(endpoint),
          title: chapter.title || ('Chapter ' + number),
          endpoint: String(endpoint),
          date: chapter.created_at || ''
        };
      }).reverse();
      return {
        title: item.title || slug,
        cover_url: cover,
        description: item.description || '',
        author: item.author || '',
        artist: item.artist || item.author || '',
        rating: '',
        views: '',
        genres: Array.isArray(item.genres) ? item.genres : [],
        chapters: chapters
      };
    },

    async getChapterImages(endpoint) {
      var result = await request(API + '/chapters/' + encodeURIComponent(String(endpoint)));
      if (result.data) result = result.data;
      var pages = result.content_urls || result.pages || result.images || [];
      return pages.map(function (url) { return String(url); });
    }
  };
})();
