# Karotz

Drive your Karotz rabbit from Gladys, locally: speech, sounds and web radios,
LED, ears, camera, sleep and RFID tags. No account, no cloud.

## Before you start

- Your Karotz must run one of these systems:
  - **Terrier OS** ([install guide](https://terrier.cyberloutre.fr/karotz)),
    built on LapinLibre. It is the safest choice: WPA3 Wi-Fi, SSH by key only,
    a web page protected by a password;
  - **[LapinLibre](https://github.com/sweetlilmre/LapinLibre)**, a free system
    for the Karotz, built from its sources;
  - **OpenKarotz**, on the original firmware or on top of
    [Free Rabbits OS](https://www.freerabbits.nl/fros/) (WPA2 only).

  All three serve the same local API, the OpenKarotz one: the integration
  drives them the same way. Quick check: open `http://<rabbit-address>/` in a
  browser, you should see the web page of the rabbit.

- The rabbit and Gladys must be on the **same local network**.
- Give the rabbit a **fixed IP address** (Free Rabbits OS only supports that
  anyway), or reserve it in your router.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **rabbit address**: its IP address (e.g. `192.168.1.70`) or its
   host name. Several rabbits: separate them with commas.
3. **LapinLibre or Terrier OS**: enter the **web password**, the one the web
   page of the rabbit asks for (user `admin`). Terrier OS writes it in
   `web-password.txt` on its install USB key. Several rabbits with different
   passwords: separate them with spaces. Leave the field empty for OpenKarotz.
4. Save, then open the **Discovery** tab: the rabbit shows up, along with its
   camera. Add them.

You do not know its address? A Karotz does not announce itself on the network,
but the integration can look for it. Click **Search my network**, without
typing anything: Gladys spots your local network from the devices that announce
themselves on it (router, TV, NAS…), then the integration asks its 254
addresses and lists the rabbits that answered. Copy the address into the field
and save.

The search never sends your password to the devices of the network. A
LapinLibre or Terrier OS rabbit protected by a password therefore shows up
apart, as an address that "asks for a password": add it, then use **Test the
connection**.

If the network could not be worked out, the button says so: enter the first
three numbers of your local addresses (e.g. `192.168.1`) in the **Local
network** field and search again.

The other settings:

- **Refresh interval** — how often the rabbit is read (60 s by default). A
  Karotz is a small machine: there is no point going much lower.
- **Default voice** — the voice identifier used when the rabbit speaks, as
  listed in the Karotz web page (on recent firmwares, a number: `5` US English
  male, `6` female, `7` and `8` British English…). Empty: the rabbit's own
  default.
- **Camera** — adds a camera device per rabbit.

## Devices

Each rabbit becomes a device, recognized by its MAC address: it keeps its
history, scenes and dashboards when its IP address changes.

| Feature                  | What you can do                          |
| ------------------------ | ---------------------------------------- |
| Awake                    | wake the rabbit up or put it to sleep    |
| LED, LED color           | turn on, turn off, pick the color        |
| LED pulse                | steady or pulsing light                  |
| Left / right ear         | position from 0 to 16                    |
| Volume                   | 0 to 100 %, when your firmware offers it |
| Storage, USB key         | percentage used                          |
| RFID tags                | number of recorded tags                  |
| Camera (separate device) | a fresh picture on demand                |

## Configuration buttons

- **Test the connection** — asks every rabbit and shows its version and state.
- **Search my network** — see above.
- **Identify a rabbit** — the chosen rabbit pulses blue and moves its ears for
  a few seconds.
- **Restart a rabbit** — it is back after about a minute.

A success is shown in green, a failure in red.

## Scenes

The integration adds its own cards to the scene editor (Gladys 5.1 or later).

**Actions**

- **Make the rabbit speak** — a sentence, with the voice of your choice. Scene
  variables can be used in it.
- **Play a sound or a radio** — the identifier of a sound stored on the rabbit,
  or the `http://` address of an MP3 or a web radio.
- **Stop the radio**.
- **Play a mood** — a random one, or by its number.
- **Tell the time**.
- **Set the LED** — hexadecimal color (`FF0000` for red), steady or pulsing,
  with a second color and a speed.
- **Move the ears** — to a position, at random, or back to rest.
- **Take a picture** — it becomes the image of the camera device: follow with
  Gladys' "send a camera image" action to receive it.

Waking up, putting to sleep, turning the LED on: these are device features, use
the standard "Control a device" action.

**Triggers**

- **Rabbit unreachable** / **Rabbit back online**.
- **Rabbit fell asleep or woke up** — when it changes by itself (rabbit web
  page, internal schedule), not when Gladys commands it.
- **New RFID tag recorded** — with the identifier, name and color of the tag as
  variables.

## Dashboard widgets

- **Karotz** — state of the rabbit, storage, tag count, and four buttons:
  speak (a small form opens), mood, tell the time, sleep. When it sleeps, a
  single button: wake it up.
- **Karotz camera** — the last picture, a button to take a new one and a button
  to delete the pictures stored on the rabbit.

With several rabbits, pick which one to show in the widget settings.

## Limits

- **Presenting an RFID tag to the rabbit does not trigger a scene.** OpenKarotz
  reacts to a tag by calling a web address from the rabbit, and a Gladys
  integration cannot be called that way. The available trigger is about a _new_
  tag being recorded.
- **On OpenKarotz, every picture stays on the rabbit**, whose storage is
  small. Delete them from time to time with the button of the camera widget. On
  LapinLibre and Terrier OS, the rabbit keeps the last 10 in memory and forgets
  them when it restarts.
- **A sleeping rabbit refuses** LED, ears, sounds and speech: wake it up first
  (in a scene, start with the "Control a device" action).
- Speech relies on the text-to-speech service configured in your rabbit, which
  needs the Internet: if the rabbit stops speaking, test from its web page. On
  LapinLibre and Terrier OS, that server is set in `lapinlibre.txt` (`SERVER=`
  or `TTS_SERVER=`): without it, the rabbit refuses to speak and the
  integration tells you so.
- **The API of the rabbit speaks plain HTTP**, whatever its system. On
  LapinLibre and Terrier OS, the web password therefore travels readable on
  your local network: WPA3 protects it on the Wi-Fi, not on the cable between
  the router and Gladys. Keep the rabbit on a network you trust.
- **A Karotz on Terrier OS stays a rabbit of Le Terrier**: Le Terrier and Gladys
  can drive it at the same time. When both talk to it at the same instant, it
  answers that it is busy: try again.

## Troubleshooting

- **"No answer"** — is the rabbit powered? Does its web page open from a
  computer on the same network? Did its address change?
- **"Asks for a web password"** — the rabbit runs LapinLibre or Terrier OS:
  enter the password of its web page in the configuration.
- **"Web password refused"** — none of the passwords entered is the right one.
  Check it by opening the web page of the rabbit (user `admin`).
- **"The rabbit is busy"** — another command, from Le Terrier for instance, was
  using it at that instant: try again.
- **The rabbit does not show up in Discovery** — it must have answered at least
  once: use **Test the connection**.
- **No Volume feature** — your firmware does not have that setting; this is
  expected on the original OpenKarotz and on LapinLibre.

Not affiliated with Violet, Mindscape, OpenKarotz, Free Rabbits, LapinLibre or
Le Terrier.
