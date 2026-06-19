// Spice Rack demo content — pure data, no side effects
//
// Reading order for developers exploring this project:
//   1. apps/demo/schema.ts   — what the data is shaped like
//   2. apps/demo/seed/data.ts (this file) — what demo content lives in it
//   3. apps/demo/seed.ts     — how it gets inserted

// ─────────────────────────────────────────────────────────────
// SVG helpers — generate tiny inline images so the demo needs no S3
// ─────────────────────────────────────────────────────────────

/** Simple bottle silhouette SVG → base64 string for FileReference.data */
function bottleSvg(label: string, hue: number): { data: string; size: number } {
  const safe = label.replace(/[<>&"']/g, '');
  const display = safe.length > 14 ? safe.slice(0, 13) + '...' : safe;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160">` +
    `<rect x="38" y="8" width="24" height="32" rx="5" fill="hsl(${hue},55%,38%)"/>` +
    `<rect x="18" y="38" width="64" height="100" rx="14" fill="hsl(${hue},55%,38%)"/>` +
    `<rect x="24" y="64" width="52" height="44" rx="5" fill="white" opacity="0.9"/>` +
    `<text x="50" y="89" font-family="sans-serif" font-size="7" ` +
    `fill="hsl(${hue},55%,28%)" text-anchor="middle">${display}</text>` +
    `</svg>`;
  return { data: btoa(svg), size: svg.length };
}

/** Circular logo SVG with two-letter initials → base64 string */
function logoSvg(
  initials: string,
  hue: number,
): { data: string; size: number } {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">` +
    `<circle cx="40" cy="40" r="38" fill="hsl(${hue},55%,38%)"/>` +
    `<text x="40" y="48" font-family="sans-serif" font-size="22" font-weight="bold" ` +
    `fill="white" text-anchor="middle">${initials}</text>` +
    `</svg>`;
  return { data: btoa(svg), size: svg.length };
}

function bottle(name: string, hue: number) {
  const { data, size } = bottleSvg(name, hue);
  return {
    filename: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.svg',
    contentType: 'image/svg+xml',
    size,
    data,
  };
}

function logo(initials: string, hue: number, slug: string) {
  const { data, size } = logoSvg(initials, hue);
  return {
    filename: slug + '-logo.svg',
    contentType: 'image/svg+xml',
    size,
    data,
  };
}

/** Puck visual editor page content wrapper */
function puckContent(
  blocks: Array<{ type: string; props: Record<string, unknown> }>,
) {
  return {
    root: { props: {} },
    content: blocks.map((block, i) => ({
      type: block.type,
      props: { id: `block-${i}`, ...block.props },
    })),
    zones: {},
  };
}

// ─────────────────────────────────────────────────────────────
// Media library — images for Puck pages (inserted in order → IDs 1, 2, 3)
// ─────────────────────────────────────────────────────────────

/** Hero banner for About page — gradient with site title */
function spiceRackHeroSvg(): { data: string; size: number } {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">` +
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
    `<stop offset="0%" stop-color="hsl(15,70%,50%)"/>` +
    `<stop offset="100%" stop-color="hsl(35,70%,40%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="800" height="300" fill="url(#g)"/>` +
    `<text x="400" y="140" font-family="Georgia,serif" font-size="48" ` +
    `fill="white" text-anchor="middle" font-weight="bold">The Spice Rack</text>` +
    `<text x="400" y="190" font-family="sans-serif" font-size="18" ` +
    `fill="white" text-anchor="middle" opacity="0.9">A catalogue of imaginary hot sauces</text>` +
    `</svg>`;
  return { data: btoa(svg), size: svg.length };
}

/** Heat scale chart — visual 1-10 with pepper colors */
function heatScaleChartSvg(): { data: string; size: number } {
  const colors = [
    '#4ade80',
    '#84cc16',
    '#eab308',
    '#f59e0b',
    '#f97316',
    '#ef4444',
    '#dc2626',
    '#b91c1c',
    '#991b1b',
    '#7f1d1d',
  ];
  let rects = '';
  let labels = '';
  for (let i = 0; i < 10; i++) {
    const x = 40 + i * 72;
    rects += `<rect x="${x}" y="60" width="64" height="80" rx="8" fill="${
      colors[i]
    }"/>`;
    labels +=
      `<text x="${x + 32}" y="110" font-family="sans-serif" font-size="24" ` +
      `fill="white" text-anchor="middle" font-weight="bold">${i + 1}</text>`;
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200">` +
    `<rect width="800" height="200" fill="#1a1a1a"/>` +
    rects + labels +
    `<text x="400" y="175" font-family="sans-serif" font-size="14" ` +
    `fill="#999" text-anchor="middle">Mild - Hot - Extreme</text>` +
    `</svg>`;
  return { data: btoa(svg), size: svg.length };
}

/** Submit page illustration — bottle with question mark */
function submitIllustrationSvg(): { data: string; size: number } {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
    `<rect width="400" height="300" fill="#f8f4f0"/>` +
    `<rect x="160" y="40" width="80" height="50" rx="10" fill="#d97706"/>` +
    `<rect x="120" y="85" width="160" height="170" rx="20" fill="#d97706"/>` +
    `<rect x="140" y="120" width="120" height="100" rx="8" fill="white" opacity="0.9"/>` +
    `<text x="200" y="190" font-family="Georgia,serif" font-size="64" ` +
    `fill="#d97706" text-anchor="middle" font-weight="bold">?</text>` +
    `<text x="200" y="280" font-family="sans-serif" font-size="14" ` +
    `fill="#666" text-anchor="middle">Your sauce here</text>` +
    `</svg>`;
  return { data: btoa(svg), size: svg.length };
}

function makeMediaFile(
  generator: () => { data: string; size: number },
  filename: string,
) {
  const { data, size } = generator();
  return { filename, contentType: 'image/svg+xml', size, data };
}

// Insert order determines IDs: 1=hero, 2=heat-chart, 3=submit
export const mediaData = [
  {
    file: makeMediaFile(spiceRackHeroSvg, 'spice-rack-hero.svg'),
    alt: 'The Spice Rack — a catalogue of imaginary hot sauces',
    caption: 'Hero banner for the About page',
    published: true,
  },
  {
    file: makeMediaFile(heatScaleChartSvg, 'heat-scale-chart.svg'),
    alt: 'Heat scale from 1 (mild) to 10 (extreme)',
    caption: 'Visual heat scale chart',
    published: true,
  },
  {
    file: makeMediaFile(submitIllustrationSvg, 'submit-illustration.svg'),
    alt: 'Hot sauce bottle with question mark',
    caption: 'Illustration for the Submit page',
    published: true,
  },
];

// ─────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────

export const settingsData = [
  {
    key: 'site_name',
    value: 'The Spice Rack',
    description: 'Site title displayed in the header',
  },
  {
    key: 'tagline',
    value: 'A small catalogue of imaginary hot sauces',
    description: 'Tagline shown under the site title',
  },
  {
    key: 'footer_text',
    value: 'Demo for hotsauce-cms · MIT licensed · All sauces are fictional',
    description: 'Footer text',
  },
  {
    key: 'demo_banner',
    value:
      'Public read-only demo. Sign in with admin@example.com / admin123. All content is fictional and writes are blocked.',
    description: 'Banner shown across the top of every page',
  },
  {
    key: 'project_url',
    value: 'https://github.com/hotsauce-team/hotsauce',
    description: 'Link to the hotsauce-cms project',
  },
];

// ─────────────────────────────────────────────────────────────
// Admin user  (password hash is computed in seed.ts)
// ─────────────────────────────────────────────────────────────

export const adminUserData = {
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin',
};

// ─────────────────────────────────────────────────────────────
// Makers
// ─────────────────────────────────────────────────────────────

export const makersData = [
  {
    name: 'Pyre & Pestle',
    slug: 'pyre-pestle',
    // bio is markdown — rendered to bioHtml in seed.ts
    bio:
      `Small-batch artisan sauces made in runs of under 500 bottles. Everything is made by hand in a rented commercial kitchen in Portland. We source peppers from three farms in the Willamette Valley and do our own drying, roasting, and smoking on-site.`,
    logo: logo('PP', 20, 'pyre-pestle'),
    website: 'https://example.com/pyre-pestle',
  },
  {
    name: 'Three Goat Hot Sauce Co.',
    slug: 'three-goat',
    bio:
      `Farm-to-bottle sauces from our half-acre pepper plot in central Vermont. Founded by two former software engineers who decided growing things was more satisfying. All peppers are hand-picked and processed within 24 hours of harvest.`,
    logo: logo('3G', 80, 'three-goat'),
    website: 'https://example.com/three-goat',
  },
  {
    name: 'Smoke Hollow Provisions',
    slug: 'smoke-hollow',
    bio:
      `Cold-smoke specialists operating out of the Texas Hill Country since 2015. Every pepper that comes through our door gets smoked before it sees a blender. We don't cut corners, we add hickory.`,
    logo: logo('SH', 210, 'smoke-hollow'),
    website: 'https://example.com/smoke-hollow',
  },
  {
    name: 'Capsaicin Labs',
    slug: 'capsaicin-labs',
    bio:
      `A precision hot sauce operation staffed by one chemist and one cook who got tired of arguing about which mattered more. We measure everything. Our bottles ship with a QR code linking to the batch SHU test results.`,
    logo: logo('CL', 355, 'capsaicin-labs'),
    website: 'https://example.com/capsaicin-labs',
  },
  {
    name: 'Sunset Ridge',
    slug: 'sunset-ridge',
    bio:
      `A small family farm on the North Shore of Maui. We grow Hawaiian chili peppers, scotch bonnets, and tropical fruit that ends up in every bottle. Our sauces are seasonal — when the harvest is done, that batch is done.`,
    logo: logo('SR', 45, 'sunset-ridge'),
    website: 'https://example.com/sunset-ridge',
  },
];

// ─────────────────────────────────────────────────────────────
// Sauces
// makerSlug is resolved to makerId by seed.ts after inserting makers.
// tastingNotes is markdown — rendered to tastingNotesHtml in seed.ts.
// ─────────────────────────────────────────────────────────────

export const saucesData = [
  // ── Pyre & Pestle ──────────────────────────────────────────
  {
    name: 'Morning Ember',
    slug: 'morning-ember',
    makerSlug: 'pyre-pestle',
    heat: 3,
    scoville: 8000,
    bottle: bottle('Morning Ember', 20),
    tastingNotes:
      `A gentle wake-up call with cascabel and ancho peppers slowly dried over mesquite. The first taste is rich and earthy — a low warmth that builds steadily across the back of the palate. Notes of dark chocolate and dried fruit linger into a clean, quiet finish.

Pairs well with eggs, roasted vegetables, and anything that benefits from quiet heat.`,
    published: true,
  },
  {
    name: 'Charred Mango',
    slug: 'charred-mango',
    makerSlug: 'pyre-pestle',
    heat: 5,
    scoville: 25000,
    bottle: bottle('Charred Mango', 30),
    tastingNotes:
      `Fresh Ataulfo mangoes fire-roasted until the skin chars, then blended with habanero and a touch of lime. The sweetness hits first — bright and tropical — before the habanero builds through the mid-palate.

Use it on fish tacos, grilled shrimp, or straight from the bottle.`,
    published: true,
  },
  {
    name: 'Obsidian Reaper',
    slug: 'obsidian-reaper',
    makerSlug: 'pyre-pestle',
    heat: 9,
    scoville: 1200000,
    bottle: bottle('Obsidian Reaper', 15),
    tastingNotes:
      `Three Carolina Reapers per bottle, uncut, blended with black garlic and a whisper of elderflower so you can taste something before the heat arrives. The floral note lasts two seconds.

After that, you're on your own. **Use by the drop.**`,
    published: true,
  },

  // ── Three Goat ─────────────────────────────────────────────
  {
    name: 'Garden Gate',
    slug: 'garden-gate',
    makerSlug: 'three-goat',
    heat: 2,
    scoville: 3000,
    bottle: bottle('Garden Gate', 80),
    tastingNotes:
      `Every pepper in this bottle was picked that morning from the same half-acre plot in Vermont. Shishito, sweet banana, and a handful of Jimmy Nardellos give it a fresh, grassy sweetness with just enough serrano to remind you it's a hot sauce.

Great on sandwiches, salads, or anywhere you want a little green heat.`,
    published: true,
  },
  {
    name: 'Jalapeño Verde',
    slug: 'jalapeno-verde',
    makerSlug: 'three-goat',
    heat: 4,
    scoville: 15000,
    bottle: bottle('Jalap Verde', 90),
    tastingNotes:
      `The classic green jalapeño sauce done as well as we know how. Roasted tomatillos keep it bright. Fresh cilantro keeps it honest. The heat is a slow, medium simmer — enough to know it's there, mild enough to pour generously on tacos, burritos, and scrambled eggs.`,
    published: true,
  },
  {
    name: 'Goat Horn Ghost',
    slug: 'goat-horn-ghost',
    makerSlug: 'three-goat',
    heat: 8,
    scoville: 900000,
    bottle: bottle('Goat Horn', 70),
    tastingNotes:
      `Ghost peppers blended with fermented green tomatoes and apple cider vinegar. The ferment softens the raw burn into something more complex — still very hot, but with a tangy, almost yoghurt-like quality that makes it surprisingly food-friendly.

Chicken wings, ramen, Thai curry. Respect the bottle.`,
    published: true,
  },

  // ── Smoke Hollow ───────────────────────────────────────────
  {
    name: 'Hickory Habanero',
    slug: 'hickory-habanero',
    makerSlug: 'smoke-hollow',
    heat: 6,
    scoville: 150000,
    bottle: bottle('Hickory Hab', 210),
    tastingNotes:
      `Habaneros cold-smoked over hickory for six hours before the blend. The smoke doesn't dull the habanero — it adds depth underneath it. You get the citrusy, floral heat, and below it a long slow smoke note that carries into the finish like the end of a good barbecue.

Made for ribs, brisket, and any pulled pork situation.`,
    published: true,
  },
  {
    name: 'Brisket Drip',
    slug: 'brisket-drip',
    makerSlug: 'smoke-hollow',
    heat: 4,
    scoville: 20000,
    bottle: bottle('Brisket Drip', 200),
    tastingNotes:
      `This started as the pan drippings sauce from our test kitchen brisket smokes. We liked it so much we formalized it. Beef tallow, serrano, roasted garlic, and a spice blend that is absolutely not going on the label.

Not technically a hot sauce. Definitely the best thing you can put on a brisket sandwich.`,
    published: true,
  },
  {
    name: 'Pecan Chipotle',
    slug: 'pecan-chipotle',
    makerSlug: 'smoke-hollow',
    heat: 3,
    scoville: 10000,
    bottle: bottle('Pecan Chipotle', 220),
    tastingNotes:
      `Chipotle in adobo meets toasted Texas pecans, finished with a splash of sorghum. The result is nutty, smoky, gently sweet, and just warm enough to qualify as a hot sauce.

Stir it into queso. Drizzle it on sweet potatoes. Eat it with a spoon.`,
    published: true,
  },

  // ── Capsaicin Labs ─────────────────────────────────────────
  {
    name: 'Formula X',
    slug: 'formula-x',
    makerSlug: 'capsaicin-labs',
    heat: 10,
    scoville: 2200000,
    bottle: bottle('Formula X', 355),
    tastingNotes: `**Warning: extract-level capsaicin. For culinary use only.**

This is not a challenge sauce. It is a precision tool for experienced cooks who need controlled high heat without altering flavor profiles. Half a milliliter per litre of liquid is typically sufficient.

Use gloves. Do not touch your face. Store below 25°C.`,
    published: true,
  },
  {
    name: 'Compound 7',
    slug: 'compound-7',
    makerSlug: 'capsaicin-labs',
    heat: 7,
    scoville: 350000,
    bottle: bottle('Compound 7', 5),
    tastingNotes:
      `The seventh iteration of our precision-heat blend, and the first one we're happy enough to sell. Carolina Reaper and Trinidad Scorpion balanced against fermented white pineapple and white wine vinegar. The sweetness gives you somewhere to be before the heat finds you.

Exact, repeatable, surprisingly pleasant. We keep detailed notes. Batch 7.3.1.`,
    published: true,
  },
  {
    name: 'Baseline',
    slug: 'baseline',
    makerSlug: 'capsaicin-labs',
    heat: 5,
    scoville: 50000,
    bottle: bottle('Baseline', 350),
    tastingNotes:
      `Every lab needs a control. Baseline is ours: a consistent 50,000 SHU serrano blend, measured and calibrated before every production run.

We sell it because several customers told us it was their favourite sauce. We are still processing this.`,
    published: true,
  },

  // ── Sunset Ridge ───────────────────────────────────────────
  {
    name: 'Pineapple Scotch',
    slug: 'pineapple-scotch',
    makerSlug: 'sunset-ridge',
    heat: 6,
    scoville: 100000,
    bottle: bottle('Pineapple Scotch', 45),
    tastingNotes:
      `Scotch bonnets grown on the North Shore, blended with Maui Gold pineapple and a fermented mango brine maintained since 2021. The scotch bonnet heat is floral and tropical to start — genuinely fruity — and then builds to a fierce, mouth-filling burn that still tastes like a holiday.

On jerk chicken, this is non-negotiable.`,
    published: true,
  },
  {
    name: 'Mango Madness',
    slug: 'mango-madness',
    makerSlug: 'sunset-ridge',
    heat: 4,
    scoville: 18000,
    bottle: bottle('Mango Madness', 50),
    tastingNotes:
      `Three varietals of Maui mango, habanero, and a little turmeric for colour and earthiness. Unabashedly sweet and deliberately so — the fruit carries the heat rather than competing with it.

The bottle that gets finished first at parties. Every time.`,
    published: true,
  },
  {
    name: 'Lilikoi Lime',
    slug: 'lilikoi-lime',
    makerSlug: 'sunset-ridge',
    heat: 2,
    scoville: 2000,
    bottle: bottle('Lilikoi Lime', 55),
    tastingNotes:
      `Lilikoi is passion fruit and we grow it on the ridge. This sauce is for people who love the flavour of hot sauce but not the heat — a 2 out of 10 that still earns its place in the category.

Bright, acidic, tropical, and just warm enough on the lips to be interesting. The best gateway sauce we make.`,
    published: true,
  },

  // ── Draft ──────────────────────────────────────────────────
  {
    name: 'Project Ember II',
    slug: 'project-ember-ii',
    makerSlug: 'pyre-pestle',
    heat: 6,
    bottle: bottle('Ember II', 25),
    tastingNotes: `*Draft — not for public release yet.*

Working on a follow-up to Morning Ember with a higher heat ceiling. Current test batch uses mulato and pasilla negro alongside the cascabel. The smoke integration needs another week.`,
    published: false,
  },
];

// ─────────────────────────────────────────────────────────────
// Pages  (Puck visual editor)
// Media IDs: 1=hero, 2=heat-chart, 3=submit (match insert order)
// ─────────────────────────────────────────────────────────────

/** Helper to create SelectedImage reference for Puck */
function mediaRef(
  id: number,
  alt: string,
  filename: string,
): {
  id: number;
  table: string;
  column: string;
  alt: string;
  filename: string;
} {
  return { id, table: 'media', column: 'file', alt, filename };
}

export const pagesData = [
  {
    title: 'About the Rack',
    slug: 'about',
    sortOrder: 1,
    published: true,
    content: puckContent([
      {
        type: 'Image',
        props: {
          media: mediaRef(
            1,
            'The Spice Rack — a catalogue of imaginary hot sauces',
            'spice-rack-hero.svg',
          ),
          alt: '',
        },
      },
      { type: 'Space', props: { size: 'large' } },
      {
        type: 'Heading',
        props: { text: 'What is this?', level: 'h2', align: 'left' },
      },
      {
        type: 'Text',
        props: {
          text:
            'A small catalogue of imaginary hot sauces, built to demo hotsauce-cms. All content is fictional. All sauces are delicious in theory.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'medium' } },
      {
        type: 'Text',
        props: {
          text:
            'This is a live demo of hotsauce-cms — a schema-driven headless CMS built on Drizzle ORM. The admin area is accessible but writes are blocked. Sign in with admin@example.com / admin123 to explore.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'medium' } },
      {
        type: 'Button',
        props: {
          label: 'View the project on GitHub',
          href: 'https://github.com/hotsauce-team/hotsauce',
          variant: 'primary',
        },
      },
    ]),
  },
  {
    title: 'The Heat Scale',
    slug: 'heat-scale',
    sortOrder: 2,
    published: true,
    content: puckContent([
      {
        type: 'Heading',
        props: {
          text: 'Understanding the Heat Scale',
          level: 'h1',
          align: 'center',
        },
      },
      {
        type: 'Text',
        props: {
          text:
            'Every sauce on The Spice Rack is rated 1 to 10. Here is what those numbers mean in practice.',
          align: 'center',
          size: 'large',
        },
      },
      { type: 'Space', props: { size: 'large' } },
      {
        type: 'Image',
        props: {
          media: mediaRef(
            2,
            'Heat scale from 1 (mild) to 10 (extreme)',
            'heat-scale-chart.svg',
          ),
          alt: '',
        },
      },
      { type: 'Space', props: { size: 'large' } },
      {
        type: 'Heading',
        props: {
          text: '1–2: Mild (up to 5,000 SHU)',
          level: 'h3',
          align: 'left',
        },
      },
      {
        type: 'Text',
        props: {
          text:
            'Bell pepper to mild jalapeño. You will taste flavour, not heat. Great for everyone at the table.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'small' } },
      {
        type: 'Heading',
        props: {
          text: '3–4: Medium (5,000–30,000 SHU)',
          level: 'h3',
          align: 'left',
        },
      },
      {
        type: 'Text',
        props: {
          text:
            'Jalapeño to serrano. Noticeable warmth that builds. Most people are comfortable here.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'small' } },
      {
        type: 'Heading',
        props: {
          text: '5–6: Hot (30,000–200,000 SHU)',
          level: 'h3',
          align: 'left',
        },
      },
      {
        type: 'Text',
        props: {
          text:
            'Habanero range. Genuine heat that demands respect. Start with a small pour.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'small' } },
      {
        type: 'Heading',
        props: {
          text: '7–8: Very Hot (200,000–1,000,000 SHU)',
          level: 'h3',
          align: 'left',
        },
      },
      {
        type: 'Text',
        props: {
          text:
            'Ghost pepper and scorpion territory. Experienced palates only. The burn lingers.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'small' } },
      {
        type: 'Heading',
        props: {
          text: '9–10: Extreme (1,000,000+ SHU)',
          level: 'h3',
          align: 'left',
        },
      },
      {
        type: 'Text',
        props: {
          text:
            'Carolina Reaper and extract territory. Use by the drop. Not for the faint of heart or the careless.',
          align: 'left',
          size: 'medium',
        },
      },
    ]),
  },
  {
    title: 'Submit a Sauce',
    slug: 'submit',
    sortOrder: 3,
    published: true,
    content: puckContent([
      {
        type: 'Heading',
        props: { text: 'Submit a Sauce', level: 'h1', align: 'center' },
      },
      {
        type: 'Text',
        props: {
          text:
            'Know a sauce we should catalogue? This is where you would tell us.',
          align: 'center',
          size: 'large',
        },
      },
      { type: 'Space', props: { size: 'large' } },
      {
        type: 'Image',
        props: {
          media: mediaRef(
            3,
            'Hot sauce bottle with question mark',
            'submit-illustration.svg',
          ),
          alt: '',
        },
      },
      { type: 'Space', props: { size: 'large' } },
      {
        type: 'Heading',
        props: { text: 'This is a read-only demo', level: 'h2', align: 'left' },
      },
      {
        type: 'Text',
        props: {
          text:
            'The Spice Rack is a public demo for hotsauce-cms. All content is fictional and all writes are blocked. You can sign in to the admin area and explore the interface, but nothing will be saved.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'medium' } },
      {
        type: 'Text',
        props: {
          text:
            'To try the real editor: clone the repo, run deno task seed, and start the server locally with NODE_ENV=local.',
          align: 'left',
          size: 'medium',
        },
      },
      { type: 'Space', props: { size: 'medium' } },
      {
        type: 'Button',
        props: {
          label: 'Clone on GitHub',
          href: 'https://github.com/hotsauce-team/hotsauce',
          variant: 'primary',
        },
      },
    ]),
  },
];
