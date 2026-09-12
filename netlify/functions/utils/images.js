const { SVG_ROOTS, SVG_SCROLL, SVG_LIGHTBULB, SVG_COMPASS, SVG_HOURGLASS, SVG_QUESTION } = require("../../../public/js/image-defaults.js");

async function getBestImage({ keywords, category, id, title }) {
  const log = (msg) => console.log(`[image-utils] ${msg}`);

  // SOURCE 1: Wikipedia Search & Page Images
  const queriesToTry = [];
  if (title) queriesToTry.push(title);
  if (keywords && keywords.length > 0) {
    queriesToTry.push(keywords[0]);
    if (keywords[1]) queriesToTry.push(keywords[1]);
  }

  for (const query of queriesToTry) {
    try {
      log(`Searching Wikipedia for query: "${query}"`);
      const wikiUrl = `https://en.wikipedia.org/w/api.php?` +
        `action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&` +
        `gsrlimit=1&prop=pageimages&piprop=original&pithumbsize=800&` +
        `format=json&origin=*`;

      const res = await fetch(wikiUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages) {
          const page = Object.values(pages)[0];
          const imageUrl = page?.original?.source || page?.thumbnail?.source;
          if (imageUrl) {
            const lowerUrl = imageUrl.toLowerCase();
            const validExtension = lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg") || lowerUrl.endsWith(".png") || lowerUrl.endsWith(".webp");
            const isGeneric = lowerUrl.includes("logo") || lowerUrl.includes("icon") || lowerUrl.includes("flag");
            if (validExtension && !isGeneric) {
              log(`Found Wikipedia image via search: ${imageUrl}`);
              return imageUrl;
            }
          }
        }
      }
    } catch (err) {
      log(`Wikipedia search failed for "${query}": ${err.message}`);
    }
  }

  // Fallback to exact title Wikipedia page query (legacy method)
  const searchKeyword = keywords?.[0] || title || "";
  if (searchKeyword) {
    try {
      log(`Trying exact Wikimedia Commons for: "${searchKeyword}"`);
      const wikiUrl = `https://en.wikipedia.org/w/api.php?` + 
        `action=query&titles=${encodeURIComponent(searchKeyword)}&` +
        `prop=pageimages&piprop=original&pithumbsize=800&` +
        `format=json&origin=*`;

      const res = await fetch(wikiUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages) {
          const page = Object.values(pages)[0];
          const imageUrl = page?.original?.source || page?.thumbnail?.source;
          if (imageUrl) {
            const lowerUrl = imageUrl.toLowerCase();
            const validExtension = lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg") || lowerUrl.endsWith(".png") || lowerUrl.endsWith(".webp");
            const isGeneric = lowerUrl.includes("logo") || lowerUrl.includes("icon") || lowerUrl.includes("flag");
            if (validExtension && !isGeneric) {
              log(`Found Wikimedia image: ${imageUrl}`);
              return imageUrl;
            }
          }
        }
      }
    } catch (err) {
      log(`Wikimedia search failed: ${err.message}`);
    }
  }

  // SOURCE 2: Unsplash Featured API with subject keywords
  try {
    log(`Trying Unsplash Featured API...`);
    const kw = (keywords && keywords[0]) ? keywords[0] : (title || category || "history");
    const cleanKw = kw.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, ",");
    const unsplashUrl = `https://images.unsplash.com/featured/?${encodeURIComponent(cleanKw)}`;
    log(`Using topic-relevant Unsplash URL: ${unsplashUrl}`);
    return unsplashUrl;
  } catch (err) {
    log(`Unsplash featured failed: ${err.message}`);
  }

  // Fallback to topic search URL
  const topicKw = (title || "discovery").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, ",");
  return `https://images.unsplash.com/featured/?${encodeURIComponent(topicKw)}`;
}
}

module.exports = { getBestImage };
