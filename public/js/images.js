function getPostImage(post) {
  // If agent stored a real image URL, use it
  if (post.images && post.images[0] && post.images[0].startsWith("http")) {
    return `<div class="image-container shimmer">
      <img 
        src="${post.images[0]}" 
        alt="${post.title}"
        onerror="this.onerror=null; useCategoryDefault(this, '${post.category}')"
        onload="this.parentElement.classList.remove('shimmer')"
        loading="lazy"
        style="width:100%;height:100%;object-fit:cover">
    </div>`;
  }
  // No image stored — use category default SVG immediately
  return `<div class="image-container">${getCategoryDefaultSVG(post.category)}</div>`;
}

function useCategoryDefault(imgEl, category) {
  // Replace broken img with the SVG default
  const svg = getCategoryDefaultSVG(category);
  imgEl.parentElement.innerHTML = svg;
}

function getCategoryDefaultSVG(category) {
  const defaults = {
    "Food & Drink": SVG_ROOTS,
    "Language": SVG_SCROLL,
    "Culture": SVG_SCROLL,
    "Inventions": SVG_LIGHTBULB,
    "Science": SVG_LIGHTBULB,
    "History": SVG_HOURGLASS,
  };
  return defaults[category] || SVG_COMPASS;
}
