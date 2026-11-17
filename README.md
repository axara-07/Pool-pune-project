# PoolPune – full-stack ride pooling for Pune

Needs only **Node.js 18+** (https://nodejs.org). No `npm install` – there are no packages.

## Run
    cd poolpune
    node backend/server.js
Open http://localhost:3000 (it opens the login page).  (internet needed for map pictures and the first road-distance download).

Test the logic:  `npm test`  (or `node backend/test.js` and `node backend/test-safety.js`)

## How rides work (drivers choose)
1. A **rider** posts a request: from, to, passengers (you + friends), and whether others may join along the way (and how much extra distance is OK).
2. Online **drivers** see the request pop up. Nothing is assigned automatically.
3. The driver chooses:
   - **one ride**, or
   - **two rides that fit together** (the dashboard suggests good combinations and shows each rider's fare and extra distance), or
   - while already driving, **adds more rides** that fit the route: as many as the seats allow. The driver sees EVERY waiting request; each is marked *On your route* (pickup and drop-off both on the road you take anyway), *Drop-off a little beyond your destination* (up to 8 km past your last stop), or greyed out with the reason it doesn't fit.
4. Everyone in the car must allow sharing, nobody's detour limit may be broken, and seats in use may never exceed the vehicle (Hatchback 4, Sedan 4, SUV 6, Auto 3).
5. The driver taps "I picked up..." / "I dropped off..." at each stop. Riders see progress live.
6. Fare = Rs 40 + Rs 12/km. A pooled trip is priced once and split by each rider's solo distance (never above their solo fare). The first rider's fare drops when a second rider is added.

To test alone: use 3 browser windows (one driver, two riders), e.g. one normal and two private windows.

## Safety features (for every rider and driver, not only women)
| Feature | What it does |
|---|---|
| **Ride PIN (start OTP)** | Each ride gets a 4-digit PIN shown only to the rider (and sent to their phone by SMS). The driver must type it to start the pickup, so nobody gets into the wrong car. 5 wrong tries = 1 minute wait. |
| **End-of-ride OTP** | When the rider is picked up, a new 4-digit OTP appears in their app (and by SMS). At drop-off the driver must enter it to finish the ride, so a ride can't be closed early or by mistake. Same 5-tries lock. |
| **SOS button** | A red button appears for riders and drivers during a trip. It sends a **real SMS** to the person's emergency contacts (their phone location as a map link if the browser allows GPS, the live trip link, vehicle and plate) and alerts the safety team. The result shows how many SMS were delivered, plus SMS / WhatsApp / Call buttons to message the contacts from your own phone as a backup. Double taps do not spam. "I'm safe" cancels it and tells the contacts. |
| **Emergency contacts** | Up to 3 trusted contacts per account (Safety settings panel). Contacts need no account. |
| **Share live trip** | Rider creates a private link (`track.html?t=...`) showing driver, vehicle, number plate, car position and route. It stops working when the ride ends. No email or phone is ever shown. Can be sent to contacts in one tap. |
| **Automatic check-in** | If a rider is on board and no stop is reached for 20 minutes, the app asks "Are you OK?". No answer in 3 more minutes = an alert is raised for them. The server does this itself, so it works even if the phone is silent. |
| **Matching preferences** | Optional gender in sign-up / Safety settings. A rider can choose "only riders of my gender" and/or "only drivers of my gender". Drivers never see why a rider is hidden and other users never see anyone's gender. Works for every gender, not only women. |
| **Report and block** | After a ride, riders can report the driver or a co-rider and drivers can report a rider. By default the reporter is never matched with that person again. |
| **Safety-team console** | `http://localhost:3000/admin.html`. Shows SOS, missed check-ins and reports with location, vehicle and contacts notified; staff can resolve them. Needs the key printed when the server starts (set `ADMIN_KEY` to choose your own). |

Settings (environment variables, all optional):
- `ADMIN_KEY` – key for the safety-team console (random each start if not set)
- `PUBLIC_URL` – address used in links sent to contacts, e.g. `https://poolpune.example.com` (default: the address the request came to; `localhost` links only work on your own computer)
- **Real SMS** (pick ONE provider; with none set the app is in DEMO mode and messages are only printed in the server console):
  - Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` (your Twilio number) or `TWILIO_MESSAGING_SERVICE_SID`. A free trial account can only text numbers you have verified in the Twilio console.
  - Fast2SMS (India): `FAST2SMS_API_KEY` (uses the quick-SMS route; check Fast2SMS for current pricing and requirements).
  - Any other service: `SMS_WEBHOOK_URL` gets a POST of `{"to":"+91...","text":"..."}`.
  The server prints which mode it is in when it starts. Each message's result (`sent`, `failed` or `demo`) is saved on the alert and shown in the safety-team console.
  Example (Windows PowerShell): `$env:TWILIO_ACCOUNT_SID="AC..."; $env:TWILIO_AUTH_TOKEN="..."; $env:TWILIO_FROM="+1..."; node backend/server.js`
  Example (Mac/Linux): `TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1... node backend/server.js`
- `SAFETY_CHECKIN_MS` / `SAFETY_GRACE_MS` – check-in timing (defaults 1200000 and 180000). Use small values like `20000` to try it quickly.
- `POOLPUNE_DATA` – folder for data files (used by the tests)

Honest limits: this is a demo. Real SMS only goes out once you configure a provider above, the licence and phone number are not verified, and the car position is "the last stop the driver confirmed", not GPS. The SOS button does not replace calling **112** (the app shows a Call 112 button).

## Accounts
- **Rider** and **Driver** sign-up/login (passwords hashed with scrypt, HttpOnly cookie for 7 days, 5 wrong passwords = 1 minute lock).
- Licence numbers are NOT verified; this is a demo.
- Data files in backend/data: users.json (also holds gender, emergency contacts, blocked people), sessions.json, market.json (requests, trips and safety alerts). Delete them to reset. Accounts and data from older versions keep working.

## Folders
    backend/server.js        HTTP server + API routes + serves the frontend
    backend/lib/data.js      104 real Pune areas (lat/lng) and the roads between them
    backend/lib/graph.js     graph, Dijkstra, real road km from OpenStreetMap (cached in data/roads.json)
    backend/lib/market.js    requests, offers, accept, add a second ride, advance stops, fares
    backend/lib/auth.js      accounts, hashing, sessions
    backend/lib/sms.js       sends real SMS (Twilio / Fast2SMS / webhook), demo mode otherwise
    backend/lib/safety.js    SOS, trip sharing, check-ins, reports, safety-team alerts
    backend/lib/store.js     driver entities
    backend/test.js          pooling tests:  node backend/test.js
    backend/test-safety.js   safety tests:   node backend/test-safety.js
    frontend/login.html      login + sign-up for riders and drivers
    frontend/index.html      rider page (js/app.js, js/live.js)
    frontend/driver.html     driver dashboard (js/driver.js)
    frontend/js/safety.js    safety settings, SOS, share and report dialogs (rider + driver)
    frontend/track.html      public live-trip page for emergency contacts (js/track.js)
    frontend/admin.html      safety-team console (js/admin.js)

## API
    Auth:    POST /api/auth/register-rider | register-driver | login | logout    GET /api/auth/me    GET /api/areas
    Rider:   POST /api/requests {pickup,drop,seats,share,maxDetour}   GET /api/requests/mine   POST /api/requests/cancel
    Driver:  GET /api/driver/me (profile, trip, offers, pairs)   POST /api/driver/status {online,area}
             POST /api/driver/accept {requestIds:[1] or [1,2]}   POST /api/driver/add {requestId}
             POST /api/driver/advance   POST /api/driver/cancel-trip
    Safety:  GET /api/safety/me   POST /api/safety/profile {gender,contacts:[{name,phone}]}   POST /api/safety/share {sendToContacts}
             POST /api/safety/sos {note, geo:{lat,lng}}   POST /api/safety/cancel-alert   POST /api/safety/checkin-ok   POST /api/safety/report {requestId,reason,about,details,block}
             GET /api/track/<token> (public)   GET /api/admin/alerts  POST /api/admin/resolve {id,note}  (header x-admin-key)
             Requests also accept coRider and driverPref: "any" | "same".  POST /api/driver/advance takes {pin}: the ride PIN at pickups and the end-of-ride OTP at drop-offs.
    Map:     GET /api/graph   GET /api/distances   GET /api/drivers
