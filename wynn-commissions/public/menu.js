/* EDIT YOUR MENU HERE. Starter prices are kept low on purpose; raise them here as the shop grows.
   The ids must stay as they are (the server knows them). `price: null` shows "Ask for a quote".
   kind: "art" = drawn pieces, "physical" = handmade items. Everything is mailed or handed over at a station. */
window.MENU = [
  { id: 'ych', name: 'YCH', blurb: 'Your Character Here. Send me your character and I will place them into one of my cute poses.',
    price: 18, unit: 'per character', kind: 'art', days: '3 to 5 days', icon: 'imp',
    vars: '--body:#1b1230;--ear:#ff7ac8;--accent:#ff7ac8;--line:#a77bff;--blush:#ff7ac8' },
  { id: 'head', name: 'Heads', blurb: 'A cute, detailed head shot of your character. Great for profile pictures.',
    price: 14, unit: 'per character', kind: 'art', days: '2 to 4 days', icon: 'imp',
    vars: '--body:#6a4cff;--ear:#6fc7ff;--accent:#ff7ac8;--line:#d6c8ff;--blush:#ff7ac8' },
  { id: 'bust', name: 'Busts', blurb: 'Head and shoulders with soft shading and a pastel background.',
    price: 24, unit: 'per character', kind: 'art', days: '3 to 5 days', icon: 'imp',
    vars: '--body:#ff7ac8;--ear:#1b1230;--accent:#6fc7ff;--line:#fff1fb;--blush:#fff1fb' },
  { id: 'full', name: 'Full body', blurb: 'Your whole character with a full render, extras and a custom scene.',
    price: 38, unit: 'per character', kind: 'art', days: '5 to 8 days', icon: 'imp',
    vars: '--body:#10091f;--ear:#6fc7ff;--accent:#6fc7ff;--line:#6fc7ff;--blush:#ff7ac8' },
  { id: 'couple', name: 'Couple art', blurb: 'Two characters together, from cuddly to chaotic. Hearts included.',
    price: 45, unit: 'for two', kind: 'art', days: '5 to 8 days', icon: 'imp',
    vars: '--body:#a77bff;--ear:#ff7ac8;--accent:#ff7ac8;--line:#fff1fb;--blush:#ff7ac8' },
  { id: 'key-leather', name: 'Keychain (leather)', blurb: 'A handmade leather charm of your character, stamped and finished by hand.',
    price: 15, unit: 'each', kind: 'physical', days: '1 to 2 weeks', icon: 'key',
    vars: '--body:#4b2145;--accent:#ff7ac8;--line:#a77bff' },
  { id: 'key-wood', name: 'Keychain (wood)', blurb: 'A wooden charm with your character burned or painted on, sealed to last.',
    price: 14, unit: 'each', kind: 'physical', days: '1 to 2 weeks', icon: 'key',
    vars: '--body:#d9a46c;--accent:#6fc7ff;--line:#fff1fb' },
  { id: 'ita', name: 'Ita bag', blurb: 'A bag with a clear window, decorated for your favorite characters, pins and charms.',
    price: 55, unit: 'and up', kind: 'physical', days: '2 to 3 weeks', icon: 'bag',
    vars: '--body:#a77bff;--accent:#ff7ac8;--accent2:#6fc7ff;--line:#fff1fb' },
  { id: 'special', name: 'Special requests', blurb: 'Have something else in mind? Ask! I say yes to most ideas within reason.',
    price: null, unit: '', kind: 'either', days: 'Depends on the idea', icon: 'imp',
    vars: '--body:#1b1230;--ear:#6fc7ff;--accent:#a77bff;--line:#ff7ac8;--blush:#6fc7ff' }
];

window.ADDONS = [
  'Extra character +$12',
  'Pet or plushie +$6',
  'Simple background free, scene backgrounds +$6',
  'Rush order +25%'
];
