/**
 * id3-parser.js — Lightweight ID3v1 + ID3v2.3/2.4 tag parser
 *
 * Zero dependencies. Reads title, artist, album, year, genre, track number,
 * and embedded album art (APIC frame) from MP3 files.
 *
 * Usage:
 *   const tags = await ID3Parser.parse(file);
 *   // tags = { title, artist, album, year, genre, trackNumber, picture }
 *   // picture = { mime, data: Uint8Array } or null
 */
const ID3Parser = (() => {
  const GENRES = [
    'Blues','Classic Rock','Country','Dance','Disco','Funk','Grunge','Hip-Hop',
    'Jazz','Metal','New Age','Oldies','Other','Pop','R&B','Rap','Reggae','Rock',
    'Techno','Industrial','Alternative','Ska','Death Metal','Pranks','Soundtrack',
    'Euro-Techno','Ambient','Trip-Hop','Vocal','Jazz+Funk','Fusion','Trance',
    'Classical','Instrumental','Acid','House','Game','Sound Clip','Gospel','Noise',
    'AlternRock','Bass','Soul','Punk','Space','Meditative','Instrumental Pop',
    'Instrumental Rock','Ethnic','Gothic','Darkwave','Techno-Industrial','Electronic',
    'Pop-Folk','Eurodance','Dream','Southern Rock','Comedy','Cult','Gangsta','Top 40',
    'Christian Rap','Pop/Funk','Jungle','Native American','Cabaret','New Wave',
    'Psychedelic','Rave','Showtunes','Trailer','Lo-Fi','Tribal','Acid Punk',
    'Acid Jazz','Polka','Retro','Musical','Rock & Roll','Hard Rock',
    'Folk','Folk-Rock','National Folk','Swing','Fast Fusion','Bebop','Latin',
    'Revival','Celtic','Bluegrass','Avantgarde','Gothic Rock','Progressive Rock',
    'Psychedelic Rock','Symphonic Rock','Slow Rock','Big Band','Chorus',
    'Easy Listening','Acoustic','Humour','Speech','Chanson','Opera','Chamber Music',
    'Sonata','Symphony','Booty Bass','Primus','Porn Groove','Satire','Slow Jam',
    'Club','Tango','Samba','Folklore','Ballad','Power Ballad','Rhythmic Soul',
    'Freestyle','Duet','Punk Rock','Drum Solo','A Cappella','Euro-House',
    'Dance Hall','Goa','Drum & Bass','Club-House','Hardcore','Terror','Indie',
    'BritPop','Negerpunk','Polsk Punk','Beat','Christian Gangsta Rap',
    'Heavy Metal','Black Metal','Crossover','Contemporary Christian',
    'Christian Rock','Merengue','Salsa','Thrash Metal','Anime','JPop','Synthpop',
    'Abstract','Art Rock','Baroque','Bhangra','Big Beat','Breakbeat','Chillout',
    'Downtempo','Dub','EBM','Eclectic','Electro','Electroclash','Emo',
    'Experimental','Garage','Global','IDM','Illbient','Industro-Goth',
    'Jam Band','Krautrock','Leftfield','Lounge','Math Rock','New Romantic',
    'Nu-Breakz','Post-Punk','Post-Rock','Psytrance','Shoegaze','Space Rock',
    'Trop Rock','World Music','Neoclassical','Audiobook','Audio Theatre',
    'Neue Deutsche Welle','Podcast','Indie Rock','G-Funk','Dubstep',
    'Garage Rock','Psybient',
  ];

  /**
   * Parse ID3 tags from a File object.
   * Returns { title, artist, album, year, genre, trackNumber, picture }
   */
  async function parse(file) {
    const result = {
      title: null, artist: null, album: null,
      year: null, genre: null, trackNumber: null,
      picture: null,
    };

    try {
      // Read enough of the file for ID3v2 header + tags (first 512KB should cover most)
      const headerBuf = await readSlice(file, 0, Math.min(file.size, 512 * 1024));
      const headerView = new DataView(headerBuf);

      if (isID3v2(headerView)) {
        parseID3v2(headerBuf, headerView, result);
      }

      // Fallback: try ID3v1 at end of file for any missing fields
      if (!result.title || !result.artist || !result.album) {
        if (file.size >= 128) {
          const tailBuf = await readSlice(file, file.size - 128, 128);
          parseID3v1(new DataView(tailBuf), result);
        }
      }
    } catch (e) {
      // Parsing failed — return whatever we have
    }

    return result;
  }

  function readSlice(file, start, length) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file.slice(start, start + length));
    });
  }

  // ============================================
  // ID3v2
  // ============================================

  function isID3v2(view) {
    return view.byteLength >= 10 &&
      view.getUint8(0) === 0x49 && // 'I'
      view.getUint8(1) === 0x44 && // 'D'
      view.getUint8(2) === 0x33;   // '3'
  }

  function syncsafe(view, offset) {
    return (view.getUint8(offset) << 21) |
           (view.getUint8(offset + 1) << 14) |
           (view.getUint8(offset + 2) << 7) |
            view.getUint8(offset + 3);
  }

  function parseID3v2(buf, view, result) {
    const version = view.getUint8(3); // 3 = ID3v2.3, 4 = ID3v2.4
    const flags = view.getUint8(5);
    const tagSize = syncsafe(view, 6);
    const hasExtHeader = (flags & 0x40) !== 0;

    let offset = 10;

    // Skip extended header if present
    if (hasExtHeader) {
      const extSize = version === 4
        ? syncsafe(view, offset)
        : view.getUint32(offset);
      offset += extSize;
    }

    const end = Math.min(10 + tagSize, buf.byteLength);
    const frameHeaderSize = 10; // v2.3 and v2.4 both use 10-byte frame headers

    while (offset + frameHeaderSize <= end) {
      const frameId = String.fromCharCode(
        view.getUint8(offset), view.getUint8(offset + 1),
        view.getUint8(offset + 2), view.getUint8(offset + 3)
      );

      // Stop at padding (null bytes)
      if (frameId.charCodeAt(0) === 0) break;

      const frameSize = version === 4
        ? syncsafe(view, offset + 4)
        : view.getUint32(offset + 4);

      if (frameSize <= 0 || offset + frameHeaderSize + frameSize > end) break;

      const frameData = new Uint8Array(buf, offset + frameHeaderSize, frameSize);

      switch (frameId) {
        case 'TIT2': result.title = result.title || decodeTextFrame(frameData); break;
        case 'TPE1': result.artist = result.artist || decodeTextFrame(frameData); break;
        case 'TALB': result.album = result.album || decodeTextFrame(frameData); break;
        case 'TDRC': // ID3v2.4 recording date
        case 'TYER': result.year = result.year || decodeTextFrame(frameData); break;
        case 'TRCK': result.trackNumber = result.trackNumber || decodeTextFrame(frameData); break;
        case 'TCON': result.genre = result.genre || parseGenre(decodeTextFrame(frameData)); break;
        case 'APIC': if (!result.picture) result.picture = parseAPIC(frameData); break;
      }

      offset += frameHeaderSize + frameSize;
    }
  }

  function decodeTextFrame(data) {
    if (data.length < 2) return null;
    const encoding = data[0];
    const textBytes = data.subarray(1);

    let text;
    switch (encoding) {
      case 0: // ISO-8859-1
        text = decodeLatin1(textBytes);
        break;
      case 1: // UTF-16 with BOM
        text = decodeUTF16(textBytes);
        break;
      case 2: // UTF-16BE
        text = decodeUTF16BE(textBytes);
        break;
      case 3: // UTF-8
        text = new TextDecoder('utf-8').decode(textBytes);
        break;
      default:
        text = decodeLatin1(textBytes);
    }

    // Strip null terminators
    return text.replace(/\0+$/, '').trim() || null;
  }

  function decodeLatin1(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) break;
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }

  function decodeUTF16(bytes) {
    if (bytes.length < 2) return '';
    // Check BOM
    const bom = (bytes[0] << 8) | bytes[1];
    const littleEndian = bom === 0xFFFE;
    const start = (bom === 0xFEFF || bom === 0xFFFE) ? 2 : 0;
    let str = '';
    for (let i = start; i + 1 < bytes.length; i += 2) {
      const code = littleEndian
        ? (bytes[i + 1] << 8) | bytes[i]
        : (bytes[i] << 8) | bytes[i + 1];
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    return str;
  }

  function decodeUTF16BE(bytes) {
    let str = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    return str;
  }

  function parseGenre(raw) {
    if (!raw) return null;
    // Handle numeric genre references: "(13)" or "13" → "Pop"
    const m = raw.match(/^\((\d+)\)(.*)$/);
    if (m) {
      const idx = parseInt(m[1], 10);
      const suffix = m[2].trim();
      return suffix || (GENRES[idx] || raw);
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 0 && num < GENRES.length && raw === String(num)) {
      return GENRES[num];
    }
    return raw;
  }

  function parseAPIC(data) {
    if (data.length < 4) return null;
    const encoding = data[0];
    let offset = 1;

    // Read MIME type (always Latin-1 terminated by 0x00)
    let mime = '';
    while (offset < data.length && data[offset] !== 0) {
      mime += String.fromCharCode(data[offset]);
      offset++;
    }
    offset++; // skip null terminator

    if (offset >= data.length) return null;

    // Picture type byte (0x03 = front cover, but we accept any)
    offset++;

    // Description (encoding-dependent, null-terminated)
    if (encoding === 1 || encoding === 2) {
      // UTF-16: look for double null (0x00 0x00)
      while (offset + 1 < data.length) {
        if (data[offset] === 0 && data[offset + 1] === 0) { offset += 2; break; }
        offset += 2;
      }
    } else {
      // Latin-1 or UTF-8: single null
      while (offset < data.length && data[offset] !== 0) offset++;
      offset++;
    }

    if (offset >= data.length) return null;

    // Remaining bytes are the image data
    const imageData = data.slice(offset);

    // Normalize MIME (some files use shorthand)
    if (!mime || mime === 'image/jpg') mime = 'image/jpeg';
    if (mime === 'PNG' || mime === 'image/png') mime = 'image/png';

    return { mime, data: imageData };
  }

  // ============================================
  // ID3v1
  // ============================================

  function parseID3v1(view, result) {
    if (view.byteLength < 128) return;

    // Check "TAG" marker
    if (view.getUint8(0) !== 0x54 || view.getUint8(1) !== 0x41 || view.getUint8(2) !== 0x47) return;

    const decode = (offset, len) => {
      let str = '';
      for (let i = 0; i < len; i++) {
        const c = view.getUint8(offset + i);
        if (c === 0) break;
        str += String.fromCharCode(c);
      }
      return str.trim() || null;
    };

    if (!result.title) result.title = decode(3, 30);
    if (!result.artist) result.artist = decode(33, 30);
    if (!result.album) result.album = decode(63, 30);
    if (!result.year) result.year = decode(93, 4);

    // ID3v1.1: if byte 125 is 0 and byte 126 is non-zero, byte 126 = track number
    if (!result.trackNumber && view.getUint8(125) === 0 && view.getUint8(126) !== 0) {
      result.trackNumber = String(view.getUint8(126));
    }

    if (!result.genre) {
      const genreIdx = view.getUint8(127);
      if (genreIdx < GENRES.length) result.genre = GENRES[genreIdx];
    }
  }

  return { parse };
})();
