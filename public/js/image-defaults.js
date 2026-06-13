const SVG_ROOTS = `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background-color:#0D7A6B;">
  <rect width="100%" height="100%" fill="#0D7A6B"/>
  <path d="M400,0 C400,100 420,150 430,180 C440,210 460,240 480,270 C500,300 520,330 510,380 C500,430 450,460 400,490" stroke="#F5A623" stroke-width="6" fill="none" opacity="0.9"/>
  <path d="M400,0 C380,80 350,130 320,170 C290,210 270,250 280,310 C290,370 320,410 350,470" stroke="#F8F6F1" stroke-width="4" fill="none" opacity="0.8"/>
  <path d="M430,180 C390,210 360,250 370,300 C380,350 410,400 420,450" stroke="#F5A623" stroke-width="3" fill="none" opacity="0.7"/>
  <path d="M320,170 C350,200 370,240 360,290 C350,340 320,380 290,430" stroke="#F8F6F1" stroke-width="3" fill="none" opacity="0.6"/>
  <path d="M480,270 C520,290 550,330 560,370 C570,410 550,440 520,480" stroke="#F8F6F1" stroke-width="2.5" fill="none" opacity="0.5"/>
  <circle cx="400" cy="490" r="8" fill="#F5A623"/>
  <circle cx="350" cy="470" r="6" fill="#F8F6F1"/>
  <circle cx="420" cy="450" r="5" fill="#F5A623"/>
</svg>`;

const SVG_SCROLL = `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background-color:#0D7A6B;">
  <rect width="100%" height="100%" fill="#0D7A6B"/>
  <rect x="250" y="100" width="300" height="300" rx="12" fill="#F8F6F1" transform="rotate(-5, 400, 250)"/>
  <path d="M280,140 L480,140 M280,180 L500,180 M280,220 L460,220 M280,260 L490,260 M280,300 L440,300 M280,340 L470,340" stroke="#0D7A6B" stroke-width="4" stroke-linecap="round" opacity="0.25" transform="rotate(-5, 400, 250)"/>
  <path d="M220,90 C220,90 235,250 220,410 C210,420 250,420 260,410 C275,250 260,90 260,90" stroke="#F5A623" stroke-width="4" fill="#F5A623" opacity="0.95"/>
  <path d="M540,90 C540,90 555,250 540,410 C530,420 570,420 580,410 C595,250 580,90 580,90" stroke="#F5A623" stroke-width="4" fill="#F5A623" opacity="0.95"/>
  <circle cx="240" cy="90" r="8" fill="#F5A623"/>
  <circle cx="240" cy="410" r="8" fill="#F5A623"/>
  <circle cx="560" cy="90" r="8" fill="#F5A623"/>
  <circle cx="560" cy="410" r="8" fill="#F5A623"/>
</svg>`;

const SVG_LIGHTBULB = `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background-color:#0D7A6B;">
  <rect width="100%" height="100%" fill="#0D7A6B"/>
  <path d="M400,120 C340,120 310,160 310,210 C310,250 335,280 355,305 L355,350 L445,350 L445,305 C465,280 490,250 490,210 C490,160 460,120 400,120 Z" fill="none" stroke="#F8F6F1" stroke-width="8" stroke-linejoin="round"/>
  <path d="M365,350 L435,350 M370,365 L430,365 M380,380 L420,380" stroke="#F5A623" stroke-width="6" stroke-linecap="round"/>
  <path d="M400,210 L400,280 M380,240 L400,280 L420,240" fill="none" stroke="#F5A623" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="400" y1="70" x2="400" y2="95" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
  <line x1="400" y1="405" x2="400" y2="430" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
  <line x1="260" y1="210" x2="285" y2="210" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
  <line x1="515" y1="210" x2="540" y2="210" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
  <line x1="300" y1="110" x2="318" y2="128" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
  <line x1="500" y1="110" x2="482" y2="128" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
  <line x1="300" y1="310" x2="318" y2="292" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
  <line x1="500" y1="310" x2="482" y2="292" stroke="#F8F6F1" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const SVG_COMPASS = `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background-color:#0D7A6B;">
  <rect width="100%" height="100%" fill="#0D7A6B"/>
  <circle cx="400" cy="250" r="140" fill="none" stroke="#F8F6F1" stroke-width="6"/>
  <circle cx="400" cy="250" r="155" fill="none" stroke="#F5A623" stroke-width="2" stroke-dasharray="8,8"/>
  <path d="M400,120 L415,235 L400,250 Z" fill="#F5A623"/>
  <path d="M400,120 L385,235 L400,250 Z" fill="#F8F6F1"/>
  <path d="M400,380 L385,265 L400,250 Z" fill="#F8F6F1" opacity="0.7"/>
  <path d="M400,380 L415,265 L400,250 Z" fill="#F5A623" opacity="0.7"/>
  <path d="M530,250 L415,235 L400,250 Z" fill="#F5A623" opacity="0.8"/>
  <path d="M530,250 L415,265 L400,250 Z" fill="#F8F6F1" opacity="0.8"/>
  <path d="M270,250 L385,265 L400,250 Z" fill="#F8F6F1" opacity="0.8"/>
  <path d="M270,250 L385,235 L400,250 Z" fill="#F5A623" opacity="0.8"/>
  <text x="400" y="105" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="700" font-size="20" fill="#F8F6F1">N</text>
  <text x="400" y="410" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="700" font-size="20" fill="#F8F6F1">S</text>
  <text x="555" y="257" font-family="'Inter', sans-serif" font-weight="700" font-size="20" fill="#F8F6F1">E</text>
  <text x="235" y="257" font-family="'Inter', sans-serif" font-weight="700" font-size="20" fill="#F8F6F1">W</text>
</svg>`;

const SVG_HOURGLASS = `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background-color:#0D7A6B;">
  <rect width="100%" height="100%" fill="#0D7A6B"/>
  <path d="M330,120 L470,120 M330,380 L470,380" stroke="#F8F6F1" stroke-width="12" stroke-linecap="round"/>
  <path d="M340,130 C340,200 380,240 395,250 C380,260 340,300 340,370" fill="none" stroke="#F8F6F1" stroke-width="8"/>
  <path d="M460,130 C460,200 420,240 405,250 C420,260 460,300 460,370" fill="none" stroke="#F8F6F1" stroke-width="8"/>
  <path d="M350,150 L450,150 C440,210 405,245 400,250 C395,245 360,210 350,150 Z" fill="#F5A623" opacity="0.9"/>
  <path d="M390,250 L410,250 L450,370 L350,370 Z" fill="#F5A623" opacity="0.4"/>
  <path d="M370,350 L430,350 L450,370 L350,370 Z" fill="#F5A623" opacity="0.85"/>
  <line x1="400" y1="250" x2="400" y2="350" stroke="#F5A623" stroke-width="3" stroke-dasharray="6,6"/>
</svg>`;

const SVG_QUESTION = `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background-color:#0D7A6B;">
  <rect width="100%" height="100%" fill="#0D7A6B"/>
  <text x="400" y="320" text-anchor="middle" font-family="'Playfair Display', Georgia, serif" font-weight="700" font-size="280" fill="#F8F6F1" opacity="0.8">?</text>
  <circle cx="400" cy="370" r="18" fill="#F5A623"/>
</svg>`;

if (typeof module !== 'undefined') {
  module.exports = {
    SVG_ROOTS,
    SVG_SCROLL,
    SVG_LIGHTBULB,
    SVG_COMPASS,
    SVG_HOURGLASS,
    SVG_QUESTION
  };
}
