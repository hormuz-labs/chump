# Contributing: add your own politician

Got a head that deserves a knock? Here's how to add one. Budget about an hour, most of it spent finding a quote that is real, sourced and still unbelievable.

## The ground rules

These are not optional. Satire only works when it's true.

1. **Every quote must be real.** Check it against a transcript, video or a major outlet: exact wording, date and setting. No paraphrases, no "he basically said". If you can't source it, it doesn't go in.
2. **Public figures only**, in their public role. No private individuals, no families, no medical speculation about real people. The joke is what they *said*, not who they *are*.
3. **Photos and audio must be free to use.** Portraits: public domain or CC0 (US government and Wikimedia Commons are good sources). Audio: public-domain recordings such as White House or National Archives video.
4. **Punch up, not down.** Pick people with power and a record. Keep the contents of the head silly and harmless. No slurs, no gore.
5. Be equal-opportunity. A politician from any party, any country, is fair game as long as rule 1 holds.

## Setup

```bash
git clone https://github.com/hormuz-labs/chump.git
cd chump
npm install
npm run dev        # http://localhost:8765
```

The image tools are a separate Python lab. Make a venv and install them once:

```bash
python -m venv .venv && source .venv/bin/activate
pip install rembg onnxruntime "mediapipe==0.10.14" opencv-python numpy pillow
```

(`mediapipe` has to be a version that still ships `mp.solutions`. Newer releases removed it, and the tools will crash with a very unhelpful error.) The first run downloads a roughly 176 MB segmentation model.

## Step by step

Below, `<id>` is a short lowercase slug, like `sunak` or `macron`.

### 1. Add the portrait

Save a front-facing, well-lit portrait as `public/img/<id>.jpg`. Roughly 1100 × 1400 works well: the face should be upright, centred, and not cropped at the top of the head. Official portraits are ideal.

### 2. Tell the tools about the new person

The scripts default to the five existing people. Pass your id explicitly so the others aren't regenerated:

```bash
python tools/heads.py <id>      # finds the skull; writes public/img/masks/<id>-lid.png and <id>-hole.png
python tools/cutout.py <id>     # splits head and body; writes public/img/cut/<id>-head.webp and -body.webp
python tools/faces.py <id>      # shock and wince faces; writes public/img/faces/<id>-shock.webp and -wince.webp
```

Run them **in that order**, because each reads what the previous one writes into `src/heads.json`. After these three, `src/heads.json` has a new `<id>` entry with the head's position (`cx`, `rx`, `top`, `cut`, `roll`), the face box and the neck pivot.

> `tools/heads.py` rewrites `src/heads.json`. If it overwrites entries for existing people, run `git diff src/heads.json` and restore anything you didn't mean to change.

If the result looks off (the cap lifts at the wrong height, a rim of hair is missing), open `src/heads.json` and nudge the numbers. They are percentages of the image. `cut` is the forehead line where the cap lifts, so raise or lower it until the lid looks right.

### 3. Pick what's inside the head

`inside` is one of the existing objects:

| `inside` | What it is |
| --- | --- |
| `bucket` | A bucket of peanuts |
| `cat` | A cat, doing what cats do |
| `bottle` | A water bottle |
| `germs` | An E. coli colony |
| `bomb` | A bomb with a red line |

Reusing one of these is the easy path. If you want something new, you'll need to:

1. Cut it out of a free photo: add a job to `tools/objects.py` and run `python tools/objects.py <source-folder>`. It writes `public/img/objects/<name>.webp`.
2. Add the new value to the `Inside` type in `src/data.ts`.
3. Add its X-ray image to the `XRAY` map in `src/pages/index.astro`.
4. Render it in the head's `.hollow` block in the same file (copy how `bucket` or `bottle` is done), and add any knock animation in `src/scripts/site.ts` and `src/styles/site.css`.

### 4. Add the entry in `src/data.ts`

Add an object to the `people` array, copying an existing one:

```ts
{
  id: 'sunak',
  name: 'Full Name',
  short: 'Sunak',
  role: 'Their actual job title',
  handle: '@theirhandle',                 // optional
  photo: '/img/sunak.jpg',
  head: head('sunak'),                    // reads src/heads.json
  inside: 'bottle',
  tone: '#f0a23c',                        // backdrop colour behind the cut-out
  listing: {
    title: 'FOR LEASE · Some property pun',
    lines: ['Four short lines.', 'Estate-agent voice.', 'Something about the acoustics.', 'Previous tenant: whatever is inside.'],
  },
  scan: [NO_BRAIN, ['Contents', 'What the scanner finds']],
  quotes: [
    {
      kind: 'transcript',
      text: 'The exact words, as spoken.',
      source: 'Event, Place · Mon D, YYYY',
      punch: 'The short bit that pops out of the head.',
    },
  ],
},
```

Quote `kind`s you can use: `post` (a social post), `chat` (a group chat), `tv` (an interview or broadcast), `transcript` (a speech or debate) and `stat` (a number with a source). See the `Medium` type at the top of `src/data.ts` for the exact fields.

- `punch` has to be a **verbatim** fragment of the quote.
- Aim for **8 to 12 quotes**. Each knock moves to the next card.
- `source` is where and when it was said, and it's shown on the card, so make it checkable.

### 5. Add a real voice clip (optional, but it's the best part)

Only for recordings in the public domain. Add an entry to `tools/clips.py` with the video id, a time window around the moment and the phrase, then:

```bash
pip install faster-whisper yt-dlp
python tools/clips.py <cache-folder> <id>-quotename
```

It downloads the audio, transcribes it, finds your phrase, cuts it into `public/audio/<id>-quotename.mp3` and writes word timings to a `.json` next to it. Hook it up to the quote with `audio: '/audio/<id>-quotename.mp3'`.

### 6. Check it

```bash
npm run build      # must pass with no errors
npm run dev
```

Open `http://localhost:8765/#<id>` and check each of these:

- The head knocks, then the cap flies off and lands on screen.
- The X-ray lens shows what's inside, and nothing is cropped or green.
- Every quote card reads cleanly and the source line is correct.
- Audio plays and the captions stay in sync (if you added clips).
- It works at phone width.

## Opening the pull request

- One politician per PR.
- In the description, **link a source for every quote** (transcript, video timestamp or article), and name the licence for each photo and audio clip.
- Include a screenshot of the opened head.
- Commit messages: short, imperative, no fuss.

If a quote can't be sourced, or a reviewer can't find it, the PR waits. That's not personal. It's the whole point of the site.

## Not adding a person?

Bug fixes, new things to put inside heads, better icons and funnier README jokes are all welcome. For code changes, run `npm run build` first.
