# Wynn's Commissions (Netlify)

A multi-page commission site: menu, gallery, reviews, order form with delivery destination,
order tracking with a return address, suggestion box, terms page, an artist dashboard,
light / dark / winter themes and a lofi music player.

Pages are in `public/`. The backend is one Netlify Function in `netlify/`, and Netlify Blobs
(built in, no setup) stores accounts, orders, reviews, suggestions and artwork.

## 1. Add these environment variables in Netlify

Site configuration > Environment variables:

| Name | Value |
| --- | --- |
| `OWNER_USERNAME` | `wynn` (this is the default, so you can skip it) |
| `OWNER_PASSWORD` | Wynn's login password (use a long one) |
| `OWNER_NAME` | `Wynn` (the default, shown next to her badge) |
| `SESSION_SECRET` | Any random text, 32+ characters (keeps logins secure) |

Wynn logs in with the **Log in** button using the username and password above.
Redeploy after adding or changing variables. To change the password later, change `OWNER_PASSWORD`
and redeploy. Changing `SESSION_SECRET` logs everyone out.

## 2. Deploy

**Option A (most reliable): GitHub, then Netlify.** Upload this folder to a new GitHub repo
(Add file > Upload files), then in Netlify choose Add new site > Import an existing project.
Settings come from `netlify.toml`, so just deploy. Add the variables, then Trigger deploy.

**Option B: Netlify CLI.** `npm install`, then `npm install -g netlify-cli`, then `netlify deploy --prod`.

**Option C: drag and drop** the folder onto https://app.netlify.com/drop. The login and orders need
the one dependency (`@netlify/blobs`) to be installed on deploy. If the site says something went
wrong when logging in, use Option A.

## 3. First things Wynn should do

1. Log in, open **Dashboard > Shop settings**.
2. Fill in PayPal, Cash App, the slots left and the **return address**, then Save.
3. Go to **Gallery** and upload artwork (big photos are shrunk automatically).
4. Edit prices in `public/menu.js` (they are examples).

## How orders and tracking work

1. A customer fills in the **Order** page. They choose where the art goes: **mail** (full address),
   or a **station meetup** (Houston, Pearland and Galveston area only; the form and Terms say so).
   or a **digital copy** (a scan or photo emailed to them; not for keychains or ita bags).
2. They get an order ID like `WN-K7QM2P` and can look it up on the **Track order** page with their email.
3. Wynn sees every request in **Dashboard > Orders** (address, station, details, references) and
   changes the status: Received, Accepted, Being made, Ready, Shipped, Delivered, Cancelled.
   Each change can include a note that the customer sees.
4. When shipping, Wynn picks the carrier (USPS, UPS, FedEx) and pastes the tracking number.
   The customer sees a "Track package" button on their order page.
5. The **return address** from Shop settings is shown only to customers after they look up their own
   order, so your home address is not public. It also shows on the order confirmation.

### Getting shipping labels and tracking numbers

- **PayPal:** if you get paid through PayPal, use PayPal Shipping (paypal.com/shipping) to print
  discounted USPS, UPS labels from a paid transaction.
- **USPS Click-N-Ship** (usps.com) lets you print labels and schedule a free pickup.
- **Pirate Ship** (pirateship.com) is free to use and has low USPS and UPS rates.
- Every label comes with a tracking number. Copy it into the order in the dashboard.
- For station meetups, set the order to Ready, agree on a time by email, then mark it Delivered.

## Suggestion box

Anyone can send suggestions from the **Suggestions** page (name is optional). Wynn reads, marks as
done and deletes them in **Dashboard > Suggestions**.

## Lofi music

A music bar is docked at the bottom of every page and keeps playing while visitors move between pages.
It plays MP3 files from the site's own `public/music` folder, so there are no YouTube restrictions.
Use only music you are allowed to use commercially (Pixabay Music, FreePD, or tracks whose license
says free to use), and credit the artist when the license asks for it.

1. Put your MP3 files in `public/music/` (about 2 to 4 MB each keeps the site fast).
2. Open `public/music/tracks.json` and list them, one entry per track:
   `{ "file": "dreamy.mp3", "title": "Dreamy", "artist": "Artist name", "link": "https://where-you-got-it" }`
3. Deploy again. The music button and bar only appear when the list has at least one track.

Browsers do not allow music to start by itself, so visitors press play first.
